import { bridge, WarmPool } from '@cloudflare/sandbox/bridge';
export { Sandbox } from '@cloudflare/sandbox';
export { WarmPool };
const handler = bridge(
  {},
  {
    bindings: { sandbox: 'SANDBOX', warmPool: 'WARM_POOL' },
    healthRoute: '/healthz',
  },
);
const worker: typeof handler = {
  async fetch(request, env, ctx) {
    // The official bridge's optional bearer auth is mandatory for GreenCI.
    if (!env.SANDBOX_API_KEY)
      return Response.json(
        { error: 'SANDBOX_API_KEY is required' },
        { status: 503 },
      );
    return handler.fetch!(request, env, ctx);
  },
};
export default worker;
