import { getCloudflareContext } from '@opennextjs/cloudflare';
export async function GET() {
  const { env } = getCloudflareContext();
  // A real Worker service-binding request; never a public API URL fallback.
  const response = await env.API.fetch('https://api/healthz');
  if (!response.ok)
    return Response.json({ error: 'API binding unavailable' }, { status: 503 });
  return Response.json({
    status: 'ok',
    service: 'web',
    milestone: 'M0.5',
    api: await response.json(),
  });
}
