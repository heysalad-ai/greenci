import { getCloudflareContext } from '@opennextjs/cloudflare';
export const dynamic = 'force-dynamic';
async function proxy(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (path.some((part) => !/^[-\w]+$/.test(part)))
    return new Response(null, { status: 404 });
  const target =
    path.join('/') === 'session' ? '__local/session' : `v1/${path.join('/')}`;
  const { env } = getCloudflareContext();
  const upstream = await env.API.fetch(
    `https://api/${target}${new URL(request.url).search}`,
    {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      ...(!['GET', 'HEAD'].includes(request.method)
        ? { body: await request.arrayBuffer() }
        : {}),
    },
  );
  // Workers and Next declare separate DOM types for the same runtime Response ABI.
  return upstream as unknown as Response;
}
export { proxy as GET, proxy as POST };
