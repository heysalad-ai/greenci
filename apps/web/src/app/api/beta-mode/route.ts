import { getCloudflareContext } from '@opennextjs/cloudflare';
export const dynamic = 'force-dynamic';
export function GET() {
  const { env } = getCloudflareContext();
  return Response.json(
    { publicSignup: env.PUBLIC_BETA_FRONTEND === 'true' },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
