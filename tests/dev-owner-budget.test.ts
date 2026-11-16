import { expect, it } from 'vitest';
import { configSchema, dailyRepairLimit } from '../packages/core/src/config.js';
it('keeps the two-run public budget and scopes extra filming runs to the named dev owner', () => {
  const config = configSchema.parse({
    APP_ENV: 'dev',
    BETA_OWNER_LOGIN: 'chilu18',
    DEV_OWNER_DAILY_REPAIRS: 3,
  });
  expect(dailyRepairLimit(config, 'chilu18')).toBe(3);
  expect(dailyRepairLimit(config, 'outside-user')).toBe(2);
  expect(dailyRepairLimit({ ...config, APP_ENV: 'prod' }, 'chilu18')).toBe(2);
  expect(dailyRepairLimit({ ...config, BETA_OWNER_LOGIN: '' }, '')).toBe(2);
  expect(configSchema.safeParse({ DEV_OWNER_DAILY_REPAIRS: 11 }).success).toBe(
    false,
  );
  expect(
    dailyRepairLimit(
      configSchema.parse({ APP_ENV: 'dev', BETA_OWNER_LOGIN: 'chilu18' }),
      'chilu18',
    ),
  ).toBe(2);
});

it('enforces an expiring workspace allowance atomically without lifting other workspace limits', async () => {
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const { readFile } = await import('node:fs/promises');
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response()}}',
      d1Databases: ['DB'],
    }),
  );
  try {
    const db = await mf.getD1Database('DB');
    await db.exec(
      (
        await readFile(
          'packages/db/migrations/0005_dashboard_repairs.sql',
          'utf8',
        )
      )
        .replace(/--[^\n]*/g, '')
        .replace(/\n/g, ' '),
    );
    const [tables, trigger] = (
      await readFile(
        'packages/db/migrations/0009_dev_repair_budget.sql',
        'utf8',
      )
    )
      .replace(/--[^\n]*/g, '')
      .split('CREATE TRIGGER');
    await db.exec(tables!.replace(/\n/g, ' '));
    await db.prepare('CREATE TRIGGER' + trigger).run();
    const add = (org: string, n: number) =>
      db
        .prepare('INSERT INTO dashboard_repairs VALUES (?,?,?,?,?,0,?)')
        .bind(
          org + n,
          org,
          'github:fixture',
          'fixture/repo',
          'a'.repeat(40),
          new Date().toISOString(),
        )
        .run();
    for (const org of ['invite-owner', 'invite-other']) {
      await add(org, 1);
      await add(org, 2);
      await expect(add(org, 3)).rejects.toThrow('Beta repair admission limit');
    }
    await db
      .prepare('INSERT INTO dev_repair_budgets VALUES (?,?,?)')
      .bind('invite-owner', 3, new Date(Date.now() + 60000).toISOString())
      .run();
    await add('invite-owner', 3);
    await expect(add('invite-owner', 4)).rejects.toThrow(
      'Beta repair admission limit',
    );
    await expect(add('invite-other', 3)).rejects.toThrow(
      'Beta repair admission limit',
    );
    await db
      .prepare('UPDATE dev_repair_budgets SET expires_at=?')
      .bind('2000-01-01T00:00:00.000Z')
      .run();
    await expect(add('invite-owner', 4)).rejects.toThrow(
      'Beta repair admission limit',
    );
  } finally {
    await mf.dispose();
  }
});
