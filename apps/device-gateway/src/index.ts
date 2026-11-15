interface Env {
  DEVICE_SERVICE: Fetcher;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!(
      (path === '/device/poll' && request.method === 'POST') ||
      (/^\/device\/image\/[a-f0-9]{64}$/.test(path) && request.method === 'GET')
    ))
      return new Response(null, { status: 404 });
    if (Number(request.headers.get('Content-Length') ?? 0) > 2048)
      return new Response(null, { status: 413 });
    return env.DEVICE_SERVICE.fetch(request);
  },
};
