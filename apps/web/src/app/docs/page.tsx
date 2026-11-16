import Link from 'next/link';
import { GitHubIcon, Logo } from '@greenci/ui';
import { copy } from '@greenci/core';
import styles from '../software.module.css';
export default function Docs() {
  return (
    <main className={styles.page}>
      <Logo />
      <h1>{copy.docs.title}</h1>
      <div className={styles.reading}>
        {copy.docs.sections.map((section) => (
          <section key={section.id} id={section.id}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </div>
      <p>
        <a className="gc-inline-link" href={copy.publicBeta.manageAccessUrl}>
          <GitHubIcon />
          {copy.publicBeta.manageAccess}
        </a>
      </p>
      <p>
        <a className="gc-inline-link" href={copy.publicBeta.supportUrl}>
          <GitHubIcon />
          {copy.publicBeta.support}
        </a>
      </p>
      <Link href="/start">{copy.deckless}</Link>
    </main>
  );
}
