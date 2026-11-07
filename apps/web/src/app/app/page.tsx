'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createActionClient } from '@greenci/client';
import { copy, type Run } from '@greenci/core';
import { ActionKey, Banner, Button, Mascot, RunCard } from '@greenci/ui';
import { SideNav, TopBar } from './shell';
import {
  activityLine,
  canPress,
  isFixed,
  isWorking,
  label,
  moodOf,
  priority,
  steps,
  toneFor,
  type PhaseKey,
} from './run-view';
import styles from './app.module.css';

const client = createActionClient({
  baseUrl: '/api/client',
  csrf: () => sessionStorage.getItem('greenci-csrf') ?? '',
});
type Filter = 'all' | 'needsYou' | 'failing';

function Dashboard() {
  const query = useSearchParams();
  const deckless = query.get('deckless') === '1';
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const refresh = useCallback(async () => {
    try {
      setRuns(await client.runs());
      setError('');
    } catch {
      setError(copy.previewNotConnected);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const sorted = useMemo(
    () => [...runs].sort((a, b) => priority(a) - priority(b)),
    [runs],
  );
  const failing = sorted.filter(
    (r) => r.state === 'failing' || r.state === 'not_verified',
  );
  const waiting = sorted.filter((r) => r.state === 'needs_you');
  const shown = sorted.filter((r) =>
    filter === 'needsYou'
      ? r.state === 'needs_you'
      : filter === 'failing'
        ? r.state === 'failing' || r.state === 'not_verified'
        : true,
  );

  const target = (key: PhaseKey) => sorted.find((run) => canPress(run, key));
  async function press(key: PhaseKey) {
    const run = target(key);
    if (!run) return;
    try {
      await client.action(run.id, key, run.revision);
      await refresh();
    } catch {
      setError(copy.runUnavailable);
    }
  }

  const greeting = waiting.length
    ? copy.app.greetingYou
    : failing.length
      ? copy.app.greetingRed(failing.length)
      : sorted.some(isWorking)
        ? copy.app.greetingBusy
        : copy.app.greetingGreen;
  const top = waiting[0] ?? failing[0];
  const hot = sorted.find((r) => r.state === 'failing');

  return (
    <div className={styles.root}>
      <TopBar deckOnline={false} />
      <div className={styles.layout}>
        <SideNav current="runs" prCount={sorted.filter(isFixed).length} />
        <main className={styles.main}>
          <div className={styles.headRow}>
            <div>
              <span className={styles.eyebrow}>{copy.app.eyebrow}</span>
              <h1 className={styles.h1}>{loaded ? greeting : copy.working}</h1>
            </div>
            <Button variant="secondary" small onClick={() => void refresh()}>
              {copy.refresh}
            </Button>
          </div>

          {top && top.state === 'needs_you' && (
            <Banner
              tone="wait"
              title={copy.app.bannerYouTitle}
              action={
                <Link
                  className="gc-btn gc-btn--secondary gc-btn--sm"
                  href={`/app/runs/${top.id}`}
                  tabIndex={-1}
                >
                  {copy.app.review}
                </Link>
              }
            >
              · {copy.app.bannerYou(top.repo)}
            </Banner>
          )}
          {top && top.state !== 'needs_you' && (
            <Banner
              tone="fail"
              title={copy.app.bannerFailingTitle}
              action={
                <Link
                  className="gc-btn gc-btn--primary gc-btn--sm"
                  href={`/app/runs/${top.id}`}
                  tabIndex={-1}
                >
                  {copy.app.open}
                </Link>
              }
            >
              ·{' '}
              {copy.app.bannerFailing(
                top.failingCheckName,
                top.repo,
                top.branch,
              )}
            </Banner>
          )}
          {loaded && !top && !error && (
            <Banner tone="pass" title={copy.app.bannerGreenTitle}>
              {copy.app.bannerGreen}
            </Banner>
          )}

          <div className={styles.stats}>
            {(
              [
                ['fixed', sorted.filter(isFixed).length],
                ['inProgress', sorted.filter(isWorking).length],
                ['needsYou', waiting.length],
                ['failing', failing.length],
              ] as const
            ).map(([key, value]) => (
              <div className={styles.stat} key={key}>
                <span className={styles.statLabel}>{copy.app.stats[key]}</span>
                <div className={styles.statValue}>{value}</div>
                <span className={styles.statNote}>
                  {copy.app.stats[`${key}Note`]}
                </span>
              </div>
            ))}
          </div>

          <section className={styles.runs} aria-labelledby="runs-title">
            <div className={styles.listHead}>
              <h2 id="runs-title" className={styles.h2}>
                {copy.app.runsTitle}
              </h2>
              <div
                className={styles.filters}
                role="group"
                aria-label={copy.app.filterLabel}
              >
                {(['all', 'needsYou', 'failing'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={styles.filter}
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {copy.app.filters[f]}
                  </button>
                ))}
              </div>
            </div>
            {shown.map((run) => (
              <Link
                key={run.id}
                href={`/app/runs/${run.id}`}
                className={styles.runLink}
              >
                <RunCard
                  title={copy.app.runTitle(run.failingCheckName, run.branch)}
                  repo={run.repo}
                  sha={run.headSha.slice(0, 7)}
                  time={copy.app.startedBy[run.startedBy]}
                  mood={moodOf(run)}
                  tone={toneFor(run)}
                  status={label(run)}
                  steps={steps(run)}
                />
              </Link>
            ))}
            {loaded && !shown.length && !error && (
              <div className={styles.empty}>
                <Mascot mood="ready" size={56} />
                <strong>
                  {runs.length ? copy.app.emptyFilter : copy.empty}
                </strong>
              </div>
            )}
            {error && (
              <p role="alert" className={styles.alert}>
                {error}
              </p>
            )}
          </section>
        </main>

        <aside className={styles.aside}>
          <section className={styles.deckPanel} aria-label={copy.app.deckPanel}>
            <div className={styles.deckPanelHead}>
              <span className={styles.eyebrow}>{copy.app.deckPanel}</span>
              <span className={styles.deckState}>
                {deckless ? copy.app.deckNone : copy.deck}
              </span>
            </div>
            <div className={styles.keys}>
              {(['diagnose', 'repair', 'verify'] as const).map((key) => (
                <ActionKey
                  key={key}
                  name={key}
                  hot={key === 'diagnose' && Boolean(hot)}
                  disabled={!target(key)}
                  onClick={() => void press(key)}
                />
              ))}
            </div>
            <p>
              {hot
                ? copy.app.deckHintFailing(hot.repo)
                : deckless
                  ? copy.app.deckHintDeckless
                  : copy.app.deckHintIdle}
            </p>
            <Link href="/#pricing">{copy.getDeck}</Link>
          </section>

          <section className={styles.card}>
            <h3 className={styles.h2}>{copy.app.activity}</h3>
            {sorted.length ? (
              <ul className={styles.activity}>
                {sorted.slice(0, 6).map((run) => (
                  <li key={run.id}>
                    <Mascot mood={moodOf(run)} size={20} />
                    <span>{activityLine(run)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.statNote}>{copy.app.activityEmpty}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
