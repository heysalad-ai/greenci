import { z } from 'zod';
import { GitHubAppClient, type GitHubClient } from '@greenci/github';
import { copy } from '@greenci/core';
const c = copy.dashboardRepair;
export const startRepairSchema = z
  .object({
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    requestId: z.uuid(),
  })
  .strict();
export const terminalDashboardStates = [
  'pr_open',
  'merged',
  'handed_back',
  'stopped',
  'out_of_scope',
  'not_verified',
];
export async function inspectRepair(
  github: Pick<
    GitHubClient,
    'repos' | 'permission' | 'checks' | 'tree' | 'read'
  >,
  repo: string,
  branch: string,
  login: string,
) {
  if (
    !(await github.repos()).includes(repo) ||
    !['write', 'admin'].includes(await github.permission(repo, login))
  )
    throw new Error(c.notConnected);
  const checks = await github.checks(repo, branch);
  const sha =
    github instanceof GitHubAppClient
      ? await github.head(repo, branch)
      : checks[0]?.sha;
  if (!sha || !/^[a-f0-9]{40}$/.test(sha)) throw new Error(c.noHead);
  const pinned = await github.checks(repo, sha);
  const failure = pinned.find((check) => check.status === 'failed');
  if (!failure) throw new Error(c.noFailure);
  const tree = await github.tree(repo, sha);
  if (!tree.includes('test.mjs')) throw new Error(c.unsupported);
  if (tree.includes('package.json')) {
    const pkg = z
      .object({
        dependencies: z.record(z.string(), z.unknown()).optional(),
        devDependencies: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(JSON.parse(await github.read(repo, sha, 'package.json')));
    if (
      Object.keys(pkg.dependencies ?? {}).length ||
      Object.keys(pkg.devDependencies ?? {}).length
    )
      throw new Error(c.unsupported);
  }
  return { repo, branch, sha, check: failure.name };
}
