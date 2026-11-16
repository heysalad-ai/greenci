import { z } from 'zod';
import { identitySchema } from '@greenci/github';
import type { ApiEnv } from './env.js';
import { digest, inviteSchema } from './invite-auth.js';

export async function admitPublicSignIn(env: ApiEnv, address: string) {
  if (!address || address === 'unknown' || address.length > 64)
    throw new Error('Missing edge identity');
  const key = await digest(`${Math.floor(Date.now() / 300000)}:${address}`);
  await env.DB.prepare('DELETE FROM public_auth_rate WHERE expires_at<?')
    .bind(new Date().toISOString())
    .run();
  const result = await env.DB.prepare(
    'INSERT INTO public_auth_rate VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
  )
    .bind(key, new Date(Date.now() + 3600000).toISOString())
    .first<{ attempts: number }>();
  if (!result || result.attempts > 10)
    throw new Error('Public sign-in rate limit');
}

/** Stable GitHub IDs preserve revocation across repeated public sign-ins. */
export async function publicAdmission(
  env: ApiEnv,
  identity: z.infer<typeof identitySchema>,
) {
  const userId = `github:${identity.id}`;
  const existing = await env.DB.prepare(
    'SELECT admission FROM beta_identities WHERE user_id=?',
  )
    .bind(userId)
    .first<{ admission: string }>();
  // Public signup cannot silently remove an existing Access/invitation binding.
  if (existing && existing.admission !== 'public')
    throw new Error('Existing private admission');
  const id = `public-${identity.id}`,
    email = `github-${identity.id}@accounts.greenci.invalid`,
    expires = new Date(Date.now() + 7 * 86400000).toISOString();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO beta_invites (id,token_hash,email,login,expires_at,github_id,created_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(
      id,
      await digest(crypto.randomUUID() + crypto.randomUUID()),
      email,
      identity.login,
      expires,
      String(identity.id),
      new Date().toISOString(),
    )
    .run();
  await env.DB.prepare(
    'UPDATE beta_invites SET login=?,expires_at=? WHERE id=? AND revoked=0 AND github_id=?',
  )
    .bind(identity.login, expires, id, String(identity.id))
    .run();
  const invite = inviteSchema.parse(
    await env.DB.prepare('SELECT * FROM beta_invites WHERE id=?')
      .bind(id)
      .first(),
  );
  if (invite.revoked || invite.github_id !== String(identity.id))
    throw new Error('Public account revoked');
  await env.DB.prepare(
    "UPDATE beta_identities SET login=? WHERE user_id=? AND admission='public'",
  )
    .bind(identity.login, userId)
    .run();
  return { invite, access: { sub: `github:${identity.id}`, email } };
}
