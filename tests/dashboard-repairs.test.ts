import { expect, it } from 'vitest';
import {
  inspectRepair,
  startRepairSchema,
} from '../apps/api/src/repair-profile.js';
import { copy } from '../packages/core/src/index.js';
const sha = 'a'.repeat(40);
function source(overrides = {}) {
  return {
    repos: async () => ['acme/repo'],
    permission: async () => 'write' as const,
    checks: async () => [
      {
        name: 'node-test',
        sha,
        log: 'fixture failure',
        status: 'failed' as const,
        defaultBranchFailed: false,
      },
    ],
    tree: async () => ['src/math.mjs', 'test.mjs', 'package.json'],
    read: async () => '{}',
    ...overrides,
  };
}
it('accepts only the connected, writable pinned source-test profile', async () => {
  expect(await inspectRepair(source(), 'acme/repo', 'main', 'owner')).toEqual({
    repo: 'acme/repo',
    branch: 'main',
    sha,
    check: 'node-test',
  });
});
it('rejects foreign repos, missing permission, missing tests and dependency-based profiles', async () => {
  await expect(
    inspectRepair(source(), 'other/repo', 'main', 'owner'),
  ).rejects.toThrow(copy.dashboardRepair.notConnected);
  await expect(
    inspectRepair(
      source({ permission: async () => 'read' }),
      'acme/repo',
      'main',
      'owner',
    ),
  ).rejects.toThrow(copy.dashboardRepair.notConnected);
  await expect(
    inspectRepair(
      source({ tree: async () => ['package.json'] }),
      'acme/repo',
      'main',
      'owner',
    ),
  ).rejects.toThrow(copy.dashboardRepair.unsupported);
  await expect(
    inspectRepair(
      source({ read: async () => ' {"dependencies":{"test":"1"}}' }),
      'acme/repo',
      'main',
      'owner',
    ),
  ).rejects.toThrow(copy.dashboardRepair.unsupported);
});
it('does not manufacture a failure or accept an unpinned head', async () => {
  await expect(
    inspectRepair(
      source({ checks: async () => [] }),
      'acme/repo',
      'main',
      'owner',
    ),
  ).rejects.toThrow(copy.dashboardRepair.noHead);
  await expect(
    inspectRepair(
      source({
        checks: async () => [
          {
            name: 'ok',
            sha,
            log: '',
            status: 'passed',
            defaultBranchFailed: false,
          },
        ],
      }),
      'acme/repo',
      'main',
      'owner',
    ),
  ).rejects.toThrow(copy.dashboardRepair.noFailure);
});
it('rejects arbitrary commands, caller rules, bad SHAs and request keys at the start boundary', () => {
  const valid = {
    repo: 'acme/repo',
    sha,
    requestId: '11111111-1111-4111-8111-111111111111',
  };
  expect(startRepairSchema.safeParse(valid).success).toBe(true);
  for (const input of [
    { ...valid, sha: 'main' },
    { ...valid, command: 'curl example.test' },
    { ...valid, rules: { allowWorkflows: true } },
    { ...valid, requestId: '../escape' },
  ])
    expect(startRepairSchema.safeParse(input).success).toBe(false);
});

it('keeps manual phase keys from racing a dashboard workflow', async () => {
  const { canPress } = await import('../apps/web/src/app/app/run-view.js');
  const { runSchema } = await import('../packages/core/src/index.js');
  const base = runSchema.parse({
    id: 'dashboard-acme-request',
    repo: 'acme/repo',
    orgId: 'acme',
    headSha: sha,
    branch: 'main',
    failingCheckName: 'test',
    startedBy: 'web',
    rules: { autoMode: true, autoRepair: true },
  });
  for (const [state, key] of [
    ['failing', 'diagnose'],
    ['diagnosed', 'repair'],
    ['repaired', 'verify'],
  ] as const) {
    expect(canPress({ ...base, state }, key)).toBe(false);
    expect(canPress({ ...base, id: 'manual-run', state }, key)).toBe(true);
  }
});
