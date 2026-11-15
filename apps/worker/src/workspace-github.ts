import {
  GitHubAppClient,
  MockGitHubClient,
  type GitHubClient,
} from '@greenci/github';
import { loadConfig, type Run } from '@greenci/core';
import type { RunEnv } from './domain.js';
/** Resolve credentials from a durable connection, never from caller-supplied installation IDs. */
export async function workspaceGithub(
  env: RunEnv,
  orgId: string,
  repo: string,
): Promise<GitHubClient> {
  const cfg = loadConfig(env);
  if (!orgId.startsWith('invite-')) {
    if (repo.split('/')[0] !== orgId)
      throw new Error('Repository outside workspace');
    return cfg.GITHUB_MODE === 'app'
      ? new GitHubAppClient(cfg)
      : new MockGitHubClient(cfg.MOCK_GITHUB_URL);
  }
  if (
    !['local', 'dev'].includes(cfg.APP_ENV) ||
    cfg.INVITE_BETA_ENABLED !== 'true'
  )
    throw new Error('Invite beta disabled');
  const row = await env.DB.prepare(
    'SELECT c.installation_id,i.revoked,i.expires_at FROM beta_connections c JOIN beta_identities b ON b.user_id=c.user_id JOIN beta_invites i ON i.id=b.invite_id WHERE c.org_id=? AND c.repo=?',
  )
    .bind(orgId, repo)
    .first<{ installation_id: string; revoked: number; expires_at: string }>();
  if (!row || row.revoked || Date.parse(row.expires_at) <= Date.now())
    throw new Error('Connection unavailable');
  if (cfg.GITHUB_MODE === 'mock')
    return new MockGitHubClient(cfg.MOCK_GITHUB_URL);
  return new GitHubAppClient({
    ...cfg,
    GITHUB_INSTALLATION_ID: row.installation_id,
    BETA_REPOS: repo,
  });
}
export async function runGithub(env: RunEnv, run: Run) {
  const gh = await workspaceGithub(env, run.orgId, run.repo);
  if (run.orgId.startsWith('invite-')) {
    const actor = await env.DB.prepare(
      'SELECT b.login FROM dashboard_repairs d JOIN beta_identities b ON b.user_id=d.user_id WHERE d.id=? AND d.org_id=?',
    )
      .bind(run.id, run.orgId)
      .first<{ login: string }>();
    if (
      !actor ||
      !['write', 'admin'].includes(await gh.permission(run.repo, actor.login))
    )
      throw new Error('Repository write permission revoked');
  }
  return gh;
}
