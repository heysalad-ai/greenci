import { getCloudflareContext } from '@opennextjs/cloudflare';
import { notFound } from 'next/navigation';
import Deck from './simulator';
export const dynamic = 'force-dynamic';
export default function DeckPage() {
  if (getCloudflareContext().env.APP_ENV !== 'local') notFound();
  return <Deck />;
}
