/// <reference lib="dom.iterable" />
import '../apps/web/cloudflare-env.d.ts';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../apps/web/node_modules/@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({
    env: { APP_ENV: 'dev', API: { fetch: apiFetch } },
  }),
}));
import { GET } from '../apps/web/src/app/api/client/[...path]/route.js';

let mf: Miniflare;
const redirectedPage = createServer((_request, response) => {
  response.writeHead(404).end('404 Not Found');
});
let webOrigin: string;
beforeAll(async () => {
  redirectedPage.listen(0, '127.0.0.1');
  await once(redirectedPage, 'listening');
  webOrigin = `http://127.0.0.1:${(redirectedPage.address() as AddressInfo).port}`;
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: 'web',
          modules: true,
          script: 'export default {fetch(){return new Response("unused")}}',
          serviceBindings: { API: 'api' },
        },
        {
          name: 'api',
          modules: true,
          script: `export default {fetch(request) {
          const url = new URL(request.url);
          if (url.pathname !== '/v1/invite/callback')
            return new Response('404 Not Found', {status:404});
          return new Response(null, {status:302, headers:{
            Location:'${webOrigin}/beta?'+(url.searchParams.has('error')?'error=signin':'connected=1'),
            'Set-Cookie':'greenci_session=fixture-only; HttpOnly; Secure; SameSite=Lax; Path=/'
          }});
        }}`,
        },
      ],
    }),
  );
  const api = (await mf.getBindings('web')).API as { fetch: typeof fetch };
  apiFetch.mockImplementation((url, init) => api.fetch(url, init));
});
afterAll(async () => {
  await mf?.dispose();
  redirectedPage.close();
});

it.each(['connected=1', 'error=signin'])(
  'returns the OAuth %s redirect and session cookie to the browser',
  async (query) => {
    const response = await GET(
      new Request(`https://web/api/client/invite/callback?${query}`),
      { params: Promise.resolve({ path: ['invite', 'callback'] }) },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(`${webOrigin}/beta?${query}`);
    expect(response.headers.get('Set-Cookie')).toContain(
      'greenci_session=fixture-only;',
    );
  },
);
