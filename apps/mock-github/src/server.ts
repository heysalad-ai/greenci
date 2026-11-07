import Fastify from 'fastify';
import { MockStore } from './store.js';
import { fixtures } from '@greenci/agent/fixtures';
import { patchSchema } from '@greenci/github';
import { rulesSchema } from '@greenci/core';
import swagger from '@fastify/swagger';
import { z } from 'zod';
import {
  validatorCompiler,
  serializerCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
export async function buildServer(
  options: { root?: string; webhookUrl?: string } = {},
) {
  const store = new MockStore(
    options.root ??
      new URL('../../../.data/mock-github/', import.meta.url).pathname,
    options.webhookUrl,
  );
  await store.seed();
  const server = Fastify({
    logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] },
  }).withTypeProvider<ZodTypeProvider>();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(swagger, {
    openapi: { info: { title: 'GreenCI mock-github', version: '0.0.0' } },
    transform: jsonSchemaTransform,
  });
  server.get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            service: z.literal('mock-github'),
            milestone: z.literal('M0'),
          }),
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: 'mock-github' as const,
      milestone: 'M0' as const,
    }),
  );
  server.get('/openapi.json', async () => server.swagger());

  const repoOf = (params: unknown) => {
    const p = z.object({ owner: z.string(), repo: z.string() }).parse(params);
    return `${p.owner}/${p.repo}`;
  };
  const refOf = (query: unknown) =>
    z.object({ ref: z.string().default('main') }).parse(query).ref;
  const route = '/repos/:owner/:repo';
  server.get(`${route}/compare`, async (req) => {
    const query = z
      .object({ base: z.string(), head: z.string() })
      .parse(req.query);
    return store.compare(repoOf(req.params), query.base, query.head);
  });
  server.get('/repos', async () => Object.keys(fixtures));
  server.get(`${route}/checks`, async (req) =>
    store.checks(repoOf(req.params), refOf(req.query)),
  );
  server.get(`${route}/tree`, async (req) =>
    store.tree(repoOf(req.params), refOf(req.query)),
  );
  server.get(`${route}/file`, async (req) => ({
    value: await store.read(
      repoOf(req.params),
      refOf(req.query),
      z.object({ path: z.string() }).parse(req.query).path,
    ),
  }));
  server.post(`${route}/branch`, async (req) => {
    const b = z.object({ sha: z.string(), branch: z.string() }).parse(req.body);
    return { value: await store.branch(repoOf(req.params), b.sha, b.branch) };
  });
  server.post(`${route}/push`, async (req) => {
    const b = z
      .object({ branch: z.string(), files: z.array(patchSchema).min(1) })
      .parse(req.body);
    return { value: await store.push(repoOf(req.params), b.branch, b.files) };
  });
  server.post(`${route}/ci`, async (req) =>
    store.ci(
      repoOf(req.params),
      z.object({ sha: z.string() }).parse(req.body).sha,
    ),
  );
  server.post(`${route}/pulls`, async (req) => {
    const b = z
      .object({ branch: z.string(), approved: z.boolean(), rules: rulesSchema })
      .parse(req.body);
    return store.openPr(repoOf(req.params), b.branch, b.approved, b.rules);
  });
  server.get(`${route}/pulls/:number`, async (req) =>
    store.pr(
      repoOf(req.params),
      z.object({ number: z.coerce.number().int().positive() }).parse(req.params)
        .number,
    ),
  );
  server.post(`${route}/human-merge/:number`, async (req) => {
    // This endpoint exists only in the local first-party fixture service, never in the agent client.
    if (req.headers.origin && req.headers.origin !== 'http://localhost:4001')
      throw new Error('Origin denied');
    return store.humanMerge(
      repoOf(req.params),
      z.object({ number: z.coerce.number().int().positive() }).parse(req.params)
        .number,
    );
  });
  server.get('/', async (_req, reply) =>
    reply.type('text/html').send(
      `<!doctype html><html lang="en"><title>GreenCI mock GitHub</title><h1>Local fixture repositories</h1><ul>${Object.keys(
        fixtures,
      )
        .map((repo) => `<li><a href="/repos/${repo}/checks">${repo}</a></li>`)
        .join(
          '',
        )}</ul><p>Only supplied fixture code runs here. Customer code requires a contained sandbox.</p></html>`,
    ),
  );
  server.setErrorHandler((_error, _req, reply) =>
    reply.status(400).send({ error: 'Invalid fixture operation' }),
  );
  return server;
}
