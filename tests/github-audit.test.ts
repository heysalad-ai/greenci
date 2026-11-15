import { describe, expect, it } from 'vitest';
import {
  allowed,
  auditRepo,
  inventory,
  markdown,
  workflowFindings,
  type Transport,
} from '../scripts/github-audit.mjs';
const sha = 'a'.repeat(40);
const repo = {
  full_name: 'test/repo',
  private: true,
  fork: false,
  archived: false,
  default_branch: 'main',
  pushed_at: null,
};
const commit = (state: string | null = null) => ({
  data: {
    repository: {
      defaultBranchRef: {
        name: 'main',
        branchProtectionRule: null,
        target: { oid: sha, statusCheckRollup: state ? { state } : null },
      },
      vulnerabilityAlerts: { totalCount: 0 },
    },
  },
});
describe('read-only account audit', () => {
  it('rejects secret/config/log endpoints, mutation and shell paths', () => {
    for (const path of [
      'repos/test/repo/contents/.env?ref=' + sha,
      'repos/test/repo/secret-scanning/alerts',
      'repos/test/repo/actions/runs/1/logs',
      'repos/test/repo/contents/.github/workflows/../../.env?ref=' + sha,
      'repos/test/repo/contents/.github/workflows/a.yml?ref=main',
    ])
      expect(allowed(path)).toBe(false);
    expect(allowed('graphql', 'mutation { x }')).toBe(false);
    expect(allowed('graphql', 'query { mutation }')).toBe(false);
    expect(
      allowed(`repos/test/repo/contents/.github/workflows/ci.yml?ref=${sha}`),
    ).toBe(true);
  });
  it('exhausts pagination and excludes other owners', async () => {
    const paths: string[] = [];
    const api: Transport = async (p) => {
      paths.push(p);
      return paths.length === 1
        ? Array.from({ length: 100 }, (_, i) => ({
            ...repo,
            full_name: `test/r${i}`,
          }))
        : [{ ...repo, full_name: 'other/r' }];
    };
    expect(await inventory(api, 'test', false)).toHaveLength(100);
    expect(paths).toHaveLength(2);
    expect(paths[1]).toContain('page=2');
  });
  it('flags untrusted shell input and dangerous privileged checkout without returning source', () => {
    const text =
      'on:\n  pull_request_target:\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - run: |\n          echo "${{ github.event.pull_request.title }}"\n';
    const findings = workflowFindings('.github/workflows/ci.yml', text);
    expect(findings.map((f) => f.rule)).toContain(
      'target-head-checkout-review',
    );
    expect(findings).toContainEqual({
      rule: 'untrusted-shell-expression',
      level: 'high',
      path: '.github/workflows/ci.yml',
      line: 10,
    });
    expect(JSON.stringify(findings)).not.toContain('echo');
  });
  it('does not flag numeric identifiers or immutable commit IDs as shell input', () => {
    const result = workflowFindings(
      'ci.yml',
      'steps:\n  - run: echo ${{ github.event.pull_request.head.sha }} ${{ github.event.issue.number }}\n',
    );
    expect(result.some((f) => f.rule === 'untrusted-shell-expression')).toBe(
      false,
    );
  });
  it('accepts immutable actions and bounded efficient jobs', () => {
    const text = `permissions: read-all\nconcurrency: ci\njobs:\n  test:\n    timeout-minutes: 5\n    steps:\n      - uses: actions/checkout@${sha}\n      - run: echo ok\n`;
    expect(workflowFindings('ci.yml', text)).toEqual([]);
  });
  it('keeps missing checks and truncated coverage distinct from success', async () => {
    const result = await auditRepo(
      async (p) => (p === 'graphql' ? commit() : { truncated: true, tree: [] }),
      repo,
    );
    expect(result.sha).toBe(sha);
    expect(result.ci).toBe('no-checks');
    expect(result.gaps).toContain('tree-truncated');
    expect(result.findings.some((f) => f.rule === 'no-root-js-lockfile')).toBe(
      false,
    );
    expect(markdown([result])).toContain(
      'not a complete source-code vulnerability scan',
    );
  });
  it('records API denial, never green', async () => {
    const result = await auditRepo(async () => {
      throw new Error('forbidden');
    }, repo);
    expect(result.ci).toBe('unknown');
    expect(result.sha).toBeNull();
    expect(result.gaps).toHaveLength(1);
  });
  it('preserves partial GraphQL coverage without inventing zero alerts', async () => {
    const data = commit('SUCCESS');
    const payload = {
      ...data,
      data: {
        repository: { ...data.data.repository, vulnerabilityAlerts: null },
      },
      errors: [
        { type: 'FORBIDDEN', path: ['repository', 'vulnerabilityAlerts'] },
      ],
    };
    const result = await auditRepo(
      async (p) => (p === 'graphql' ? payload : { truncated: false, tree: [] }),
      repo,
    );
    expect(result.ci).toBe('SUCCESS');
    expect(result.alerts).toBeNull();
    expect(result.gaps).toContain(
      'graphql:repository.vulnerabilityAlerts:FORBIDDEN',
    );
  });
});
