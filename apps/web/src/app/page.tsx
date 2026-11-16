import { screenCopy } from '@greenci/core';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default function Home() {
  if (getCloudflareContext().env.PUBLIC_BETA_FRONTEND === 'true')
    redirect('/beta');
  // This is generated only from the committed, trusted screen reference; no user content is interpolated.
  return <main dangerouslySetInnerHTML={{ __html: screenCopy.landingHtml }} />;
}
