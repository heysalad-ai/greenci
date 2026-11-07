import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer } from '../apps/mock-github/src/server.js';
import { fixtures } from '../packages/agent/src/fixtures.js';
import {
  MockGitHubClient,
  signWebhook,
  verifyWebhook,
} from '../packages/github/src/index.js';
import { rulesSchema } from '../packages/core/src/index.js';
let root: string;
let server: Awaited<ReturnType<typeof buildServer>>;
let client: MockGitHubClient;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'greenci-mock-test-'));
  server = await buildServer({ root });
  client = new MockGitHubClient('http://fixture', async (input, init) => {
    const url = new URL(String(input));
    const response = await server.inject({
      method: init?.method === 'POST' ? 'POST' : 'GET',
      url: url.pathname + url.search,
      headers: { 'content-type': 'application/json' },
      ...(init?.body ? { payload: String(init.body) } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
afterAll(async () => {
  await server?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it('real git fixtures fail, accept the deterministic fix, rerun tests and open a verified PR', async () => {
  expect(await client.repos()).toHaveLength(5);
  for (const repo of [
    'greenci/practice',
    'acme/payments',
    'acme/ledger',
  ] as const) {
    const checks = await client.checks(repo, 'main');
    expect(checks[0]?.status).toBe('failed');
    expect(checks[0]?.log).toContain('not ok');
    expect(await client.tree(repo, 'main')).toContain(fixtures[repo].path);
    expect(await client.read(repo, 'main', fixtures[repo].path)).toContain(
      fixtures[repo].before.trim(),
    );
    await client.branch(repo, 'main', 'greenci/fix-1');
    const sha = await client.push(
      repo,
      'greenci/fix-1',
      [{ path: fixtures[repo].path, content: fixtures[repo].after }],
      rulesSchema.parse({}),
    );
    expect(sha).toMatch(/^[a-f0-9]{40}$/);
    const passed = await client.runChecks(repo, sha);
    expect(passed[0]?.status).toBe('passed');
    expect(passed[0]?.log).toContain('ok 1');
    if (repo === 'acme/ledger')
      await expect(
        client.openPr(
          repo,
          'greenci/fix-1',
          passed,
          false,
          rulesSchema.parse({}),
        ),
      ).rejects.toThrow();
    const pr = await client.openPr(
      repo,
      'greenci/fix-1',
      passed,
      true,
      rulesSchema.parse({}),
    );
    expect(pr.state).toBe('open');
    expect((await client.pr(repo, pr.number)).number).toBe(pr.number);
  }
  expect((await client.checks('acme/web', 'main'))[0]?.status).toBe('passed');
}, 20_000);
it('rejects unsafe branches, secrets, unverified PRs and arbitrary host code', async () => {
  await expect(client.branch('acme/web', 'main', 'main')).rejects.toThrow();
  await expect(client.read('acme/web', 'main', '.env')).rejects.toThrow();
  await expect(
    client.openPr('acme/web', 'greenci/x', [], false, rulesSchema.parse({})),
  ).rejects.toThrow();
  await expect(
    client.push(
      'acme/web',
      'greenci/x',
      [{ path: 'src/main.ts', content: 'process.exit(0)' }],
      rulesSchema.parse({}),
    ),
  ).rejects.toThrow();
  await expect(
    client.push(
      'acme/web',
      'greenci/x',
      [{ path: '.github/workflows/x.yml', content: 'x' }],
      rulesSchema.parse({}),
    ),
  ).rejects.toThrow();
});
it('signs webhooks and rejects tampered content and signatures', async () => {
  const secret = 'fixture-signing-secret',
    body = JSON.stringify({ action: 'completed' }),
    signature = await signWebhook(secret, body);
  expect(await verifyWebhook(secret, body, signature)).toBe(true);
  expect(await verifyWebhook(secret, body + ' ', signature)).toBe(false);
  expect(await verifyWebhook(secret, body, 'sha256=bad')).toBe(false);
});
