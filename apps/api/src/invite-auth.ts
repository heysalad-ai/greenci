import { z } from 'zod';
import type { ApiEnv } from './env.js';
export const inviteSchema = z.object({
  id: z.string(),
  email: z.email(),
  login: z.string(),
  expires_at: z.string(),
  revoked: z.number(),
  github_id: z.string().nullable(),
});
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, '0'),
  ).join('');
}
export const freshInvite = (value: { revoked: number; expires_at: string }) =>
  !value.revoked && Date.parse(value.expires_at) > Date.now();
export async function invitedIdentity(env: Pick<ApiEnv, 'DB'>, userId: string) {
  const row = await env.DB.prepare(
    'SELECT b.*,i.expires_at,i.revoked FROM beta_identities b JOIN beta_invites i ON i.id=b.invite_id WHERE b.user_id=?',
  )
    .bind(userId)
    .first<{
      user_id: string;
      invite_id: string;
      github_id: string;
      login: string;
      access_sub: string;
      email: string;
      expires_at: string;
      revoked: number;
    }>();
  if (!row || !freshInvite(row))
    throw new Error('Invitation expired or revoked');
  return row;
}
