import Link from 'next/link';
import { copy } from '@greenci/core';
export default function Home() {
  return (
    <main>
      <h1>{copy.name}</h1>
      <p>{copy.scaffold}</p>
      <nav>
        <Link href="/api/health">{copy.health}</Link>
        {' · '}
        <Link href="/deck">{copy.deck}</Link>
        {' · '}
        <Link href="/app/_emails">{copy.emails}</Link>
      </nav>
    </main>
  );
}
