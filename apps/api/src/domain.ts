import { publishRun } from '@greenci/worker';
import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import {
  loadConfig,
  copy,
  runSchema,
  rulesSchema,
  actionSchema,
  transition,
  redact,
} from '@greenci/core';
import { RunRepository } from '@greenci/db';
import { verifyWebhook } from '@greenci/github';
import { setCookie } from 'hono/cookie';
import type { ApiEnv } from './env.js';
const sessionSchema = z.object({
  userId: z.string(),
  orgId: z.string(),
  csrf: z.string(),
});
const app = new OpenAPIHono<{ Bindings: ApiEnv }>();
async function session(request: Request, env: ApiEnv) {
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
  return result.data;
}
app.post('/__local/session', async (c) => {
  if (loadConfig(c.env).APP_ENV !== 'local') return c.notFound();
  const body = z
    .object({ orgId: z.enum(['acme', 'greenci']).default('acme') })
    .parse(await c.req.json());
  const member = await c.env.DB.prepare(
    'SELECT id FROM memberships WHERE user_id=? AND org_id=?',
  )
    .bind('sam', body.orgId)
    .first();
  if (!member) return c.json({ error: copy.api.seedRequired }, 409);
  const token = crypto.randomUUID(),
    csrf = crypto.randomUUID();
  await c.env.SESSIONS.put(
    `session:${token}`,
    JSON.stringify({ userId: 'sam', orgId: body.orgId, csrf }),
    { expirationTtl: 3600 },
  );
  setCookie(c, 'greenci_session', token, {
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 3600,
  });
  return c.json({ token, csrf, orgId: body.orgId });
});
app.use('/v1/*', async (c, next) => {
  const user = await session(c.req.raw, c.env);
  if (!user) return c.json({ error: copy.api.signIn }, 401);
  await next();
});
app.get('/v1/runs', async (c) => {
  const user = (await session(c.req.raw, c.env))!;
  return c.json(await new RunRepository(c.env.DB).list(user.orgId));
});
app.get('/v1/runs/:id', async (c) => {
  const user = (await session(c.req.raw, c.env))!;
  try {
    return c.json(
      (await new RunRepository(c.env.DB).get(c.req.param('id'), user.orgId))
        .run,
    );
  } catch {
    return c.notFound();
  }
});
app.get('/v1/runs/:id/events', async (c) => {
  const user = (await session(c.req.raw, c.env))!;
  const repository = new RunRepository(c.env.DB);
  try {
    await repository.get(c.req.param('id'), user.orgId);
  } catch {
    return c.notFound();
  }
  return c.json(await repository.events(c.req.param('id')));
});
app.get('/v1/runs/:id/diff', async (c) => {
  const user = (await session(c.req.raw, c.env))!;
  let run;
  try {
    run = (await new RunRepository(c.env.DB).get(c.req.param('id'), user.orgId))
      .run;
  } catch {
    return c.notFound();
  }
  const artifact = await c.env.ARTIFACTS.get(
    `${run.id}/fix-${run.attempts}.diff`,
  );
  return artifact ? c.text(await artifact.text()) : c.notFound();
});
app.post('/v1/runs/:id/actions', async (c) => {
  const user = (await session(c.req.raw, c.env))!,
    repository = new RunRepository(c.env.DB);
  const body = z.object({ action: actionSchema }).parse(await c.req.json());
  let run;
  try {
    run = (await repository.get(c.req.param('id'), user.orgId)).run;
  } catch {
    return c.notFound();
  }
  try {
    transition(run, { type: body.action });
  } catch {
    return c.json({ error: copy.api.illegalAction }, 409);
  }
  const instance = await c.env.RUN_WORKFLOW.get(run.id),
    id = crypto.randomUUID();
  await instance.sendEvent({
    type: run.state === 'needs_you' ? 'approval' : 'action',
    payload: {
      action: body.action,
      id,
      userId: user.userId,
      expectedState: run.state,
      expectedAttempt: run.attempts,
    },
  });
  if (['approve', 'changes', 'take_over'].includes(body.action))
    await c.env.DB.prepare(
      'UPDATE approvals SET decided_by=?,decision=?,decided_at=?,updated_at=? WHERE run_id=? AND decision IS NULL',
    )
      .bind(
        user.userId,
        body.action,
        new Date().toISOString(),
        new Date().toISOString(),
        run.id,
      )
      .run();
  return c.json({ accepted: true, id }, 202);
});
app.get('/v1/events', async (c) => {
  const user = (await session(c.req.raw, c.env))!;
  return c.env.ORG_ROOMS.get(c.env.ORG_ROOMS.idFromName(user.orgId)).fetch(
    c.req.raw,
  );
});
const webhookSchema = z.object({
  action: z.string().optional(),
  repository: z
    .object({ full_name: z.string(), default_branch: z.string().optional() })
    .optional(),
  check_run: z
    .object({
      name: z.string(),
      head_sha: z.string(),
      head_branch: z.string().optional(),
      conclusion: z.string().nullable(),
      output: z.object({ text: z.string().nullable().optional() }).optional(),
    })
    .optional(),
  pull_request: z
    .object({
      number: z.number(),
      merged: z.boolean().optional(),
      head: z.object({ ref: z.string(), sha: z.string() }),
    })
    .optional(),
});
app.post('/webhooks/github', async (c) => {
  const body = await c.req.text();
  if (body.length > 1_000_000)
    return c.json({ error: copy.api.oversizeWebhook }, 413);
  if (
    !(await verifyWebhook(
      loadConfig(c.env).GITHUB_WEBHOOK_SECRET,
      body,
      c.req.header('X-Hub-Signature-256') ?? '',
    ))
  )
    return c.json({ error: copy.api.badWebhook }, 401);
  const delivery = z
    .string()
    .regex(/^[\w-]{1,100}$/)
    .parse(c.req.header('X-GitHub-Delivery'));
  const event = z
    .enum([
      'check_run',
      'check_suite',
      'workflow_run',
      'pull_request',
      'installation',
      'issue_comment',
      'commit_comment',
    ])
    .parse(c.req.header('X-GitHub-Event'));
  const payload = z.record(z.string(), z.unknown()).parse(JSON.parse(body)),
    at = new Date().toISOString();
  const existing = await c.env.DB.prepare(
    'SELECT processed FROM webhook_deliveries WHERE id=?',
  )
    .bind(delivery)
    .first<{ processed: number }>();
  if (existing?.processed) return c.json({ accepted: true });
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO webhook_deliveries (id,event,payload,processed,created_at,updated_at) VALUES (?,?,?,0,?,?)',
  )
    .bind(delivery, event, redact(JSON.stringify(payload)), at, at)
    .run();
  await c.env.EVENTS.send({
    id: delivery,
    type: `github.${event}`,
    payload,
    at,
  });
  return c.json({ accepted: true }, 202);
});
export async function processWebhook(
  env: ApiEnv,
  event: { id: string; type: string; payload: Record<string, unknown> },
) {
  const parsed = webhookSchema.safeParse(event.payload);
  if (!parsed.success) return;
  const payload = parsed.data,
    repo = payload.repository?.full_name;
  if (!repo) return;
  const repositoryRow = await env.DB.prepare(
    'SELECT org_id,watched,default_branch FROM repos WHERE full_name=?',
  )
    .bind(repo)
    .first<{ org_id: string; watched: number; default_branch: string }>();
  if (!repositoryRow) return;
  if (
    event.type === 'github.check_run' &&
    payload.check_run?.conclusion === 'failure' &&
    payload.action === 'completed' &&
    repositoryRow.watched
  ) {
    const check = payload.check_run;
    // Ignore checks on our own fix branches; verification records those on the parent run.
    if (check.head_branch?.startsWith('greenci/')) return;
    const rawRules = await env.DB.prepare(
      'SELECT * FROM repo_rules WHERE repo_id=?',
    )
      .bind(repo)
      .first<Record<string, unknown>>();
    const rules = rulesSchema.parse(
      rawRules
        ? {
            protectedPaths: JSON.parse(String(rawRules.protected_paths)),
            pageMeBranches: JSON.parse(String(rawRules.page_me_branches)),
            maxDiffLines: rawRules.max_diff_lines,
            autoOpenPr: !!rawRules.auto_open_pr,
            allowWorkflows: !!rawRules.allow_workflows,
            autoMode: !!rawRules.auto_mode,
            autoRepair: !!rawRules.auto_repair,
          }
        : {},
    );
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${repo}:${check.head_sha}:${check.name}`),
    );
    const id =
      'run-' +
      Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);
    const run = runSchema.parse({
      id,
      repo,
      orgId: repositoryRow.org_id,
      headSha: check.head_sha,
      branch: check.head_branch ?? repositoryRow.default_branch,
      failingCheckName: check.name,
      rules,
    });
    await new RunRepository(env.DB).create(run);
    await publishRun(env, run, `${id}:created`);
    const at = new Date().toISOString();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO checks (id,run_id,phase,name,status,log_excerpt,log_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        `${id}:original`,
        id,
        'original',
        check.name,
        'failed',
        redact(check.output?.text ?? '').slice(-2000),
        `${id}/original.log`,
        at,
        at,
      )
      .run();
    await env.ARTIFACTS.put(
      `${id}/original.log`,
      redact(check.output?.text ?? ''),
    );
    try {
      await env.RUN_WORKFLOW.create({ id, params: { runId: id } });
    } catch {
      await env.RUN_WORKFLOW.get(id);
    }
  }
  if (
    event.type === 'github.pull_request' &&
    payload.pull_request?.merged &&
    payload.action === 'closed'
  ) {
    const repository = new RunRepository(env.DB);
    for (const run of await repository.list(repositoryRow.org_id))
      if (
        run.repo === repo &&
        run.prNumber === payload.pull_request.number &&
        run.state === 'pr_open'
      ) {
        const current = await repository.get(run.id),
          next = transition(current.run, { type: 'merged' });
        await repository.save(
          next.run,
          current.version,
          event.id,
          'merged',
          next.effects,
        );
        await publishRun(env, next.run, event.id);
      }
  }
  await env.DB.prepare(
    'UPDATE webhook_deliveries SET processed=1,updated_at=? WHERE id=?',
  )
    .bind(new Date().toISOString(), event.id)
    .run();
}

app.openAPIRegistry.registerComponent('securitySchemes', 'session', {
  type: 'apiKey',
  in: 'cookie',
  name: 'greenci_session',
});
for (const [path, schema] of [
  ['/v1/runs', z.array(runSchema)],
  ['/v1/runs/{id}', runSchema],
  [
    '/v1/runs/{id}/events',
    z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        payload: z.record(z.string(), z.unknown()),
        at: z.string(),
      }),
    ),
  ],
] as const)
  app.openAPIRegistry.registerPath({
    method: 'get',
    path,
    security: [{ session: [] }],
    responses: {
      200: {
        description: 'Success',
        content: { 'application/json': { schema } },
      },
    },
  });
app.openAPIRegistry.registerPath({
  method: 'post',
  path: '/v1/runs/{id}/actions',
  security: [{ session: [] }],
  request: {
    body: {
      content: {
        'application/json': { schema: z.object({ action: actionSchema }) },
      },
    },
  },
  responses: {
    202: { description: 'Action queued' },
    401: { description: 'Sign in required' },
    409: { description: 'Illegal transition' },
  },
});
export default app;
