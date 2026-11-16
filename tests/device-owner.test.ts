import { expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile } from 'node:fs/promises';
import { ownsDevPad } from '../apps/api/src/device-owner.js';
it('does not grant the physical pad to another public workspace owner', async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response()}}',
      d1Databases: ['DB'],
    }),
  );
  try {
    const DB = await mf.getD1Database('DB');
    await DB.exec(
      (await readFile('packages/db/migrations/0002_domain.sql', 'utf8'))
        .replace(/--[^\n]*/g, '')
        .replace(/\n/g, ' '),
    );
    for (const [id, login] of [
      ['github:1', 'chilu18'],
      ['github:2', 'outside'],
    ]) {
      await DB.prepare('INSERT INTO users(id,login) VALUES (?,?)')
        .bind(id, login)
        .run();
      await DB.prepare(
        'INSERT INTO memberships(id,user_id,org_id,role) VALUES (?,?,?,?)',
      )
        .bind(id, id, 'invite-' + id, 'owner')
        .run();
    }
    const config = {
      APP_ENV: 'dev' as const,
      BETA_ENABLED: 'true' as const,
      BETA_OWNER_LOGIN: 'chilu18',
    };
    const owner = { userId: 'github:1', orgId: 'invite-github:1' };
    expect(await ownsDevPad({ DB }, config, owner)).toBe(true);
    expect(
      await ownsDevPad({ DB }, config, {
        userId: 'github:2',
        orgId: 'invite-github:2',
      }),
    ).toBe(false);
    expect(
      await ownsDevPad({ DB }, config, { ...owner, orgId: 'invite-github:2' }),
    ).toBe(false);
    expect(
      await ownsDevPad({ DB }, { ...config, APP_ENV: 'prod' }, owner),
    ).toBe(false);
    expect(
      await ownsDevPad({ DB }, { ...config, BETA_OWNER_LOGIN: '' }, owner),
    ).toBe(false);
    await DB.prepare("UPDATE memberships SET role='member' WHERE user_id=?")
      .bind(owner.userId)
      .run();
    expect(await ownsDevPad({ DB }, config, owner)).toBe(false);
  } finally {
    await mf.dispose();
  }
});
