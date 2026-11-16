import { getCloudflareContext } from '@opennextjs/cloudflare';
export const dynamic = 'force-dynamic';
async function proxy(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (path.some((part) => !/^[-\w]+$/.test(part)))
    return new Response(null, { status: 404 });
  const { env } = getCloudflareContext();
  const target =
    path.join('/') === 'session'
      ? env.APP_ENV === 'local'
        ? '__local/session'
        : '__beta/session'
      : `v1/${path.join('/')}`;
  const upstream = await env.API.fetch(
    `https://api/${target}${new URL(request.url).search}`,
    {
      method: request.method,
      // OAuth redirects and cookies must reach the browser, not be followed here.
      redirect: 'manual',
      headers: {
        ...Object.fromEntries(request.headers),
        // Derived at the edge; overwrite any browser-supplied internal header.
        'X-GreenCI-Client-IP':
          request.headers.get('CF-Connecting-IP') ?? 'unknown',
      },
      ...(!['GET', 'HEAD'].includes(request.method)
        ? { body: await request.arrayBuffer() }
        : {}),
    },
  );
  // Workers and Next declare separate DOM types for the same runtime Response ABI.
  return upstream as unknown as Response;
}
export { proxy as GET, proxy as POST };
