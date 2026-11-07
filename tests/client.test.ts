import { expect, it } from 'vitest';
import { createCliClient } from '../packages/cli/src/index.js';
import { createMobileClient } from '../apps/mobile/src/index.js';
import { runSchema } from '../packages/core/src/index.js';
it('CLI and mobile adapters use the same authenticated actions as the on-screen deck', async () => {
  for (const factory of [createCliClient, createMobileClient]) {
    const actions: string[] = [];
    const client = factory({
      baseUrl: 'https://fixture/v1',
      token: 'fixture-session',
      transport: async (url, init) => {
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer fixture-session',
        );
        if (init?.method === 'POST') {
          actions.push(
            (JSON.parse(String(init.body)) as { action: string }).action,
          );
          return Response.json({ accepted: true }, { status: 202 });
        }
        return Response.json([
          runSchema.parse({
            id: '1',
            repo: 'acme/web',
            orgId: 'acme',
            headSha: 'abc',
            branch: 'main',
            failingCheckName: 'test',
          }),
        ]);
      },
    });
    expect((await client.runs())[0]?.repo).toBe('acme/web');
    for (const action of ['diagnose', 'repair', 'verify', 'approve'] as const)
      await client.action('1', action);
    expect(actions).toEqual(['diagnose', 'repair', 'verify', 'approve']);
  }
});
