import { beforeAll, afterAll, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { inviteRoutes } from '../apps/api/src/invite.js';
import { digest } from '../apps/api/src/invite-auth.js';
import { session } from '../apps/api/src/session.js';
import type { ApiEnv } from '../apps/api/src/env.js';
let mf: Miniflare, env: ApiEnv;
let login = 'outsider',
  email = 'outside@example.test',
  sub = 'access-outside';
let installed = true,
  repoWrite = true;
const code = 'fake-invite-code-'.repeat(4),
  inviteId = crypto.randomUUID();
const transport: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url === 'https://github.com/login/oauth/access_token') {
    const body = JSON.parse(String(init?.body));
    expect(body.client_secret).toBe('fixture-only');
    expect(body.code_verifier.length).toBeGreaterThan(43);
    return Response.json({
      access_token: 'fixture-user-token',
      expires_in: 3600,
    });
  }
  if (url.endsWith('/user')) return Response.json({ id: 42, login });
  if (url.includes('/user/installations/123/repositories'))
    return Response.json({
      total_count: 2,
      repositories: [
        {
          full_name: 'outside/repo',
          default_branch: 'main',
          permissions: { push: repoWrite },
        },
        {
          full_name: 'outside/read-only',
          default_branch: 'main',
          permissions: { push: false },
        },
      ],
    });
  if (url.includes('/user/installations?'))
    return Response.json({
      total_count: 2,
      installations: [
        {
          id: 123,
          app_id: installed ? 99 : 88,
          account: { login: 'outside' },
          suspended_at: null,
        },
        {
          id: 456,
          app_id: 77,
          account: { login: 'other' },
          suspended_at: null,
        },
      ],
    });
  throw new Error('Unexpected provider call');
};
const app = inviteRoutes({
  transport,
  verifyAccess: async () => ({
    sub,
    email,
    iss: 'https://test.cloudflareaccess.com',
    aud: ['fixture'],
    exp: Date.now() / 1000 + 3600,
  }),
});
const request = (path: string, body?: unknown, cookie = '', csrf = '') =>
  app.request(
    `https://app/v1/invite/${path}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    },
    env,
  );
let cookie = '',
  csrf = '';
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: '2026-11-06',
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      d1Databases: { DB: 'invite-test' },
      kvNamespaces: ['SESSIONS'],
    }),
  );
  const db = await mf.getD1Database('DB');
  for (const name of [
    '0002_domain.sql',
    '0005_dashboard_repairs.sql',
    '0006_invite_beta.sql',
  ]) {
    // exec handles individual lines; preserve the trigger's internal semicolon as one SQL statement.
    const sql = await readFile(`packages/db/migrations/${name}`, 'utf8');
    if (name === '0006_invite_beta.sql') {
      const [tables, trigger] = sql.split('-- Enforce the admission cap');
      await db.exec(tables!.replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
      for (const statement of trigger!.split('CREATE TRIGGER').slice(1))
        await db.prepare('CREATE TRIGGER' + statement).run();
    } else await db.exec(sql.replace(/--[^\n]*/g, '').replace(/\n/g, ' '));
  }
  env = {
    DB: db,
    SESSIONS: await mf.getKVNamespace('SESSIONS'),
    INVITE_BETA_ENABLED: 'true',
    GITHUB_CLIENT_ID: 'fixture-client',
    GITHUB_CLIENT_SECRET: 'fixture-only',
    GITHUB_APP_ID: '99',
    BETA_OWNER_LOGIN: 'owner',
    GITHUB_APP_SLUG: 'fixture-app',
  } as unknown as ApiEnv;
  await db
    .prepare(
      'INSERT INTO beta_invites (id,token_hash,email,login,expires_at,created_at) VALUES (?,?,?,?,?,?)',
    )
    .bind(
      inviteId,
      await digest(code),
      email,
      login,
      new Date(Date.now() + 86400000).toISOString(),
      new Date().toISOString(),
    )
    .run();
});
afterAll(async () => {
  await mf?.dispose();
});
async function start() {
  const response = await request('start', { code });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { url: string };
  return {
    state: new URL(body.url).searchParams.get('state')!,
    browser: response.headers.get('set-cookie')!.split(';')[0]!,
    url: body.url,
  };
}
it('denies missing configuration, unknown invitations and an Access-email mismatch', async () => {
  expect((await request('start', { code: 'x'.repeat(40) })).status).toBe(403);
  email = 'wrong@example.test';
  expect((await request('start', { code })).status).toBe(403);
  email = 'outside@example.test';
  const response = await app.request(
    'https://app/v1/invite/start',
    { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' },
    env,
  );
  expect(response.status).toBe(403);
  expect((await request('me')).status).toBe(401);
});
it('requires browser-bound single-use state, PKCE and the invited GitHub account', async () => {
  const first = await start();
  expect(new URL(first.url).searchParams.get('code_challenge_method')).toBe(
    'S256',
  );
  const wrong = await request(
    `callback?state=${first.state}&code=fixture`,
    undefined,
    'greenci_oauth=wrong',
  );
  expect(wrong.headers.get('location')).toContain('error=signin');
  login = 'intruder';
  const mismatch = await request(
    `callback?state=${first.state}&code=fixture`,
    undefined,
    first.browser,
  );
  expect(mismatch.headers.get('location')).toContain('error=signin');
  login = 'outsider';
  const good = await start();
  sub = 'different-sub';
  const swapped = await request(
    `callback?state=${good.state}&code=fixture`,
    undefined,
    good.browser,
  );
  expect(swapped.headers.get('location')).toContain('error=signin');
  sub = 'access-outside';
  const result = await request(
    `callback?state=${good.state}&code=fixture`,
    undefined,
    good.browser,
  );
  expect(result.headers.get('location')).toBe(
    'http://localhost:3000/beta?connected=1',
  );
  cookie = result.headers
    .get('set-cookie')!
    .match(/greenci_session=[^;,]+/)![0];
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
  expect(await result.text()).not.toContain('fixture-user-token');
  const replay = await request(
    `callback?state=${good.state}&code=fixture`,
    undefined,
    good.browser,
  );
  expect(replay.headers.get('location')).toContain('error=signin');
  const me = await request('me', undefined, cookie),
    body = (await me.json()) as { csrf: string; orgId: string; admin: boolean };
  csrf = body.csrf;
  expect(body).toMatchObject({ orgId: 'invite-42', admin: false });
  expect(me.headers.get('cache-control')).toBe('private, no-store');
});
it('lists only writable repos in this App and revalidates installation on connect', async () => {
  const list = await request('repositories', undefined, cookie);
  expect(await list.json()).toMatchObject({
    repos: [{ full_name: 'outside/repo', installationId: 123 }],
  });
  expect(
    (
      await request(
        'connect',
        { repo: 'outside/repo', installationId: 123 },
        cookie,
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await request(
        'connect',
        { repo: 'outside/repo', installationId: 456 },
        cookie,
        csrf,
      )
    ).status,
  ).toBe(409);
  repoWrite = false;
  expect(
    (
      await request(
        'connect',
        { repo: 'outside/repo', installationId: 123 },
        cookie,
        csrf,
      )
    ).status,
  ).toBe(409);
  repoWrite = true;
  installed = false;
  expect(
    (
      await request(
        'connect',
        { repo: 'outside/repo', installationId: 123 },
        cookie,
        csrf,
      )
    ).status,
  ).toBe(409);
  installed = true;
  await env.DB.prepare(
    'INSERT INTO repos(id,org_id,full_name,default_branch) VALUES (?,?,?,?)',
  )
    .bind('outside/repo', 'foreign-workspace', 'outside/repo', 'main')
    .run();
  expect(
    (
      await request(
        'connect',
        { repo: 'outside/repo', installationId: 123 },
        cookie,
        csrf,
      )
    ).status,
  ).toBe(409);
  await env.DB.prepare('DELETE FROM repos WHERE id=?')
    .bind('outside/repo')
    .run();
  expect(
    (
      await request(
        'connect',
        { repo: 'outside/repo', installationId: 123 },
        cookie,
        csrf,
      )
    ).status,
  ).toBe(200);
  expect(
    await env.DB.prepare(
      'SELECT org_id,installation_id FROM beta_connections WHERE repo=?',
    )
      .bind('outside/repo')
      .first(),
  ).toMatchObject({ org_id: 'invite-42', installation_id: '123' });
  expect(
    (await request('admin/invites', { email, login }, cookie, csrf)).status,
  ).toBe(403);
});
it('does not expose another workspace connection and revokes existing sessions immediately', async () => {
  const at = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO repos (id,org_id,full_name,default_branch) VALUES (?,?,?,?)',
  )
    .bind('outside/foreign', 'other', 'outside/foreign', 'main')
    .run();
  expect(
    (
      await request(
        'connect',
        { repo: 'outside/foreign', installationId: 123 },
        cookie,
        csrf,
      )
    ).status,
  ).toBe(409);
  await env.DB.prepare('UPDATE beta_invites SET revoked=1 WHERE id=?')
    .bind(inviteId)
    .run();
  expect((await request('me', undefined, cookie)).status).toBe(401);
  expect(
    await session(
      new Request('https://app/v1/audit', { headers: { Cookie: cookie } }),
      env,
    ),
  ).toBeNull();
  await env.DB.prepare(
    'UPDATE beta_invites SET revoked=0,expires_at=? WHERE id=?',
  )
    .bind(at, inviteId)
    .run();
  expect((await request('me', undefined, cookie)).status).toBe(401);
});

it('keeps disabled or unconfigured onboarding closed and bounds request bodies', async () => {
  const disabled = { ...env, INVITE_BETA_ENABLED: 'false' };
  expect(
    (await app.request('https://app/v1/invite/me', {}, disabled)).status,
  ).toBe(404);
  const missing = { ...env, GITHUB_CLIENT_SECRET: '' };
  expect(
    (
      await app.request(
        'https://app/v1/invite/start',
        {
          method: 'POST',
          headers: {
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code }),
        },
        missing,
      )
    ).status,
  ).toBe(503);
  expect((await request('start', { code: 'x'.repeat(3000) })).status).toBe(413);
});
it('lets only the existing owner issue and revoke hashed expiring invitations', async () => {
  const db = env.DB,
    kv = env.SESSIONS,
    token = crypto.randomUUID(),
    ownerCsrf = crypto.randomUUID();
  await db.exec(
    "INSERT INTO users(id,login) VALUES ('access:owner','owner'); INSERT INTO memberships(id,user_id,org_id,role) VALUES ('operator','access:owner','operator','owner');",
  );
  await kv.put(
    `session:${token}`,
    JSON.stringify({
      userId: 'access:owner',
      orgId: 'operator',
      csrf: ownerCsrf,
    }),
  );
  const ownerCookie = `greenci_session=${token}`;
  expect(
    (
      await request(
        'admin/invites',
        { email: 'next@example.test', login: 'next' },
        ownerCookie,
      )
    ).status,
  ).toBe(401);
  const created = await request(
    'admin/invites',
    { email: 'next@example.test', login: 'next' },
    ownerCookie,
    ownerCsrf,
  );
  expect(created.status).toBe(201);
  const body = (await created.json()) as {
    id: string;
    code: string;
    expires: string;
  };
  expect(Date.parse(body.expires)).toBeGreaterThan(Date.now() + 6 * 86400000);
  expect(
    await db
      .prepare('SELECT token_hash FROM beta_invites WHERE id=?')
      .bind(body.id)
      .first(),
  ).toEqual({ token_hash: await digest(body.code) });
  const list = await request('admin/invites', undefined, ownerCookie);
  const text = await list.text();
  expect(text).not.toContain(body.code);
  expect(text).not.toContain('token_hash');
  expect(
    (await request('admin/revoke', { id: body.id }, ownerCookie, ownerCsrf))
      .status,
  ).toBe(200);
  expect(
    await db
      .prepare('SELECT revoked FROM beta_invites WHERE id=?')
      .bind(body.id)
      .first(),
  ).toEqual({ revoked: 1 });
});
it('enforces connection capacity in the database transaction', async () => {
  const at = new Date().toISOString();
  for (let n = 0; n < 4; n++)
    await env.DB.prepare(
      'INSERT INTO beta_connections(repo,org_id,user_id,installation_id,default_branch,created_at) VALUES (?,?,?,?,?,?)',
    )
      .bind(`outside/fixture-${n}`, 'invite-42', 'github:42', '123', 'main', at)
      .run();
  await expect(
    env.DB.prepare(
      'INSERT INTO beta_connections(repo,org_id,user_id,installation_id,default_branch,created_at) VALUES (?,?,?,?,?,?)',
    )
      .bind(
        'outside/fixture-overflow',
        'invite-42',
        'github:42',
        '123',
        'main',
        at,
      )
      .run(),
  ).rejects.toThrow('Beta connection admission limit');
});
