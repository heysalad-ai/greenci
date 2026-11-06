import { expect, it } from 'vitest';
import { buildServer } from '../apps/mock-github/src/server.js';
it('keeps the local Node mock GitHub health and OpenAPI shell', async () => {
  const server = await buildServer();
  try {
    const health = await server.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({
      status: 'ok',
      service: 'mock-github',
      milestone: 'M0',
    });
    const spec = await server.inject({ method: 'GET', url: '/openapi.json' });
    expect(spec.json().paths['/health'].get.responses['200']).toBeDefined();
  } finally {
    await server.close();
  }
});
