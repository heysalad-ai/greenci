interface WebhookEnv {
  API: { fetch(request: Request): Promise<Response> };
}
/** Public delivery ingress; only the private API can validate, queue and process signed deliveries. */
export default {
  async fetch(request: Request, env: WebhookEnv): Promise<Response> {
    if (
      request.method !== 'POST' ||
      new URL(request.url).pathname !== '/webhooks/github'
    )
      return new Response(null, { status: 404 });
    if (Number(request.headers.get('Content-Length') ?? 0) > 1_000_000)
      return new Response(null, { status: 413 });
    const body = await request.arrayBuffer();
    if (body.byteLength > 1_000_000) return new Response(null, { status: 413 });
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const name of [
      'X-GitHub-Event',
      'X-GitHub-Delivery',
      'X-Hub-Signature-256',
    ])
      headers.set(name, request.headers.get(name) ?? '');
    const response = await env.API.fetch(
      new Request('https://api/webhooks/github', {
        method: 'POST',
        headers,
        body,
      }),
    );
    return Response.json(
      { accepted: response.ok },
      { status: response.status },
    );
  },
};
