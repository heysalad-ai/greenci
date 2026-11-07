import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { loadConfig, validateBindings, copy, redact } from '@greenci/core';
import { localEmailSchema, eventSchema } from '@greenci/db';
import { sendLocalEmail } from '@greenci/email';
import domainRoutes, { processWebhook } from './domain.js';
import type { ApiEnv } from './env.js';
export { OrgRoom, DeckSession } from './rooms.js';
export { RunWorkflow } from '@greenci/worker';
const app = new OpenAPIHono<{ Bindings: ApiEnv }>();
const json = (schema: z.ZodType, description = 'Success') => ({
  content: { 'application/json': { schema } },
  description,
});
const healthSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
  milestone: z.literal('M0.5'),
  mode: z.literal('scaffold').optional(),
  integrations: z.literal('disabled').optional(),
});
app.use('*', async (c, next) => {
  try {
    validateBindings(c.env);
    const origin = c.req.header('Origin');
    const config = loadConfig(c.env);
    if (
      config.SCAFFOLD_ONLY === 'true' &&
      (c.req.method !== 'GET' || !['/healthz', '/health'].includes(c.req.path))
    )
      return c.notFound();
    if (
      origin &&
      ![
        new URL(config.WEB_URL).origin,
        new URL(config.API_URL).origin,
      ].includes(origin)
    )
      return c.json({ error: 'Origin is not allowed' }, 403);
  } catch (error) {
    return c.json(
      {
        error: error instanceof Error ? error.message : 'Invalid configuration',
      },
      503,
    );
  }
  await next();
});
app.onError(
  (error) =>
    new Response(
      JSON.stringify({
        error: copy.api.requestFailed,
      }),
      {
        status:
          error instanceof z.ZodError || error instanceof SyntaxError
            ? 400
            : 500,
        headers: { 'Content-Type': 'application/json' },
      },
    ),
);
for (const path of ['/healthz', '/health'])
  app.openapi(
    createRoute({
      method: 'get',
      path,
      responses: { 200: json(healthSchema) },
    }),
    async (c) => {
      const config = loadConfig(c.env);
      if (config.SCAFFOLD_ONLY === 'true') {
        const [, , , sandbox] = await Promise.all([
          c.env.DB.prepare('SELECT 1').first(),
          c.env.SESSIONS.get('__greenci_healthcheck'),
          c.env.ARTIFACTS.head('__greenci_healthcheck'),
          c.env.SANDBOX_SERVICE.fetch('https://sandbox/healthz'),
        ]);
        if (!sandbox.ok) throw new Error('Sandbox service unavailable');
        z.object({ executionEnabled: z.literal(false) }).parse(
          await sandbox.json(),
        );
        return c.json(
          healthSchema.parse({
            status: 'ok',
            service: 'api',
            milestone: 'M0.5',
            mode: 'scaffold',
            integrations: 'disabled',
          }),
        );
      }
      return c.json(
        healthSchema.parse({ status: 'ok', service: 'api', milestone: 'M0.5' }),
      );
    },
  );
// All infrastructure probe routes are disabled outside local. Authentication arrives in M4.
app.use('/__local/*', async (c, next) => {
  if (loadConfig(c.env).APP_ENV !== 'local') return c.notFound();
  await next();
});
app.openapi(
  createRoute({
    method: 'get',
    path: '/__local/bindings',
    responses: {
      200: json(
        z.object({
          d1: z.literal(true),
          kv: z.literal(true),
          r2: z.literal(true),
          sandbox: z.unknown(),
        }),
      ),
    },
  }),
  async (c) => {
    await c.env.DB.prepare('SELECT 1').first();
    const id = `probe-${crypto.randomUUID()}`;
    await c.env.SESSIONS.put(id, 'ok', { expirationTtl: 60 });
    const kv = (await c.env.SESSIONS.get(id)) === 'ok';
    await c.env.SESSIONS.delete(id);
    await c.env.ARTIFACTS.put(id, 'ok');
    const r2 = (await (await c.env.ARTIFACTS.get(id))?.text()) === 'ok';
    await c.env.ARTIFACTS.delete(id);
    const sandbox = await c.env.SANDBOX_SERVICE.fetch(
      'https://sandbox/healthz',
    );
    if (!kv || !r2 || !sandbox.ok) throw new Error('Binding probe failed');
    return c.json({
      d1: true as const,
      kv: true as const,
      r2: true as const,
      sandbox: await sandbox.json(),
    });
  },
);
app.openapi(
  createRoute({
    method: 'get',
    path: '/__local/emails',
    responses: { 200: json(z.array(localEmailSchema)) },
  }),
  async (c) => {
    const result = await c.env.DB.prepare(
      'SELECT id,subject,body,created_at FROM local_emails ORDER BY created_at DESC LIMIT 100',
    ).all();
    return c.json(z.array(localEmailSchema).parse(result.results));
  },
);
app.openapi(
  createRoute({
    method: 'post',
    path: '/__local/emails',
    request: {
      body: {
        content: {
          'application/json': {
            schema: localEmailSchema.pick({ subject: true, body: true }),
          },
        },
      },
    },
    responses: { 201: json(localEmailSchema) },
  }),
  async (c) => c.json(await sendLocalEmail(c.env.DB, c.req.valid('json')), 201),
);
const params = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/) });
app.openapi(
  createRoute({
    method: 'post',
    path: '/__local/workflows',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ requiresApproval: z.boolean().default(false) }),
          },
        },
      },
    },
    responses: { 201: json(z.object({ id: z.string() })) },
  }),
  async (c) => {
    const instance = await c.env.RUN_WORKFLOW.create({
      params: c.req.valid('json'),
    });
    return c.json({ id: instance.id }, 201);
  },
);
app.openapi(
  createRoute({
    method: 'get',
    path: '/__local/workflows/{id}',
    request: { params },
    responses: {
      200: json(z.object({ status: z.string(), output: z.unknown() })),
    },
  }),
  async (c) => {
    const instance = await c.env.RUN_WORKFLOW.get(c.req.valid('param').id);
    const status = await instance.status();
    return c.json({
      status: status.status,
      output: status.output ?? status.error ?? null,
    });
  },
);
app.openapi(
  createRoute({
    method: 'post',
    path: '/__local/workflows/{id}/events',
    request: {
      params,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              type: z.enum(['diagnose', 'repair', 'verify', 'approval']),
            }),
          },
        },
      },
    },
    responses: { 202: json(z.object({ accepted: z.literal(true) })) },
  }),
  async (c) => {
    const instance = await c.env.RUN_WORKFLOW.get(c.req.valid('param').id);
    await instance.sendEvent({
      type: c.req.valid('json').type,
      payload: { source: 'local-probe' },
    });
    return c.json({ accepted: true as const }, 202);
  },
);
app.openapi(
  createRoute({
    method: 'post',
    path: '/__local/events',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({ type: z.string().min(1).max(64) }),
          },
        },
      },
    },
    responses: { 202: json(z.object({ id: z.string() })) },
  }),
  async (c) => {
    const id = crypto.randomUUID();
    await c.env.EVENTS.send({
      id,
      type: c.req.valid('json').type,
      payload: { source: 'local-probe' },
      at: new Date().toISOString(),
    });
    return c.json({ id }, 202);
  },
);
app.get('/deck', async (c) => {
  if (loadConfig(c.env).APP_ENV !== 'local') return c.notFound();
  const serial = z
    .string()
    .regex(/^[A-Za-z0-9-]{1,64}$/)
    .safeParse(c.req.query('serial'));
  if (!serial.success) return c.json({ error: 'Invalid serial' }, 400);
  return c.env.DECK_SESSIONS.get(
    c.env.DECK_SESSIONS.idFromName(serial.data),
  ).fetch(c.req.raw);
});
for (const path of ['/live', '/events'])
  app.get(path, async (c) => {
    if (loadConfig(c.env).APP_ENV !== 'local') return c.notFound();
    return c.env.ORG_ROOMS.get(c.env.ORG_ROOMS.idFromName('local')).fetch(
      c.req.raw,
    );
  });
app.route('/', domainRoutes);
app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'GreenCI API', version: '0.0.5' },
});
export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<unknown>, env: ApiEnv) {
    loadConfig(env);
    validateBindings(env);
    for (const message of batch.messages) {
      const parsed = eventSchema.safeParse(message.body);
      if (!parsed.success) {
        message.ack();
        continue;
      }
      const event = parsed.data;
      if (event.type.startsWith('github.')) await processWebhook(env, event);
      await env.DB.prepare(
        'INSERT INTO platform_events (id,type,payload,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
      )
        .bind(
          event.id,
          event.type,
          redact(JSON.stringify(event.payload)),
          event.at,
          event.at,
        )
        .run();
      if (!event.type.startsWith('github.'))
        await env.ORG_ROOMS.get(env.ORG_ROOMS.idFromName('local')).fetch(
          'https://room/publish',
          { method: 'POST', body: JSON.stringify(event) },
        );
      message.ack();
    }
  },
  async scheduled(controller: ScheduledController, env: ApiEnv) {
    loadConfig(env);
    validateBindings(env);
    await env.EVENTS.send({
      id: `${controller.cron}:${controller.scheduledTime}`,
      type:
        controller.cron === '0 8 * * MON'
          ? 'digest.weekly.requested'
          : 'digest.daily.requested',
      payload: { implemented: false },
      at: new Date(controller.scheduledTime).toISOString(),
    });
  },
} satisfies ExportedHandler<ApiEnv>;
