import { expect, it, vi } from 'vitest';
import preview from '../apps/web/src/public-preview.js';
const env = () => ({
  ASSETS: {
    fetch: vi.fn(
      async () =>
        new Response('<html>static preview</html>', {
          headers: { 'Content-Type': 'text/html' },
        }),
    ),
  },
});
it('serves static pages with scripts, connections and forms disabled', async () => {
  const bindings = env();
  const response = await preview.fetch(
    new Request('https://preview/'),
    bindings,
  );
  expect(response.status).toBe(200);
  expect(bindings.ASSETS.fetch).toHaveBeenCalledOnce();
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "connect-src 'none'",
  );
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "script-src 'none'",
  );
  expect(response.headers.get('Content-Security-Policy')).toContain(
    "form-action 'none'",
  );
});
it('never proxies API requests or accepts mutations', async () => {
  const bindings = env();
  expect(
    (
      await preview.fetch(
        new Request('https://preview/api/client/session'),
        bindings,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await preview.fetch(
        new Request('https://preview/webhooks/github', { method: 'POST' }),
        bindings,
      )
    ).status,
  ).toBe(405);
  expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
});
it('redirects app and onboarding links to the explicitly read-only gallery', async () => {
  const response = await preview.fetch(
    new Request('https://preview/start'),
    env(),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get('Location')).toBe('/preview');
});
it('reports only public-preview health and omits bodies on HEAD', async () => {
  const bindings = env();
  const health = await preview.fetch(
    new Request('https://preview/healthz'),
    bindings,
  );
  expect(await health.json()).toMatchObject({
    mode: 'read-only',
    integrations: 'disabled',
  });
  expect(
    await (
      await preview.fetch(
        new Request('https://preview/', { method: 'HEAD' }),
        bindings,
      )
    ).text(),
  ).toBe('');
});
