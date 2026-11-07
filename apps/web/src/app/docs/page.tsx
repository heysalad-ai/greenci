import Link from 'next/link';
import { Logo } from '@greenci/ui';
import { copy } from '@greenci/core';
import styles from '../software.module.css';
export default function Docs() {
  return (
    <main className={styles.page}>
      <Logo />
      <h1>{copy.docs.title}</h1>
      {copy.docs.sections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{section.title}</h2>
          <p>{section.body}</p>
        </section>
      ))}
      <Link href="/start">{copy.deckless}</Link>
    </main>
  );
}
