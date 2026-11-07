'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { copy } from '@greenci/core';
import { CommandField, Logo, StatusChip } from '@greenci/ui';
import styles from './app.module.css';

const navIcons = {
  runs: 'M4 12h4l3-7 3 14 3-7h3',
  prs: 'M6 7.5v9M18 16.5V10a3 3 0 0 0-3-3h-4M8 5.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M8 18.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0M20 18.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  repos: 'M4 6h16M4 12h16M4 18h10',
  deck: 'M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3ZM7 15h2M11 15h2M15 15h2',
  rules: 'M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1',
} as const;
type NavKey = keyof typeof navIcons;
const navHref: Record<NavKey, string> = {
  runs: '/app',
  prs: '/app?filter=pr',
  repos: '/start',
  deck: '/deck',
  rules: '/docs#safety',
  settings: '/docs',
};

export function TopBar({
  deckOnline,
  children,
}: {
  deckOnline: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={styles.topbar}>
      <Link href="/app" aria-label={copy.name}>
        <Logo />
      </Link>
      {children ?? <span className={styles.org}>{copy.app.org}</span>}
      <div className={styles.cmd}>
        <CommandField />
      </div>
      <div className={styles.topRight}>
        <StatusChip tone={deckOnline ? 'pass' : 'idle'}>
          {deckOnline ? copy.app.deckOnline : copy.app.deckNone}
        </StatusChip>
        <span className={styles.avatar} aria-hidden="true">
          GC
        </span>
      </div>
    </header>
  );
}

export function SideNav({
  current,
  prCount,
}: {
  current: NavKey;
  prCount: number;
}) {
  return (
    <nav aria-label={copy.app.navLabel} className={styles.nav}>
      {(Object.keys(navIcons) as NavKey[]).map((key) => (
        <Link
          key={key}
          href={navHref[key]}
          className={styles.navItem}
          aria-current={key === current ? 'page' : undefined}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={navIcons[key]} />
          </svg>
          {copy.app.nav[key]}
          {key === 'prs' && prCount > 0 && (
            <span className={styles.navCount}>{prCount}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
