import { generateKeyPairSync } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { GitHubAppClient, appJwt } from '../packages/github/src/app.js';
import { rulesSchema } from '../packages/core/src/index.js';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = {
  GITHUB_APP_ID: '123',
  GITHUB_PRIVATE_KEY: keys.privateKey
    .export({ type: 'pkcs1', format: 'pem' })
    .toString(),
  GITHUB_INSTALLATION_ID: '456',
  BETA_REPOS: 'acme/payments',
  BETA_WRITE_PATHS: 'src/**,test.mjs,migrations/**',
};
const a = 'a'.repeat(40),
  b = 'b'.repeat(40),
  c = 'c'.repeat(40),
  d = 'd'.repeat(40);
const json = (value: unknown, status = 200) => Response.json(value, { status });
type Handler = (
  path: string,
  init?: RequestInit,
) => Response | Promise<Response>;
const setup = (handle: Handler) => {
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/repos/acme/payments')
        return json({ full_name: 'acme/payments', default_branch: 'main' });
      if (url.pathname === '/app/installations/456')
        return json({ account: { login: 'acme' }, suspended_at: null });
      if (url.pathname === '/app/installations/456/access_tokens')
        return json({
          token: 'fixture-installation-token',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        });
      return handle(url.pathname + url.search, init);
    },
  );
  return { client: new GitHubAppClient(config, transport), transport };
};
it('signs installation JWTs in the actual Workers runtime without reading host credentials', async () => {
  const entry = fileURLToPath(
    new URL('../packages/github/src/app.ts', import.meta.url),
  );
  const bundle = await build({
    stdin: {
      contents: `import { appJwt } from ${JSON.stringify(entry)}; export default {async fetch(request,env){return Response.json({jwt:await appJwt('123',env.FIXTURE_KEY,1800000000000)})}}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['node:*', 'cloudflare:*'],
    write: false,
  });
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0]!.text,
      compatibilityDate: '2026-11-06',
      compatibilityFlags: ['nodejs_compat'],
      bindings: { FIXTURE_KEY: config.GITHUB_PRIVATE_KEY },
    }),
  );
  try {
    const response = await runtime.dispatchFetch('https://worker/');
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { jwt: string };
    expect(
      JSON.parse(
        Buffer.from(payload.jwt.split('.')[1]!, 'base64url').toString(),
      ),
    ).toMatchObject({ iss: '123', exp: 1800000540 });
  } finally {
    await runtime.dispose();
  }
});
it('signs a bounded GitHub App JWT, including GitHub PKCS1 private keys', async () => {
  const jwt = await appJwt('123', config.GITHUB_PRIVATE_KEY, 1_800_000_000_000);
  const [header, payload, signature] = jwt.split('.');
  expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toEqual({
    iat: 1_799_999_940,
    exp: 1_800_000_540,
    iss: '123',
  });
  const publicKey = await crypto.subtle.importKey(
    'spki',
    new Uint8Array(keys.publicKey.export({ type: 'spki', format: 'der' })),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  expect(
    await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      Buffer.from(signature!, 'base64url'),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  ).toBe(true);
});
it('denies other repositories, secret paths and default-branch writes before any request', async () => {
  const { client, transport } = setup(() => json({}));
  await expect(client.read('other/private', a, 'src/a.ts')).rejects.toThrow(
    'allowlist',
  );
  await expect(client.read('acme/payments', a, '.env')).rejects.toThrow(
    'Secret',
  );
  await expect(client.branch('acme/payments', a, 'main')).rejects.toThrow(
    'greenci/',
  );
  expect(transport).not.toHaveBeenCalled();
});
it('scopes short-lived installation tokens and rejects symlinks, secrets and truncated snapshots', async () => {
  const { client, transport } = setup((path) => {
    if (path.includes('/commits/'))
      return json({ sha: a, commit: { tree: { sha: b } } });
    return json({
      truncated: false,
      tree: [
        { path: 'src/a.ts', type: 'blob', mode: '100644', sha: c },
        { path: '.env', type: 'blob', mode: '100644', sha: c },
        { path: 'symlink', type: 'blob', mode: '120000', sha: c },
      ],
    });
  });
  expect(await client.tree('acme/payments', a)).toEqual(['src/a.ts']);
  const tokenRequest = transport.mock.calls.find(([input]) =>
    String(input).endsWith('/access_tokens'),
  )!;
  expect(JSON.parse(String(tokenRequest[1]?.body)).repositories).toEqual([
    'payments',
  ]);
  expect(JSON.parse(String(tokenRequest[1]?.body)).permissions).toEqual({
    contents: 'write',
    actions: 'read',
    checks: 'read',
    statuses: 'read',
    pull_requests: 'write',
    metadata: 'read',
  });
  const bad = setup((path) =>
    path.includes('/commits/')
      ? json({ sha: a, commit: { tree: { sha: b } } })
      : json({ truncated: true, tree: [] }),
  );
  await expect(bad.client.tree('acme/payments', a)).rejects.toThrow('snapshot');
});
it('creates a commit with its original base tree, preserves executable mode and never forces the ref', async () => {
  const { client, transport } = setup((path, init) => {
    if (path.includes('/commits/'))
      return json({ sha: a, commit: { tree: { sha: b } } });
    if (path.includes('/git/trees/') && init?.method === 'GET')
      return json({
        truncated: false,
        tree: [{ path: 'test.mjs', type: 'blob', mode: '100755', sha: c }],
      });
    if (path.includes('/git/blobs/'))
      return json({
        type: 'file',
        encoding: 'base64',
        content: Buffer.from('old').toString('base64'),
        size: 3,
      });
    if (path.endsWith('/git/trees')) return json({ sha: c });
    if (path.endsWith('/git/commits')) return json({ sha: d });
    return json({});
  });
  expect(
    await client.push(
      'acme/payments',
      'greenci/fix-1',
      [{ path: 'test.mjs', content: 'new' }],
      rulesSchema.parse({}),
    ),
  ).toBe(d);
  const tree = transport.mock.calls.find(
    ([input, init]) =>
      String(input).endsWith('/git/trees') && init?.method === 'POST',
  )!;
  expect(JSON.parse(String(tree[1]?.body))).toMatchObject({
    base_tree: b,
    tree: [{ path: 'test.mjs', mode: '100755', content: 'new' }],
  });
  const update = transport.mock.calls.find(
    ([, init]) => init?.method === 'PATCH',
  )!;
  expect(JSON.parse(String(update[1]?.body))).toEqual({ sha: d, force: false });
});
it('rejects a protected patch before creating any tree, commit or ref update', async () => {
  const { client, transport } = setup((path) =>
    path.includes('/commits/')
      ? json({ sha: a, commit: { tree: { sha: b } } })
      : json({ truncated: false, tree: [] }),
  );
  await expect(
    client.push(
      'acme/payments',
      'greenci/fix-1',
      [{ path: 'migrations/001.sql', content: 'select 1;' }],
      rulesSchema.parse({}),
    ),
  ).rejects.toThrow('requires approval');
  expect(
    transport.mock.calls.filter(([, init]) =>
      ['POST', 'PATCH'].includes(init?.method ?? ''),
    ).length,
  ).toBe(1); // only the scoped token request
});
it('never treats empty, pending, skipped or legacy failing checks as verified', async () => {
  const { client } = setup((path) => {
    if (path.includes('/check-runs'))
      return json({
        total_count: 2,
        check_runs: [
          {
            name: 'test',
            status: 'in_progress',
            conclusion: null,
            output: { title: null, summary: null },
          },
          {
            name: 'lint',
            status: 'completed',
            conclusion: 'skipped',
            output: { title: null, summary: null },
          },
        ],
      });
    if (path.includes('/status'))
      return json({
        total_count: 1,
        statuses: [
          { context: 'external', state: 'failure', description: 'failed' },
        ],
      });
    return json({ sha: a, commit: { tree: { sha: b } } });
  });
  expect(
    (await client.checks('acme/payments', a)).map((check) => check.status),
  ).toEqual(['running', 'failed', 'failed']);
});
it('refuses binary or incomplete comparisons instead of approving an invisible diff', async () => {
  const { client } = setup(() =>
    json({
      total_commits: 1,
      files: [
        {
          filename: 'asset.bin',
          status: 'modified',
          additions: 1,
          deletions: 0,
        },
      ],
    }),
  );
  await expect(client.compare('acme/payments', a, b)).rejects.toThrow(
    'Incomplete',
  );
});

it.each([false, true])(
  'opens only a draft for the verified SHA and detects a changed PR head: %s',
  async (moved) => {
    const { client, transport } = setup((path, init) => {
      if (path.includes('/commits/main'))
        return json({ sha: b, commit: { tree: { sha: c } } });
      if (path.includes('/check-runs'))
        return json({
          total_count: 1,
          check_runs: [
            {
              name: 'ci',
              status: 'completed',
              conclusion: path.includes(b) ? 'failure' : 'success',
              output: { title: 'ci', summary: 'fixture' },
            },
          ],
        });
      if (path.includes('/status'))
        return json({ total_count: 0, statuses: [] });
      if (path.includes('/commits/'))
        return json({ sha: a, commit: { tree: { sha: c } } });
      if (path.includes('/compare/'))
        return json({
          total_commits: 1,
          files: [
            {
              filename: 'src/add.mjs',
              status: 'modified',
              additions: 1,
              deletions: 1,
              patch: '@@ -1 +1 @@\n-old\n+new',
            },
          ],
        });
      if (path.includes('/pulls?')) return json([]);
      if (path.endsWith('/pulls') && init?.method === 'POST')
        return json({ number: 1 });
      if (path.endsWith('/pulls/1'))
        return json({
          number: 1,
          state: 'open',
          merged: false,
          html_url: 'https://github.com/acme/payments/pull/1',
          head: { sha: moved ? d : a },
          base: { ref: 'main' },
        });
      throw new Error(`Unexpected fixture endpoint ${path}`);
    });
    const result = client.openPr(
      'acme/payments',
      'greenci/fix-1',
      [
        {
          name: 'ci',
          status: 'passed',
          defaultBranchFailed: false,
          sha: a,
          log: 'fixture',
        },
      ],
      false,
      rulesSchema.parse({}),
    );
    if (moved) await expect(result).rejects.toThrow('head changed');
    else
      await expect(result).resolves.toMatchObject({ number: 1, state: 'open' });
    const create = transport.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/pulls') && init?.method === 'POST',
    )!;
    expect(JSON.parse(String(create[1]?.body))).toMatchObject({
      draft: true,
      base: 'main',
      head: 'greenci/fix-1',
    });
  },
);
