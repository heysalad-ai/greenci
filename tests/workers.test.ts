import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { parse } from 'jsonc-parser';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
let mf: Miniflare;
let temporary: string;
let makeRuntime: (
  overrides: Record<string, string>,
) => ConstructorParameters<typeof Miniflare>[0];
const url = 'http://localhost';
async function request(route: string, body?: unknown) {
  return mf.dispatchFetch(
    url + route,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
}
beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'greenci-workers-'));
  for (const name of ['api', 'sandbox'])
    await build({
      entryPoints: [`apps/${name}/src/index.ts`],
      outfile: path.join(temporary, `${name}.mjs`),
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      mainFields: ['module', 'main'],
      conditions: ['workerd', 'worker'],
      external: ['cloudflare:*', 'node:*'],
    });
  const config = parse(await readFile('apps/api/wrangler.jsonc', 'utf8')) as {
    vars: Record<string, string>;
  };
  makeRuntime = (overrides) =>
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'api',
          modules: true,
          modulesRoot: temporary,
          scriptPath: path.join(temporary, 'api.mjs'),
          compatibilityDate: '2026-11-06',
          compatibilityFlags: ['nodejs_compat'],
          bindings: { ...config.vars, ...overrides },
          d1Databases: { DB: 'greenci-local' },
          kvNamespaces: ['SESSIONS'],
          r2Buckets: ['ARTIFACTS'],
          durableObjects: {
            ORG_ROOMS: { className: 'OrgRoom', useSQLite: true },
            DECK_SESSIONS: { className: 'DeckSession', useSQLite: true },
          },
          workflows: {
            RUN_WORKFLOW: {
              name: 'greenci-runs-local',
              className: 'RunWorkflow',
            },
          },
          queueProducers: { EVENTS: 'greenci-events-local' },
          queueConsumers: { 'greenci-events-local': { maxBatchTimeout: 0.1 } },
          serviceBindings: { SANDBOX_SERVICE: 'sandbox' },
        },
        {
          name: 'sandbox',
          modules: true,
          modulesRoot: temporary,
          scriptPath: path.join(temporary, 'sandbox.mjs'),
          compatibilityDate: '2026-11-06',
        },
      ],
    });
  mf = new Miniflare(makeRuntime({}));
  const db = await mf.getD1Database('DB', 'api');
  const sql = (
    await readFile('packages/db/migrations/0001_platform.sql', 'utf8')
  ).replace(/^--.*$/gm, '');
  await db.exec(sql);
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

describe('real local Workers bindings', () => {
  it('serves Hono health and Zod OpenAPI; rejects unimplemented routes and invalid inputs', async () => {
    const response = await request('/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'api',
      milestone: 'M0.5',
    });
    const spec = (await (await request('/openapi.json')).json()) as {
      paths: Record<string, unknown>;
    };
    expect(spec.paths['/healthz']).toBeDefined();
    expect(
      (
        await mf.dispatchFetch(url + '/deck?serial=GC-test', {
          headers: { Origin: 'https://untrusted.example' },
        })
      ).status,
    ).toBe(403);
    expect(
      (await request('/__local/workflows', { requiresApproval: 'invalid' }))
        .status,
    ).toBe(400);
    expect((await request('/runs/1/merge', {})).status).toBe(404);
  });
  it('executes D1, KV, R2 and sandbox service binding operations', async () => {
    const response = await request('/__local/bindings');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      d1: true,
      kv: true,
      r2: true,
      sandbox: {
        status: 'ok',
        service: 'sandbox',
        mode: 'none',
        executionEnabled: false,
      },
    });
  });
  it('reads the local D1 outbox with schema validation', async () => {
    const created = await request('/__local/emails', {
      subject: 'Transport test',
      body: 'This is a local test email.',
    });
    expect(created.status).toBe(201);
    const email = await created.json();
    expect(await (await request('/__local/emails')).json()).toEqual([email]);
  });
  it('consumes Queues and fans out through the hibernatable OrgRoom', async () => {
    const response = await mf.dispatchFetch(url + '/live', {
      headers: { Upgrade: 'websocket' },
    });
    const socket = response.webSocket!;
    const messages: string[] = [];
    socket.addEventListener('message', (event) =>
      messages.push(String(event.data)),
    );
    socket.accept();
    try {
      const sent = await request('/__local/events', {
        type: 'transport.probe',
      });
      expect(sent.status).toBe(202);
      const { id } = (await sent.json()) as { id: string };
      const db = await mf.getD1Database('DB', 'api');
      await expect
        .poll(
          async () =>
            (
              await db
                .prepare('SELECT COUNT(*) AS n FROM platform_events WHERE id=?')
                .bind(id)
                .first<{ n: number }>()
            )?.n,
          { timeout: 10_000 },
        )
        .toBe(1);
      await expect
        .poll(() => messages.some((text) => text.includes(id)), {
          timeout: 10_000,
        })
        .toBe(true);
    } finally {
      socket.close(1000);
    }
  });
  it('connects SSE without requiring a WebSocket-capable CLI', async () => {
    const response = await request('/events');
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      ': connected',
    );
    await reader.cancel();
  });
  it('requires a matching hello and acknowledges deck keys without executing jobs', async () => {
    const response = await mf.dispatchFetch(url + '/deck?serial=GC-test', {
      headers: { Upgrade: 'websocket' },
    });
    const socket = response.webSocket!;
    const messages: string[] = [];
    socket.addEventListener('message', (event) =>
      messages.push(String(event.data)),
    );
    socket.accept();
    try {
      socket.send(
        JSON.stringify({ type: 'hello', serial: 'GC-test', firmware: 'test' }),
      );
      await expect
        .poll(() => messages.some((text) => text.includes('key-ready')))
        .toBe(true);
      socket.send(
        JSON.stringify({ type: 'key', key: 'command', action: 'long_press' }),
      );
      await expect
        .poll(() =>
          messages.some(
            (text) =>
              text.includes('"type":"ack"') && text.includes('long_press'),
          ),
        )
        .toBe(true);
    } finally {
      socket.close(1000);
    }
    const invalid = await mf.dispatchFetch(url + '/deck?serial=GC-other', {
      headers: { Upgrade: 'websocket' },
    });
    const bad = invalid.webSocket!;
    let code = 0;
    bad.addEventListener('close', (event) => {
      code = event.code;
    });
    bad.accept();
    bad.send(
      JSON.stringify({ type: 'hello', serial: 'GC-test', firmware: 'test' }),
    );
    await expect.poll(() => code).toBe(1008);
  });
  it('suspends a Workflow for each key and for explicit approval', async () => {
    const created = await request('/__local/workflows', {
      requiresApproval: true,
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const db = await mf.getD1Database('DB', 'api');
    for (const [index, type] of ['diagnose', 'repair', 'verify'].entries()) {
      expect(
        (await request(`/__local/workflows/${id}/events`, { type })).status,
      ).toBe(202);
      await expect
        .poll(
          async () =>
            (
              await db
                .prepare(
                  'SELECT COUNT(*) AS n FROM workflow_probes WHERE id LIKE ?',
                )
                .bind(id + ':%')
                .first<{ n: number }>()
            )?.n,
          { timeout: 10_000 },
        )
        .toBe(index + 1);
    }
    expect(
      (
        (await (await request(`/__local/workflows/${id}`)).json()) as {
          status: string;
        }
      ).status,
    ).not.toBe('complete');
    expect(
      (await request(`/__local/workflows/${id}/events`, { type: 'approval' }))
        .status,
    ).toBe(202);
    await expect
      .poll(
        async () =>
          (
            (await (await request(`/__local/workflows/${id}`)).json()) as {
              status: string;
            }
          ).status,
        { timeout: 10_000 },
      )
      .toBe('complete');
    expect(
      (
        (await (await request(`/__local/workflows/${id}`)).json()) as {
          output: unknown;
        }
      ).output,
    ).toEqual({
      kind: 'scaffold_transport',
      agentExecuted: false,
      approvalsRequired: true,
    });
  }, 30_000);
});

it('dev scaffold health is operational without integration credentials, while every action stays disabled', async () => {
  const dev = new Miniflare(
    makeRuntime({
      APP_ENV: 'dev',
      GITHUB_MODE: 'app',
      EMAIL_PROVIDER: 'resend',
      SANDBOX: 'cloudflare',
      SCAFFOLD_ONLY: 'true',
    }),
  );
  try {
    const response = await dev.dispatchFetch(url + '/healthz');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      mode: 'scaffold',
      integrations: 'disabled',
    });
    expect(
      (
        await dev.dispatchFetch(url + '/__local/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requiresApproval: true }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await dev.dispatchFetch(url + '/healthz', { method: 'POST' })).status,
    ).toBe(404);
    for (const route of [
      '/__local/emails',
      '/deck?serial=GC-test',
      '/events',
      '/live',
      '/openapi.json',
    ])
      expect((await dev.dispatchFetch(url + route)).status).toBe(404);
  } finally {
    await dev.dispose();
  }
});
