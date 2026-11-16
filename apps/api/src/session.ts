import { z } from 'zod';
import { loadConfig } from '@greenci/core';
import type { ApiEnv } from './env.js';
import { invitedIdentity } from './invite-auth.js';
const sessionSchema = z.object({
  userId: z.string(),
  orgId: z.string(),
  csrf: z.string(),
});
export async function session(request: Request, env: ApiEnv) {
  const header = request.headers.get('Authorization');
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : request.headers
        .get('Cookie')
        ?.match(/(?:^|;\s*)greenci_session=([^;]+)/)?.[1];
  if (!token || !/^[a-f0-9-]{36}$/.test(token)) return null;
  const raw = await env.SESSIONS.get(`session:${token}`);
  if (!raw) return null;
  const result = sessionSchema.safeParse(JSON.parse(raw));
  if (!result.success) return null;
  const member = await env.DB.prepare(
    'SELECT id FROM memberships WHERE user_id=? AND org_id=?',
  )
    .bind(result.data.userId, result.data.orgId)
    .first();
  if (!member) return null;
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    !header &&
    request.headers.get('X-CSRF-Token') !== result.data.csrf
  )
    return null;
  if (result.data.userId.startsWith('github:')) {
    try {
      const cfg = loadConfig(env);
      if (
        cfg.INVITE_BETA_ENABLED !== 'true' ||
        !['local', 'dev'].includes(cfg.APP_ENV)
      )
        return null;
      const identity = await invitedIdentity(env, result.data.userId);
      if (identity.admission === 'public' && cfg.PUBLIC_BETA_ENABLED !== 'true')
        return null;
    } catch {
      return null;
    }
  }
  return result.data;
}
