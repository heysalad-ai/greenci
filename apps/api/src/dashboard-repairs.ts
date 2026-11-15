import { GitHubAppClient } from '@greenci/github';
import { copy, loadConfig, runSchema } from '@greenci/core';
import { RunRepository } from '@greenci/db';
import {
  githubFor,
  workspaceGithub,
  probeBetaProviders,
} from '@greenci/worker';
import { invitedIdentity } from './invite-auth.js';
import type { ApiEnv } from './env.js';
const c = copy.dashboardRepair;
import {
  startRepairSchema,
  inspectRepair,
  terminalDashboardStates,
} from './repair-profile.js';
export async function repairOptions(env: ApiEnv, org: string) {
  const config = loadConfig(env),
    github = githubFor(env);
  const connected = org.startsWith('invite-')
    ? (
        await env.DB.prepare('SELECT repo FROM beta_connections WHERE org_id=?')
          .bind(org)
          .all<{ repo: string }>()
      ).results.map((r) => r.repo)
    : await github.repos();
  const identity = org.startsWith('invite-')
    ? await env.DB.prepare(
        'SELECT u.login FROM users u JOIN memberships m ON u.id=m.user_id WHERE m.org_id=?',
      )
        .bind(org)
        .first<{ login: string }>()
    : null;
  const repos = connected
    .filter((repo) => org.startsWith('invite-') || repo.split('/')[0] === org)
    .slice(0, 20);
  const options = [];
  for (const repo of repos) {
    try {
      const scopedGithub = await workspaceGithub(env, org, repo);
      const row = await env.DB.prepare(
        'SELECT default_branch FROM repos WHERE full_name=? AND org_id=?',
      )
        .bind(repo, org)
        .first<{ default_branch: string }>();
      const branch =
        scopedGithub instanceof GitHubAppClient
          ? (await scopedGithub.metadata(repo)).default_branch
          : (row?.default_branch ?? 'main');
      options.push({
        ...(await inspectRepair(
          scopedGithub,
          repo,
          branch,
          identity?.login || config.BETA_OWNER_LOGIN || 'sam',
        )),
        available: true,
        reason: '',
      });
    } catch (error) {
      const message =
        error instanceof Error &&
        Object.values(c).some((value) => value === error.message)
          ? error.message
          : c.unavailable;
      options.push({
        repo,
        branch: '',
        sha: '',
        check: '',
        available: false,
        reason: message,
      });
    }
  }
  return options;
}
export async function dashboardRuns(env: ApiEnv, org: string) {
  // Reconcile terminal runs even if a Worker stopped after recording its final state.
  await env.DB.prepare(
    `UPDATE dashboard_repairs SET active=0 WHERE org_id=? AND id IN (SELECT id FROM runs WHERE org_id=? AND state IN ('pr_open','merged','handed_back','stopped','out_of_scope','not_verified'))`,
  )
    .bind(org, org)
    .run();
  const rows = await env.DB.prepare(
    'SELECT id FROM dashboard_repairs WHERE org_id=? ORDER BY created_at DESC LIMIT 20',
  )
    .bind(org)
    .all<{ id: string }>();
  const repository = new RunRepository(env.DB);
  return Promise.all(
    rows.results.map(async (row) => (await repository.get(row.id, org)).run),
  );
}
export async function startDashboardRepair(
  env: ApiEnv,
  org: string,
  userId: string,
  input: unknown,
) {
  const config = loadConfig(env),
    body = startRepairSchema.parse(input),
    id = `dashboard-${org}-${body.requestId}`;
  if (!org.startsWith('invite-') && body.repo.split('/')[0] !== org)
    throw new Error(c.notConnected);
  const identity = userId.startsWith('github:')
    ? await invitedIdentity(env, userId)
    : null;
  const existing = await env.DB.prepare(
    'SELECT id,repo,head_sha,user_id FROM dashboard_repairs WHERE id=? AND org_id=?',
  )
    .bind(id, org)
    .first<{ id: string; repo: string; head_sha: string; user_id: string }>();
  if (
    existing &&
    (existing.repo !== body.repo ||
      existing.head_sha !== body.sha ||
      existing.user_id !== userId)
  )
    throw new Error(c.stale);
  if (!existing) {
    const github = await workspaceGithub(env, org, body.repo);
    if (!(await github.repos()).includes(body.repo))
      throw new Error(c.notConnected);
    const row = await env.DB.prepare(
      'SELECT org_id,default_branch FROM repos WHERE full_name=?',
    )
      .bind(body.repo)
      .first<{ org_id: string; default_branch: string }>();
    if (!row || row.org_id !== org) throw new Error(c.notConnected);
    const branch =
      github instanceof GitHubAppClient
        ? (await github.metadata(body.repo)).default_branch
        : row.default_branch;
    const inspected = await inspectRepair(
      github,
      body.repo,
      branch,
      identity?.login || config.BETA_OWNER_LOGIN || 'sam',
    );
    if (inspected.sha !== body.sha) throw new Error(c.stale);
    // Source-only beta profile. Repo-level automation settings are never modified.
    if (identity) {
      const count = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM dashboard_repairs WHERE org_id=? AND created_at>?',
      )
        .bind(org, new Date(Date.now() - 86400000).toISOString())
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= 2) throw new Error(copy.inviteBeta.quota);
    }
    const run = runSchema.parse({
      id,
      repo: body.repo,
      orgId: org,
      headSha: body.sha,
      branch,
      failingCheckName: inspected.check,
      startedBy: 'web',
      rules: {
        autoMode: true,
        autoRepair: true,
        autoOpenPr: true,
        allowWorkflows: false,
        maxDiffLines: 100,
        protectedPaths: [
          'migrations/**',
          '.github/**',
          'test.mjs',
          'package*.json',
        ],
      },
    });
    try {
      await new RunRepository(env.DB).create(run, userId);
    } catch {
      // D1 batch admission is atomic: no orphan slot or run survives a conflict.
      const duplicate = await env.DB.prepare(
        'SELECT repo,head_sha,user_id FROM dashboard_repairs WHERE id=? AND org_id=?',
      )
        .bind(id, org)
        .first<{ repo: string; head_sha: string; user_id: string }>();
      if (
        !duplicate ||
        duplicate.repo !== body.repo ||
        duplicate.head_sha !== body.sha ||
        duplicate.user_id !== userId
      )
        throw new Error(c.busy);
    }
  }
  const run = (await new RunRepository(env.DB).get(id, org)).run;
  if (terminalDashboardStates.includes(run.state)) return run;
  // Creating the same workflow ID twice must not create a second run or model job.
  try {
    await (await env.RUN_WORKFLOW.get(id)).status();
  } catch {
    if (config.APP_ENV === 'dev') {
      await probeBetaProviders(config);
      await env.SESSIONS.put('beta:providers-ready', 'dashboard', {
        expirationTtl: 3600,
      });
    }
    await env.RUN_WORKFLOW.create({
      id,
      params: { runId: id, dashboard: true },
    });
  }
  return (await new RunRepository(env.DB).get(id, org)).run;
}
