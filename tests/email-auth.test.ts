import { afterAll, beforeAll, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { emailRoutes } from '../apps/api/src/email-auth.js';
import { inviteRoutes } from '../apps/api/src/invite.js';
import { workspaceGithub } from '../apps/worker/src/workspace-github.js';
import type { RunEnv } from '../apps/worker/src/domain.js';
import { session } from '../apps/api/src/session.js';
import type { ApiEnv } from '../apps/api/src/env.js';
let mf: Miniflare, env: ApiEnv;
let delivered = '',
  deliveryFails = false;
const origin = 'https://email.example';
const app = emailRoutes({
  deliver: async (_env, _email, code) => {
    if (deliveryFails) throw new Error('delivery rejected');
    delivered = code;
  },
});
const request = (
  path: string,
  body: unknown,
  cookie = '',
  requestOrigin = origin,
) =>
  app.request(
    `https://api/v1/email/${path}`,
    {
      method: 'POST',
      headers: {
        Origin: requestOrigin,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    env,
  );
async function start(email = `${crypto.randomUUID()}@example.com`) {
  const response = await request('start', { email });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { challenge: string };
  expect(body).toEqual({ challenge: expect.any(String) });
  return {
    challenge: body.challenge,
    code: delivered,
    cookie: response.headers.get('set-cookie')!.split(';')[0]!,
    email,
  };
}
async function verify(input: Awaited<ReturnType<typeof start>>) {
  return request(
    'verify',
    { challenge: input.challenge, code: input.code },
    input.cookie,
  );
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("fixture")}}',
      d1Databases: { DB: 'email-test' },
      kvNamespaces: ['SESSIONS'],
    }),
  );
  const db = await mf.getD1Database('DB');
  for (const name of [
    '0002_domain.sql',
    '0005_dashboard_repairs.sql',
    '0006_invite_beta.sql',
    '0007_public_beta.sql',
    '0008_email_auth.sql',
  ]) {
    const [tables, ...triggers] = (
      await readFile(`packages/db/migrations/${name}`, 'utf8')
    )
      .replace(/--[^\n]*/g, '')
      .split('CREATE TRIGGER');
    await db.exec(tables!.replace(/\n/g, ' '));
    for (const trigger of triggers)
      await db.prepare('CREATE TRIGGER' + trigger).run();
  }
  env = {
    DB: db,
    SESSIONS: await mf.getKVNamespace('SESSIONS'),
    EMAIL_AUTH_ENABLED: 'true',
    INVITE_BETA_ENABLED: 'true',
    PUBLIC_BETA_ENABLED: 'true',
    PUBLIC_BETA_URL: origin,
    GITHUB_CLIENT_ID: 'fixture',
    GITHUB_CLIENT_SECRET: 'fixture',
  } as unknown as ApiEnv;
});
afterAll(() => mf?.dispose());
it('registers a verified email without a password and reuses its isolated account on login', async () => {
  const first = await start('Test@Example.com'),
    response = await verify(first);
  expect(response.status).toBe(200);
  const cookie = response.headers
    .get('set-cookie')!
    .match(/greenci_session=[^;]+/)![0];
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  const user = await session(
    new Request('https://api', { headers: { Cookie: cookie } }),
    env,
  );
  expect(user!.userId).toMatch(/^email:/);
  expect(user!.orgId).toMatch(/^invite-email-/);
  await expect(
    workspaceGithub(
      env as unknown as RunEnv,
      user!.orgId,
      'heysalad-ai/greenci',
    ),
  ).rejects.toThrow('Connection unavailable');
  const me = await inviteRoutes().request(
    'https://api/v1/invite/me',
    { headers: { Cookie: cookie } },
    env,
  );
  expect(await me.json()).toMatchObject({
    email: 'test@example.com',
    githubConnected: false,
    githubAuthorized: false,
    admin: false,
    installUrl: null,
  });
  const next = await start('test@example.com'),
    signedIn = await verify(next);
  const again = await session(
    new Request('https://api', {
      headers: {
        Cookie: signedIn.headers
          .get('set-cookie')!
          .match(/greenci_session=[^;]+/)![0],
      },
    }),
    env,
  );
  expect(again!.userId).toBe(user!.userId);
  expect(
    (await env.DB.prepare('SELECT id FROM email_accounts').all()).results,
  ).toHaveLength(1);
  expect(
    await session(
      new Request('https://api', {
        method: 'POST',
        headers: { Cookie: cookie },
      }),
      env,
    ),
  ).toBeNull();
  await env.DB.prepare('UPDATE email_accounts SET revoked=1 WHERE email=?')
    .bind('test@example.com')
    .run();
  expect(
    await session(
      new Request('https://api', { headers: { Cookie: cookie } }),
      env,
    ),
  ).toBeNull();
});
it('rejects a different browser, an expired code and code replay', async () => {
  const challenge = await start();
  expect(
    (
      await request(
        'verify',
        { challenge: challenge.challenge, code: challenge.code },
        'greenci_email=wrong',
      )
    ).status,
  ).toBe(401);
  expect((await verify(challenge)).status).toBe(200);
  expect((await verify(challenge)).status).toBe(401);
  const expired = await start();
  await env.DB.prepare('UPDATE email_challenges SET expires_at=? WHERE id=?')
    .bind('2000-01-01', expired.challenge)
    .run();
  expect((await verify(expired)).status).toBe(401);
});
it('permits one concurrent redemption and locks out after five wrong attempts', async () => {
  const one = await start();
  expect(
    (await Promise.all([verify(one), verify(one)])).map((r) => r.status).sort(),
  ).toEqual([200, 401]);
  const locked = await start();
  for (let i = 0; i < 5; i++)
    expect(
      (
        await request(
          'verify',
          {
            challenge: locked.challenge,
            code: locked.code === '00000000' ? '00000001' : '00000000',
          },
          locked.cookie,
        )
      ).status,
    ).toBe(401);
  expect((await verify(locked)).status).toBe(401);
});
it('limits email sends, fails closed on delivery errors and never returns the code', async () => {
  // A separate edge address isolates the IP quota from earlier scenarios.
  const old = env.APP_ENV;
  env.APP_ENV = 'local';
  const email = 'limited@example.com';
  await env.DB.prepare('DELETE FROM public_auth_rate').run();
  for (let i = 0; i < 3; i++) await start(email);
  expect((await request('start', { email })).status).toBe(429);
  deliveryFails = true;
  expect(
    (await request('start', { email: 'delivery@example.com' })).status,
  ).toBe(503);
  deliveryFails = false;
  env.APP_ENV = old;
  const hashes = (
    await env.DB.prepare('SELECT code_hash FROM email_challenges').all<{
      code_hash: string;
    }>()
  ).results;
  expect(hashes.every((row) => /^[a-f0-9]{64}$/.test(row.code_hash))).toBe(
    true,
  );
});
it('validates origin/body and gates auth off without changing GitHub sign-in', async () => {
  expect(
    (
      await request(
        'start',
        { email: 'valid@example.com' },
        '',
        'https://evil.example',
      )
    ).status,
  ).toBe(403);
  expect((await request('start', { email: 'invalid' })).status).toBe(400);
  expect(
    (await request('start', { email: 'valid@example.com', extra: true }))
      .status,
  ).toBe(400);
  env.EMAIL_AUTH_ENABLED = 'false';
  expect((await request('start', { email: 'valid@example.com' })).status).toBe(
    404,
  );
  env.EMAIL_AUTH_ENABLED = 'true';
});
it('requires a CSRF-protected email session before preparing an explicit GitHub link', async () => {
  await env.DB.prepare('DELETE FROM public_auth_rate').run();
  const code = await start(),
    verified = await verify(code),
    cookie = verified.headers
      .get('set-cookie')!
      .match(/greenci_session=[^;]+/)![0];
  expect((await request('github', {}, cookie)).status).toBe(403);
  const user = (await session(
    new Request('https://api', { headers: { Cookie: cookie } }),
    env,
  ))!;
  const link = await app.request(
    'https://api/v1/email/github',
    {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': user.csrf },
    },
    env,
  );
  expect(link.status).toBe(200);
  const target = new URL(((await link.json()) as { url: string }).url);
  expect(target.origin).toBe('https://github.com');
  expect(
    (await env.DB.prepare(
      'SELECT email_account_id FROM beta_oauth_states',
    ).first<{ email_account_id: string }>())!.email_account_id,
  ).toBe(user.emailAccountId);
});

it('links only after fresh GitHub consent in the same email session and reuses that workspace on later email login', async () => {
  await env.DB.prepare('DELETE FROM public_auth_rate').run();
  const challenge = await start(),
    verified = await verify(challenge),
    cookie = verified.headers
      .get('set-cookie')!
      .match(/greenci_session=[^;]+/)![0];
  const user = (await session(
    new Request('https://api', { headers: { Cookie: cookie } }),
    env,
  ))!;
  const link = await app.request(
    'https://api/v1/email/github',
    {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': user.csrf },
    },
    env,
  );
  const target = new URL(((await link.json()) as { url: string }).url),
    oauthCookie = link.headers.get('set-cookie')!.split(';')[0]!;
  const github = inviteRoutes({
    transport: async (input) => {
      if (String(input) === 'https://github.com/login/oauth/access_token')
        return Response.json({ access_token: 'fixture-token' });
      if (String(input) === 'https://api.github.com/user')
        return Response.json({ id: 91234, login: 'email-linked-tester' });
      throw new Error('Unexpected provider request');
    },
  });
  const callback = await github.request(
    `https://api/v1/invite/callback?state=${target.searchParams.get('state')}&code=fixture-code`,
    { headers: { Cookie: `${cookie}; ${oauthCookie}` } },
    env,
  );
  expect(callback.headers.get('location')).toBe(`${origin}/beta?connected=1`);
  const account = await env.DB.prepare(
    'SELECT github_user_id FROM email_accounts WHERE id=?',
  )
    .bind(user.emailAccountId)
    .first<{ github_user_id: string }>();
  expect(account!.github_user_id).toBe('github:91234');
  // The old unlinked session is invalid once the account is linked.
  expect(
    await session(
      new Request('https://api', { headers: { Cookie: cookie } }),
      env,
    ),
  ).toBeNull();
  const again = await start(challenge.email),
    signedIn = await verify(again);
  const canonical = await session(
    new Request('https://api', {
      headers: {
        Cookie: signedIn.headers
          .get('set-cookie')!
          .match(/greenci_session=[^;]+/)![0],
      },
    }),
    env,
  );
  expect(canonical).toMatchObject({
    userId: 'github:91234',
    orgId: 'invite-91234',
  });
});

it('rejects a GitHub link callback after the email session changes and does not consume provider credentials', async () => {
  await env.DB.prepare('DELETE FROM public_auth_rate').run();
  const challenge = await start(),
    verified = await verify(challenge),
    cookie = verified.headers
      .get('set-cookie')!
      .match(/greenci_session=[^;]+/)![0];
  const user = (await session(
    new Request('https://api', { headers: { Cookie: cookie } }),
    env,
  ))!;
  const link = await app.request(
    'https://api/v1/email/github',
    {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'X-CSRF-Token': user.csrf },
    },
    env,
  );
  const target = new URL(((await link.json()) as { url: string }).url),
    oauthCookie = link.headers.get('set-cookie')!.split(';')[0]!;
  const github = inviteRoutes({
    transport: async () => {
      throw new Error('Provider must not be called');
    },
  });
  const callback = await github.request(
    `https://api/v1/invite/callback?state=${target.searchParams.get('state')}&code=fixture`,
    { headers: { Cookie: oauthCookie } },
    env,
  );
  expect(callback.headers.get('location')).toBe(`${origin}/beta?error=signin`);
  expect(
    (await env.DB.prepare(
      'SELECT github_user_id FROM email_accounts WHERE id=?',
    )
      .bind(user.emailAccountId)
      .first<{ github_user_id: string | null }>())!.github_user_id,
  ).toBeNull();
});
