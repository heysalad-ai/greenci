import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import { z } from 'zod';
import {
  validatorCompiler,
  serializerCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
export async function buildServer() {
  const server = Fastify({
    logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] },
  }).withTypeProvider<ZodTypeProvider>();
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  await server.register(swagger, {
    openapi: { info: { title: 'GreenCI api', version: '0.0.0' } },
    transform: jsonSchemaTransform,
  });
  server.get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({
            status: z.literal('ok'),
            service: z.literal('api'),
            milestone: z.literal('M0'),
          }),
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: 'api' as const,
      milestone: 'M0' as const,
    }),
  );
  server.get('/openapi.json', async () => server.swagger());
  return server;
}
