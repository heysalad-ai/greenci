import type { Config } from '@greenci/core';
import type { ApiEnv } from './env.js';
export async function ownsDevPad(
  env: Pick<ApiEnv, 'DB'>,
  config: Pick<Config, 'APP_ENV' | 'BETA_ENABLED' | 'BETA_OWNER_LOGIN'>,
  user: { userId: string; orgId: string },
) {
  if (
    config.APP_ENV !== 'dev' ||
    config.BETA_ENABLED !== 'true' ||
    !config.BETA_OWNER_LOGIN
  )
    return false;
  return Boolean(
    await env.DB.prepare(
      'SELECT m.id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.org_id=? AND m.role=? AND lower(u.login)=lower(?)',
    )
      .bind(user.userId, user.orgId, 'owner', config.BETA_OWNER_LOGIN)
      .first(),
  );
}
