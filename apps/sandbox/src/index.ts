export default {
  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === '/healthz')
      return Response.json({
        status: 'ok',
        service: 'sandbox',
        mode: 'none',
        executionEnabled: false,
      });
    return Response.json(
      { error: 'Sandbox command execution is not implemented in M0.5' },
      { status: 501 },
    );
  },
} satisfies ExportedHandler;
