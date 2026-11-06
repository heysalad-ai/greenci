import { describe, expect, it } from 'vitest';
import { buildServer as api } from '../apps/api/src/server.js';
import { buildServer as mock } from '../apps/mock-github/src/server.js';
describe.each([
  ['api', api],
  ['mock-github', mock],
] as const)('%s scaffold', (name, build) => {
  it('responds with a validated liveness response', async () => {
    const server = await build();
    try {
      const response = await server.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ok',
        service: name,
        milestone: 'M0',
      });
    } finally {
      await server.close();
    }
  });
  it('generates OpenAPI from Zod and rejects unknown routes', async () => {
    const server = await build();
    try {
      const spec = await server.inject({ method: 'GET', url: '/openapi.json' });
      expect(spec.statusCode).toBe(200);
      expect(spec.json().paths['/health'].get.responses['200']).toBeDefined();
      expect(
        (await server.inject({ method: 'POST', url: '/runs/1/merge' }))
          .statusCode,
      ).toBe(404);
    } finally {
      await server.close();
    }
  });
});
