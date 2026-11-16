import type { ReactNode } from 'react';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default function StartLayout({ children }: { children: ReactNode }) {
  if (getCloudflareContext().env.PUBLIC_BETA_FRONTEND === 'true')
    redirect('/beta');
  return children;
}
