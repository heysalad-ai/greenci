import { buildServer } from '../apps/mock-github/src/server.js';
import { MockGitHubClient, signWebhook } from '../packages/github/src/index.js';
import { RunRepository } from '../packages/db/src/repository.js';
import { runSchema, transition } from '../packages/core/src/index.js';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { parse } from 'jsonc-parser';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
let mf: Miniflare;
let mockServer: Awaited<ReturnType<typeof buildServer>>;
let mockClient: MockGitHubClient;
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
  mockServer = await buildServer({ root: path.join(temporary, 'mock-repos') });
  const mockUrl = await mockServer.listen({ host: '127.0.0.1', port: 0 });
  mockClient = new MockGitHubClient(mockUrl);
  mf = new Miniflare(makeRuntime({ MOCK_GITHUB_URL: mockUrl }));
  const db = await mf.getD1Database('DB', 'api');
  const sql = (
    await readFile('packages/db/migrations/0001_platform.sql', 'utf8')
  ).replace(/^--.*$/gm, '');
  await db.exec(sql);
  await db.exec(
    (await readFile('packages/db/migrations/0002_domain.sql', 'utf8')).replace(
      /^--.*$/gm,
      '',
    ),
  );
}, 30_000);
afterAll(async () => {
  await mf?.dispose();
  await mockServer?.close();
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

it('D1 persists validated runs and append-only events atomically, rejects stale writes and separates orgs', async () => {
  const db = await mf.getD1Database('DB', 'api');
  const repository = new RunRepository(db as unknown as D1Database);
  const run = runSchema.parse({
    id: 'data-test',
    repo: 'acme/payments',
    orgId: 'acme',
    headSha: 'fixture-sha',
    branch: 'main',
    failingCheckName: 'test',
  });
  await repository.create(run);
  const first = await repository.get(run.id, 'acme');
  const result = transition(first.run, { type: 'diagnose' });
  await repository.save(
    result.run,
    first.version,
    'event-1',
    'diagnose',
    result.effects,
  );
  await repository.save(
    result.run,
    first.version,
    'event-1',
    'diagnose',
    result.effects,
  );
  expect(await repository.events(run.id)).toHaveLength(1);
  await expect(
    repository.save(result.run, first.version, 'event-2', 'diagnose'),
  ).rejects.toThrow('concurrently');
  expect(await repository.events(run.id)).toHaveLength(1);
  await expect(repository.get(run.id, 'other')).rejects.toThrow('not found');
  expect(await repository.list('other')).toEqual([]);
  expect((await repository.get(run.id)).run.state).toBe('diagnosing');
});

async function waitForRun(id: string, state: string) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const db = await mf.getD1Database('DB', 'api'),
      repository = new RunRepository(db as unknown as D1Database);
    try {
      const { run } = await repository.get(id);
      if (run.state === state) return run;
    } catch {
      /* Queue delivery pending. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const status = await (await request(`/__local/workflows/${id}`)).json();
  const db = await mf.getD1Database('DB', 'api');
  const row = await db
    .prepare('SELECT state FROM runs WHERE id=?')
    .bind(id)
    .first();
  throw new Error(
    `Run did not reach ${state}: ${JSON.stringify({ status, row })}`,
  );
}
it('authenticated HTTP + signed webhook + real Workflow completes all four journeys', async () => {
  const db = await mf.getD1Database('DB', 'api');
  await db.exec(
    "INSERT INTO memberships (id,user_id,org_id,role) VALUES ('sam:acme','sam','acme','owner'),('sam:greenci','sam','greenci','owner'); INSERT INTO repos (id,org_id,full_name,default_branch,watched) VALUES ('acme/payments','acme','acme/payments','main',1),('acme/ledger','acme','acme/ledger','main',1),('greenci/practice','greenci','greenci/practice','main',1);",
  );
  expect((await request('/v1/runs')).status).toBe(401);
  const login = await request('/__local/session', { orgId: 'acme' });
  const auth = (await login.json()) as { token: string; csrf: string };
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
  };
  const actions = async (id: string, action: string) =>
    mf.dispatchFetch(url + `/v1/runs/${id}/actions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action }),
    });
  for (const [repo, scenario] of [
    ['acme/payments', 'normal'],
    ['acme/ledger', 'normal'],
    ['acme/payments', 'honest_miss'],
    ['acme/payments', 'out_of_scope'],
  ] as const) {
    const checks = await mockClient.checks(repo, 'main');
    const sha = checks[0]!.sha,
      name = `test-${scenario}-${repo}`;
    const payload = {
      action: 'completed',
      repository: { full_name: repo, default_branch: 'main' },
      check_run: {
        name,
        head_sha: sha,
        head_branch: 'main',
        conclusion: 'failure',
        output: { text: checks[0]!.log },
      },
    };
    const body = JSON.stringify(payload),
      delivery = crypto.randomUUID(),
      signature = await signWebhook('local-only-webhook-secret', body);
    const webhook = () =>
      mf.dispatchFetch(url + '/webhooks/github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'check_run',
          'X-GitHub-Delivery': delivery,
          'X-Hub-Signature-256': signature,
        },
        body,
      });
    expect((await webhook()).status).toBe(202);
    await webhook();
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${repo}:${sha}:${name}`),
    );
    const id =
      'run-' +
      Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
    await waitForRun(id, 'failing');
    if (scenario !== 'normal') {
      const repository = new RunRepository(db as unknown as D1Database),
        current = await repository.get(id);
      await repository.save(
        { ...current.run, scenario },
        current.version,
        `${id}:scenario`,
        'fixture.scenario',
      );
      // The Workflow cached its initial state; its phase reload picks up this explicit first-party fixture scenario.
    }
    expect((await actions(id, 'verify')).status).toBe(409);
    expect((await actions(id, 'diagnose')).status).toBe(202);
    if (scenario === 'out_of_scope') {
      await waitForRun(id, 'out_of_scope');
      expect((await actions(id, 'repair')).status).toBe(409);
      await actions(id, 'handoff');
      await waitForRun(id, 'handed_back');
      continue;
    }
    await waitForRun(id, 'diagnosed');
    await actions(id, 'repair');
    await waitForRun(id, 'repaired');
    await actions(id, 'verify');
    if (scenario === 'honest_miss') {
      const run = await waitForRun(id, 'not_verified');
      expect(run.verified).toBe(false);
      expect(run.prNumber).toBeUndefined();
      await actions(id, 'handoff');
      await waitForRun(id, 'handed_back');
      continue;
    }
    if (repo === 'acme/ledger') {
      const run = await waitForRun(id, 'needs_you');
      expect(run.prNumber).toBeUndefined();
      await actions(id, 'approve');
    }
    const done = await waitForRun(id, 'pr_open');
    expect(done.verified).toBe(true);
    expect(done.prNumber).toBeGreaterThan(0);
    expect(
      (await mf.dispatchFetch(url + `/v1/runs/${id}/diff`, { headers })).status,
    ).toBe(200);
    const events = (await (
      await mf.dispatchFetch(url + `/v1/runs/${id}/events`, { headers })
    ).json()) as unknown[];
    expect(events.length).toBeGreaterThan(5);
  }
  const invalid = await mf.dispatchFetch(url + '/webhooks/github', {
    method: 'POST',
    body: '{}',
    headers: { 'X-Hub-Signature-256': 'sha256=bad' },
  });
  expect(invalid.status).toBe(401);
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  expect(
    (
      await mf.dispatchFetch(url + '/v1/runs/anything/actions', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'diagnose' }),
      })
    ).status,
  ).toBe(401);
}, 90_000);
