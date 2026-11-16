import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { loadConfig } from '@greenci/core';
import type { ApiEnv } from './env.js';
import { digest } from './invite-auth.js';

export async function beginAuthorization(
  c: Context<{ Bindings: ApiEnv }>,
  inviteId: string,
  access: { sub: string; email: string },
  admission: 'invite' | 'public',
  origin: string,
  emailAccountId?: string,
) {
  const cfg = loadConfig(c.env);
  const state = crypto.randomUUID(),
    browser = crypto.randomUUID(),
    verifier = crypto.randomUUID() + crypto.randomUUID();
  const challenge = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  const encoded = btoa(String.fromCharCode(...new Uint8Array(challenge)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  await c.env.DB.prepare('DELETE FROM beta_oauth_states WHERE expires_at<?')
    .bind(new Date().toISOString())
    .run();
  await c.env.DB.prepare(
    'INSERT INTO beta_oauth_states (state_hash,browser_hash,invite_id,access_sub,email,verifier,expires_at,admission,email_account_id) VALUES (?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      await digest(state),
      await digest(browser),
      inviteId,
      access.sub,
      access.email.toLowerCase(),
      verifier,
      new Date(Date.now() + 600000).toISOString(),
      admission,
      emailAccountId ?? null,
    )
    .run();
  setCookie(c, 'greenci_oauth', browser, {
    httpOnly: true,
    secure: cfg.APP_ENV !== 'local',
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  const target = new URL('https://github.com/login/oauth/authorize');
  target.search = new URLSearchParams({
    client_id: cfg.GITHUB_CLIENT_ID,
    redirect_uri: `${origin}/api/client/invite/callback`,
    state,
    code_challenge: encoded,
    code_challenge_method: 'S256',
  }).toString();
  return c.json({ url: target.toString() });
}
