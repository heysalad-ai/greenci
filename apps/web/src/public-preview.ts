import { copy } from '@greenci/core';

interface PreviewEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const headers = {
  'Content-Security-Policy':
    "default-src 'none'; img-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'none'; connect-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default {
  async fetch(request: Request, env: PreviewEnv): Promise<Response> {
    const url = new URL(request.url);
    let response: Response;
    if (!['GET', 'HEAD'].includes(request.method)) {
      response = new Response(copy.publicPreview.readOnly, {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    } else if (url.pathname === '/healthz') {
      response = Response.json({
        status: 'ok',
        service: 'greenci-public-preview',
        mode: 'read-only',
        integrations: 'disabled',
      });
    } else if (
      ['/app', '/start'].includes(url.pathname) ||
      url.pathname.startsWith('/app/')
    ) {
      response = new Response(null, {
        status: 303,
        headers: { Location: '/preview' },
      });
    } else if (
      [
        '/',
        '/preview',
        '/preview/',
        '/docs',
        '/docs/',
        '/styles.css',
        '/robots.txt',
      ].includes(url.pathname) ||
      /^\/(?:brand|fonts|screens)\/[\w/.-]+\.(?:svg|png|woff2|txt)$/.test(
        url.pathname,
      )
    ) {
      response = await env.ASSETS.fetch(request);
    } else {
      response = new Response(copy.publicPreview.missing, { status: 404 });
    }
    const secured = new Response(
      request.method === 'HEAD' ? null : response.body,
      response,
    );
    for (const [key, value] of Object.entries(headers))
      secured.headers.set(key, value);
    return secured;
  },
};
