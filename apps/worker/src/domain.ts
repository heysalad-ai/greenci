import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import {
  actionSchema,
  transition,
  loadConfig,
  runSchema,
  diagnosisSchema,
  copy,
  safePath,
  redact,
  notificationPolicy,
  needsApproval,
  type Run,
  type DomainEvent,
} from '@greenci/core';
import { RunRepository } from '@greenci/db';
import { MockGitHubClient, type GitHubClient } from '@greenci/github';
import { SdkAgentProvider } from '@greenci/agent';
import { routeDecision, answerValue } from './decisions.js';
export interface RunEnv {
  [key: string]: unknown;
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  ORG_ROOMS: DurableObjectNamespace;
}
export function githubFor(env: RunEnv): GitHubClient {
  const config = loadConfig(env);
  if (config.APP_ENV !== 'local' || config.GITHUB_MODE !== 'mock')
    throw new Error(
      'GitHub App execution requires the configured M7 integration',
    );
  return new MockGitHubClient(config.MOCK_GITHUB_URL);
}
export async function applyEvent(
  env: RunEnv,
  id: string,
  event: DomainEvent,
  key: string,
) {
  const repository = new RunRepository(env.DB),
    current = await repository.get(id);
  if (
    await env.DB.prepare('SELECT id FROM run_events WHERE id=?')
      .bind(key)
      .first()
  )
    return current.run;
  const result = transition(current.run, event);
  await repository.save(
    result.run,
    current.version,
    key,
    event.type,
    result.effects,
  );
  await publishRun(env, result.run, key);
  return result.run;
}
export async function publishRun(env: RunEnv, run: Run, key: string) {
  const at = new Date().toISOString();
  const response = await env.ORG_ROOMS.get(
    env.ORG_ROOMS.idFromName(run.orgId),
  ).fetch('https://room/publish', {
    method: 'POST',
    body: JSON.stringify({
      id: key,
      type: 'run.updated',
      payload: { run },
      at,
    }),
  });
  if (!response.ok) throw new Error('Live event unavailable');
  let urgency = 'toast';
  try {
    const answers = await routeDecision(
      env,
      run,
      'urgency',
      { state: run.state },
      {
        urgency: ['merged', 'pr_open'].includes(run.state)
          ? 'digest'
          : run.state === 'needs_you' || run.state === 'failing'
            ? 'page now'
            : 'toast',
      },
    );
    urgency = String(answerValue(answers, 'urgency'));
  } catch {
    /* No push on unavailable routing; deterministic quiet-hours policy still wins. */
  }
  const policy = notificationPolicy({
    state: run.state,
    watched: true,
    branch: run.branch,
    pageMeBranches: run.rules.pageMeBranches,
    hour: new Date().getUTCHours(),
  });
  await env.DB.prepare(
    'INSERT OR IGNORE INTO notifications (id,run_id,channel,kind,suppressed_reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(
      key,
      run.id,
      'toast',
      run.state,
      policy.reason ?? (urgency === 'digest' ? 'daily_summary' : null),
      at,
      at,
    )
    .run();
}
export async function domainWorkflow(
  env: RunEnv,
  event: WorkflowEvent<{ runId: string }>,
  step: WorkflowStep,
) {
  const repository = new RunRepository(env.DB),
    id = event.payload.runId;
  let run = runSchema.parse(
    await step.do('Load run', async () => (await repository.get(id)).run),
  );
  let sequence = 0;
  for (;;) {
    if (['merged', 'handed_back', 'stopped', 'pr_open'].includes(run.state))
      return { id, state: run.state };
    const n = ++sequence;
    const autoAction =
      run.state === 'failing' && run.rules.autoMode
        ? 'diagnose'
        : run.state === 'diagnosed' && run.rules.autoRepair
          ? 'repair'
          : run.state === 'repaired' && !run.verified && run.rules.autoRepair
            ? 'verify'
            : null;
    const waiting: {
      payload: {
        action: string;
        id: string;
        userId?: string;
        expectedState?: string;
        expectedAttempt?: number;
        expectedVersion?: number;
      };
    } = autoAction
      ? { payload: { action: autoAction, id: `${id}:auto:${n}` } }
      : await step.waitForEvent<{
          action: string;
          id: string;
          userId?: string;
          expectedState?: string;
          expectedAttempt?: number;
          expectedVersion?: number;
        }>(`Wait for key ${n}`, {
          type: run.state === 'needs_you' ? 'approval' : 'action',
          timeout: '7 days',
        });
    const parsed = actionSchema.safeParse(waiting.payload.action);
    if (!parsed.success) continue;
    run = runSchema.parse(
      await step.do(
        `Apply key ${n}`,
        { retries: { limit: 2, delay: '1 second' } },
        async () => {
          const current = await repository.get(id);
          if (
            waiting.payload.expectedVersion !== undefined &&
            waiting.payload.expectedVersion !== current.version
          )
            return current.run;
          if (
            (waiting.payload.expectedState &&
              waiting.payload.expectedState !== current.run.state) ||
            (waiting.payload.expectedAttempt !== undefined &&
              waiting.payload.expectedAttempt !== current.run.attempts)
          )
            return current.run;
          if (
            waiting.payload.userId &&
            !(await env.DB.prepare(
              'SELECT id FROM memberships WHERE user_id=? AND org_id=?',
            )
              .bind(waiting.payload.userId, current.run.orgId)
              .first())
          )
            return current.run;
          try {
            transition(current.run, { type: parsed.data });
          } catch {
            return current.run;
          }
          if (['approve', 'changes', 'take_over'].includes(parsed.data))
            await env.DB.prepare(
              'UPDATE approvals SET decided_by=?,decision=?,decided_at=?,updated_at=? WHERE id=? AND decision IS NULL',
            )
              .bind(
                waiting.payload.userId ?? 'operator',
                parsed.data,
                new Date().toISOString(),
                new Date().toISOString(),
                current.run.approvalId ??
                  `${id}:${current.run.attempts}:review`,
              )
              .run();
          return applyEvent(env, id, { type: parsed.data }, waiting.payload.id);
        },
      ),
    );
    if (run.state === 'diagnosing')
      run = runSchema.parse(
        await step.do(
          `Diagnose ${n}`,
          { retries: { limit: 2, delay: '1 second' } },
          async () => {
            const current = (await repository.get(id)).run;
            if (current.state !== 'diagnosing') return current;
            const github = githubFor(env),
              checks = await github.checks(run.repo, run.headSha),
              files: Record<string, string> = {};
            for (const file of (await github.tree(run.repo, run.headSha)).slice(
              0,
              40,
            ))
              files[safePath(file)] = await github.read(
                run.repo,
                run.headSha,
                file,
              );
            const logs = redact(checks.map((check) => check.log).join('\n'))
              .split('\n')
              .slice(-400)
              .join('\n');
            const historyResult = await env.DB.prepare(
              "SELECT c.name,c.log_excerpt AS log FROM checks c JOIN runs r ON r.id=c.run_id WHERE r.repo_id=? AND r.id<>? AND r.branch=(SELECT default_branch FROM repos WHERE id=?) AND c.phase='original' AND c.created_at>=? ORDER BY c.created_at DESC LIMIT 100",
            )
              .bind(
                run.repo,
                run.id,
                run.repo,
                new Date(Date.now() - 7 * 86400_000).toISOString(),
              )
              .all();
            const history = historyResult.results.map((row) => ({
              name: String(row.name),
              log: redact(String(row.log)),
            }));
            const signature = (text: string) =>
              text
                .split('\n')
                .filter((line) =>
                  /not ok|AssertionError|ERR_ASSERTION|Expected|actual:|expected:/.test(
                    line,
                  ),
                )
                .join('\n');
            const recurring = history.some(
              (entry) =>
                entry.name === run.failingCheckName &&
                signature(entry.log) === signature(logs),
            );
            const routing = await routeDecision(
              env,
              run,
              'failure',
              { logs, history },
              {
                infra: run.scenario === 'out_of_scope' ? 0.99 : 0.01,
                category: run.scenario === 'out_of_scope' ? 'infra' : 'code',
                flaky: recurring ? 0.7 : 0.01,
              },
            );
            const traceId =
              run.traceId ?? `trace_${crypto.randomUUID().replaceAll('-', '')}`;
            const traceCurrent = await repository.get(id);
            if (!traceCurrent.run.traceId)
              await repository.save(
                { ...traceCurrent.run, traceId },
                traceCurrent.version,
                `${id}:trace`,
                'agent.trace',
              );
            const provider = new SdkAgentProvider(loadConfig(env));
            const diagnosis =
              Number(answerValue(routing, 'infra')) >= run.rules.infraThreshold
                ? diagnosisSchema.parse({
                    summary: copy.infraReview,
                    file: 'AGENTS.md',
                    line: 1,
                    confidence: 'high',
                    category: 'infra',
                    notAProductBug: true,
                    evidence: [logs.slice(-2000)],
                  })
                : await provider.diagnose({
                    run: { ...run, traceId },
                    logs: `Category: ${String(answerValue(routing, 'category'))}\n${logs}`,
                    files,
                  });
            if (
              Number(answerValue(routing, 'infra')) >= run.rules.infraThreshold
            ) {
              diagnosis.notAProductBug = true;
              diagnosis.category = 'infra';
            }
            await env.ARTIFACTS.put(`${id}/original.log`, logs);
            const next = await applyEvent(
              env,
              id,
              { type: 'diagnosis', diagnosis },
              `${id}:diagnosis:${n}`,
            );
            if (
              next.state === 'diagnosed' &&
              Number(answerValue(routing, 'flaky')) >= run.rules.flakyThreshold
            )
              return applyEvent(
                env,
                id,
                { type: 'review', resume: 'diagnosed' },
                `${id}:flaky:${n}`,
              );
            return next;
          },
        ),
      );
    if (run.state === 'repairing')
      run = runSchema.parse(
        await step.do(
          `Repair ${n}`,
          { retries: { limit: 2, delay: '1 second' } },
          async () => {
            const current = (await repository.get(id)).run;
            if (current.state !== 'repairing') return current;
            const github = githubFor(env),
              files: Record<string, string> = {};
            const tree = await github.tree(run.repo, run.headSha);
            if (tree.length > 2000)
              throw new Error(
                'Repository snapshot exceeds the bounded repair context',
              );
            let bytes = 0;
            for (const path of tree) {
              const content = await github.read(
                run.repo,
                run.headSha,
                safePath(path),
              );
              bytes += content.length;
              if (bytes > 2_000_000)
                throw new Error(
                  'Repository snapshot exceeds the bounded repair context',
                );
              files[path] = content;
            }
            if (!files['AGENTS.md'])
              files['AGENTS.md'] =
                'Push only greenci/* branches. Never merge or approve pull requests. Never read or modify secrets or .env files. Respect protected paths and request approval before modifying workflows.';
            const provider = new SdkAgentProvider(loadConfig(env));
            const stateKey = `${id}/approval-${run.attempts}-${n}.json`;
            const saved =
              run.approved && run.approvalKey
                ? await env.ARTIFACTS.get(run.approvalKey)
                : null;
            const fix = saved
              ? await provider.resume(
                  { run, logs: '', files },
                  await saved.text(),
                )
              : await provider.repair({ run, logs: '', files });
            if (fix.pendingState) {
              await env.ARTIFACTS.put(stateKey, fix.pendingState);
              await env.ARTIFACTS.put(`${stateKey}.diff`, redact(fix.diff));
              await env.DB.prepare(
                'INSERT OR REPLACE INTO approvals (id,run_id,requested_reason,state_key,created_at,updated_at) VALUES (?,?,?,?,?,?)',
              )
                .bind(
                  stateKey,
                  id,
                  'Review the exact SDK tool call before the repair continues',
                  stateKey,
                  new Date().toISOString(),
                  new Date().toISOString(),
                )
                .run();
              return applyEvent(
                env,
                id,
                {
                  type: 'review',
                  resume: 'repairing',
                  approvalKey: stateKey,
                  approvalId: stateKey,
                },
                `${id}:sdk-approval:${n}`,
              );
            }
            const branch = `greenci/fix-${id}-${run.attempts}`;
            await github.branch(run.repo, run.headSha, branch);
            const sha = await github.push(
              run.repo,
              branch,
              fix.files,
              run.rules,
            );
            const comparison = await github.compare(run.repo, run.headSha, sha);
            await env.ARTIFACTS.put(
              `${id}/fix-${run.attempts}.diff`,
              redact(comparison.diff),
            );
            const at = new Date().toISOString();
            await env.DB.prepare(
              'INSERT OR IGNORE INTO fixes (id,run_id,attempt,diff_key,files_changed,additions,deletions,touches_protected,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            )
              .bind(
                run.approvalId ?? `${id}:${run.attempts}:review`,
                id,
                run.attempts,
                `${id}/fix-${run.attempts}.diff`,
                JSON.stringify(comparison.files),
                comparison.additions,
                comparison.deletions,
                needsApproval(
                  comparison.files,
                  comparison.additions + comparison.deletions,
                  run.rules,
                )
                  ? 1
                  : 0,
                at,
                at,
              )
              .run();
            await env.ARTIFACTS.put(`${id}/fix-${run.attempts}.sha`, sha);
            const repaired = await applyEvent(
              env,
              id,
              {
                type: 'fix',
                files: comparison.files,
                diffLines: comparison.additions + comparison.deletions,
                branch,
              },
              `${id}:fix:${n}`,
            );
            const risk = await routeDecision(
              env,
              repaired,
              'risk',
              { diff: comparison.diff },
              {
                risk: needsApproval(
                  comparison.files,
                  comparison.additions + comparison.deletions,
                  run.rules,
                )
                  ? 3
                  : 0,
              },
            );
            if (
              Number(answerValue(risk, 'risk')) + 1 >=
                run.rules.riskThreshold &&
              !run.approved
            )
              return applyEvent(
                env,
                id,
                { type: 'review', resume: 'repaired' },
                `${id}:risk:${n}`,
              );
            return repaired;
          },
        ),
      );
    if (run.state === 'verifying')
      run = runSchema.parse(
        await step.do(
          `Verify ${n}`,
          { retries: { limit: 2, delay: '1 second' } },
          async () => {
            const current = (await repository.get(id)).run;
            if (current.state !== 'verifying') return current;
            const github = githubFor(env),
              sha = await (
                await env.ARTIFACTS.get(`${id}/fix-${run.attempts}.sha`)
              )?.text();
            if (!sha) throw new Error('Missing fix SHA');
            const checks = await github.runChecks(run.repo, sha),
              baseline = await github.checks(run.repo, 'main');
            if (checks.some((check) => check.status === 'failed'))
              await routeDecision(
                env,
                run,
                'remaining',
                { checks, baseline },
                { unrelated: 0.01 },
              );
            const at = new Date().toISOString();
            for (const [i, check] of checks.entries()) {
              await env.ARTIFACTS.put(
                `${id}/verify-${run.attempts}-${i}.log`,
                redact(check.log),
              );
              await env.DB.prepare(
                'INSERT OR REPLACE INTO checks (id,run_id,phase,name,status,log_excerpt,log_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
              )
                .bind(
                  `${id}:${run.attempts}:${i}`,
                  id,
                  'verify',
                  check.name,
                  check.status,
                  redact(check.log).slice(-2000),
                  `${id}/verify-${run.attempts}-${i}.log`,
                  at,
                  at,
                )
                .run();
            }
            return applyEvent(
              env,
              id,
              {
                type: 'checks',
                checks: checks.map((check) => ({
                  ...check,
                  defaultBranchFailed:
                    check.status === 'failed' &&
                    baseline.some(
                      (other) =>
                        other.name === check.name && other.status === 'failed',
                    ),
                })),
              },
              `${id}:checks:${n}`,
            );
          },
        ),
      );
    if (run.state === 'needs_you')
      await step.do(`Request approval ${n}`, async () => {
        const at = new Date().toISOString();
        await env.DB.prepare(
          'INSERT OR IGNORE INTO approvals (id,run_id,requested_reason,created_at,updated_at) VALUES (?,?,?,?,?)',
        )
          .bind(
            run.approvalId ?? `${id}:${run.attempts}:review`,
            id,
            'Review protected paths or diff size',
            at,
            at,
          )
          .run();
      });
    if (
      run.state === 'repaired' &&
      run.verified &&
      (run.rules.autoOpenPr ||
        parsed.data === 'open_pr' ||
        parsed.data === 'approve')
    )
      run = runSchema.parse(
        await step.do(
          `Open PR ${n}`,
          { retries: { limit: 2, delay: '1 second' } },
          async () => {
            const current = (await repository.get(id)).run;
            if (current.state === 'pr_open') return current;
            if (!run.fixBranch) throw new Error('Missing fix branch');
            const github = githubFor(env),
              checks = await github.checks(run.repo, run.fixBranch);
            const pr = await github.openPr(
              run.repo,
              run.fixBranch,
              checks,
              run.approved,
              run.rules,
            );
            return applyEvent(
              env,
              id,
              { type: 'pr', number: pr.number, url: pr.url },
              `${id}:pr`,
            );
          },
        ),
      );
  }
}
