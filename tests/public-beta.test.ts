import { afterAll, beforeAll, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { inviteRoutes } from '../apps/api/src/invite.js';
import { session } from '../apps/api/src/session.js';
import { workspaceGithub } from '../apps/worker/src/workspace-github.js';
import { admitPublicSignIn } from '../apps/api/src/public-admission.js';
import type { ApiEnv } from '../apps/api/src/env.js';
import type { RunEnv } from '../apps/worker/src/domain.js';

let mf: Miniflare, env: ApiEnv;
let githubId = 123,
  login = 'public-tester';
const origin = 'https://public.example';
const app = inviteRoutes({
  verifyAccess: async () => {
    throw new Error('Public signup must not require Access');
  },
  transport: async (input, init) => {
    if (String(input) === 'https://github.com/login/oauth/access_token') {
      expect(JSON.parse(String(init?.body)).redirect_uri).toBe(
        `${origin}/api/client/invite/callback`,
      );
      return Response.json({ access_token: 'fixture-token', expires_in: 3600 });
    }
    if (String(input) === 'https://api.github.com/user')
      return Response.json({ id: githubId, login });
    throw new Error('Unexpected provider request');
  },
});
const request = (
  path: string,
  body?: unknown,
  cookie = '',
  requestOrigin = origin,
) =>
  app.request(
    `https://api/v1/invite/${path}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: requestOrigin,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      d1Databases: { DB: 'public-test' },
      kvNamespaces: ['SESSIONS'],
    }),
  );
  const db = await mf.getD1Database('DB');
  for (const name of [
    '0002_domain.sql',
    '0005_dashboard_repairs.sql',
    '0006_invite_beta.sql',
    '0007_public_beta.sql',
  ]) {
    const text = (
      await readFile(`packages/db/migrations/${name}`, 'utf8')
    ).replace(/--[^\n]*/g, '');
    const [tables, ...triggers] = text.split('CREATE TRIGGER');
    await db.exec(tables!.replace(/\n/g, ' '));
    for (const trigger of triggers)
      await db.prepare('CREATE TRIGGER' + trigger).run();
  }
  env = {
    DB: db,
    SESSIONS: await mf.getKVNamespace('SESSIONS'),
    INVITE_BETA_ENABLED: 'true',
    PUBLIC_BETA_ENABLED: 'true',
    PUBLIC_BETA_URL: origin,
    GITHUB_CLIENT_ID: 'fixture',
    GITHUB_CLIENT_SECRET: 'fixture',
  } as unknown as ApiEnv;
});
afterAll(() => mf?.dispose());
it('bounds concurrent sign-in attempts per client without storing its address', async () => {
  const attempts = await Promise.allSettled(
    Array.from({ length: 11 }, () => admitPublicSignIn(env, '198.51.100.42')),
  );
  expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(10);
  expect(attempts.filter((x) => x.status === 'rejected')).toHaveLength(1);
  await expect(
    admitPublicSignIn(env, '198.51.100.43'),
  ).resolves.toBeUndefined();
  const rows = await env.DB.prepare('SELECT key FROM public_auth_rate').all<{
    key: string;
  }>();
  expect(rows.results.every((x) => /^[a-f0-9]{64}$/.test(x.key))).toBe(true);
});
async function start() {
  const response = await request('public/start', {});
  expect(response.status).toBe(200);
  const { url } = (await response.json()) as { url: string };
  expect(new URL(url).searchParams.get('redirect_uri')).toBe(
    `${origin}/api/client/invite/callback`,
  );
  expect(new URL(url).searchParams.get('code_challenge_method')).toBe('S256');
  return {
    state: new URL(url).searchParams.get('state')!,
    cookie: response.headers.get('set-cookie')!.split(';')[0]!,
  };
}
async function complete(
  auth: Awaited<ReturnType<typeof start>>,
  cookie = auth.cookie,
) {
  return request(
    `callback?state=${auth.state}&code=fixture`,
    undefined,
    cookie,
  );
}
it('requires explicit public enablement, a separate configured origin and an empty body', async () => {
  env.PUBLIC_BETA_ENABLED = 'false';
  expect((await request('public/start', {})).status).toBe(404);
  env.PUBLIC_BETA_ENABLED = 'true';
  expect(
    (await request('public/start', {}, '', 'https://untrusted.example')).status,
  ).toBe(403);
  expect((await request('public/start', { installationId: 7 })).status).toBe(
    400,
  );
});
let signedCookie = '';
it('creates an isolated GitHub identity without Access or an invitation code and prevents replay', async () => {
  const auth = await start();
  expect(
    (await complete(auth, 'greenci_oauth=wrong')).headers.get('location'),
  ).toContain('error=signin');
  const result = await complete(auth);
  expect(result.headers.get('location')).toBe(`${origin}/beta?connected=1`);
  signedCookie = result.headers
    .get('set-cookie')!
    .match(/greenci_session=[^;,]+/)![0];
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
  expect(await result.text()).not.toContain('fixture-token');
  const me = await request('me', undefined, signedCookie);
  expect(await me.json()).toMatchObject({
    login: 'public-tester',
    orgId: 'invite-123',
    admin: false,
  });
  expect((await complete(auth)).headers.get('location')).toContain(
    'error=signin',
  );
  const identity = await env.DB.prepare(
    'SELECT admission,github_id FROM beta_identities WHERE user_id=?',
  )
    .bind('github:123')
    .first();
  expect(identity).toEqual({ admission: 'public', github_id: '123' });
});
it('reuses stable public admission and pins identity by GitHub ID after a rename', async () => {
  login = 'renamed-public-tester';
  const result = await complete(await start());
  expect(result.headers.get('location')).toContain('connected=1');
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM beta_invites WHERE github_id=?',
  )
    .bind('123')
    .first();
  expect(row).toEqual({ n: 1 });
});
it('public disablement stops existing sessions, callbacks and background GitHub phases', async () => {
  await env.DB.prepare('INSERT INTO beta_connections VALUES (?,?,?,?,?,?)')
    .bind(
      'public/repo',
      'invite-123',
      'github:123',
      '7',
      'main',
      new Date().toISOString(),
    )
    .run();
  const auth = await start();
  env.PUBLIC_BETA_ENABLED = 'false';
  expect((await request('me', undefined, signedCookie)).status).toBe(401);
  expect((await complete(auth)).headers.get('location')).toContain(
    'error=signin',
  );
  await expect(
    workspaceGithub(env as unknown as RunEnv, 'invite-123', 'public/repo'),
  ).rejects.toThrow('Connection unavailable');
  env.PUBLIC_BETA_ENABLED = 'true';
});
it('revocation persists across public login and invalidates existing sessions', async () => {
  await env.DB.prepare('UPDATE beta_invites SET revoked=1 WHERE id=?')
    .bind('public-123')
    .run();
  expect(
    await session(
      new Request('https://api', { headers: { Cookie: signedCookie } }),
      env,
    ),
  ).toBeNull();
  expect((await complete(await start())).headers.get('location')).toContain(
    'error=signin',
  );
  expect(
    await env.DB.prepare('SELECT revoked FROM beta_invites WHERE id=?')
      .bind('public-123')
      .first(),
  ).toEqual({ revoked: 1 });
});
it('does not turn an Access-bound private identity into a public account', async () => {
  githubId = 456;
  login = 'private-user';
  await env.DB.prepare(
    'INSERT INTO beta_identities (user_id,invite_id,github_id,login,access_sub,email) VALUES (?,?,?,?,?,?)',
  )
    .bind(
      'github:456',
      'private-invite',
      '456',
      login,
      'access-private',
      'private@example.test',
    )
    .run();
  expect((await complete(await start())).headers.get('location')).toContain(
    'error=signin',
  );
  expect(
    await env.DB.prepare(
      'SELECT admission FROM beta_identities WHERE user_id=?',
    )
      .bind('github:456')
      .first(),
  ).toEqual({ admission: 'invite' });
});
it('bounds total public repair admissions atomically across workspaces', async () => {
  for (let n = 0; n < 19; n++)
    await env.DB.prepare('INSERT INTO dashboard_repairs VALUES (?,?,?,?,?,?,?)')
      .bind(
        `public-cap-${n}`,
        `invite-fixture-${n}`,
        'github:123',
        'public/repo',
        'a'.repeat(40),
        0,
        new Date().toISOString(),
      )
      .run();
  const attempts = await Promise.allSettled(
    Array.from({ length: 3 }, (_, n) =>
      env.DB.prepare('INSERT INTO dashboard_repairs VALUES (?,?,?,?,?,?,?)')
        .bind(
          `public-race-${n}`,
          `invite-race-${n}`,
          'github:123',
          'public/repo',
          'a'.repeat(40),
          1,
          new Date().toISOString(),
        )
        .run(),
    ),
  );
  expect(attempts.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(attempts.filter((x) => x.status === 'rejected')).toHaveLength(2);
});
it('bounds outstanding public OAuth states in the database', async () => {
  await env.DB.prepare('DELETE FROM beta_oauth_states').run();
  for (let n = 0; n < 100; n++)
    await env.DB.prepare(
      "INSERT INTO beta_oauth_states VALUES (?,?,?,?,?,?,?,0,'public')",
    )
      .bind(
        `state-${n}`,
        'fixture-browser',
        'public',
        'public',
        'public@greenci.invalid',
        'fixture-verifier',
        new Date(Date.now() + 600000).toISOString(),
      )
      .run();
  expect((await request('public/start', {})).status).toBe(429);
});
