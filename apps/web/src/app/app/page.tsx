'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createActionClient } from '@greenci/client';
import { copy, moodFor, type Run } from '@greenci/core';
import { Logo, RunCard, Button, ActionKey } from '@greenci/ui';
import styles from '../software.module.css';
const client = createActionClient({
  baseUrl: '/api/client',
  csrf: () => sessionStorage.getItem('greenci-csrf') ?? '',
});
export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]),
    [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      setRuns(await client.runs());
      setError('');
    } catch {
      setError(copy.previewNotConnected);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function act(action: 'diagnose' | 'repair' | 'verify') {
    const run = runs.find((run) =>
      action === 'diagnose'
        ? run.state === 'failing'
        : action === 'repair'
          ? ['diagnosed', 'not_verified'].includes(run.state)
          : run.state === 'repaired' && !run.verified,
    );
    if (run) {
      await client.action(run.id, action, run.revision);
      await refresh();
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <Link href="/#pricing">{copy.getDeck}</Link>
      </header>
      <h1>{copy.dashboard}</h1>
      <div className={styles.columns}>
        <section className={styles.runs}>
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/app/runs/${run.id}`}
              className={styles.runLink}
            >
              <RunCard
                title={`${run.failingCheckName} · ${run.branch}`}
                repo={run.repo}
                sha={run.headSha.slice(0, 7)}
                time=""
                mood={
                  moodFor(run.state).replace('key-', '') as Parameters<
                    typeof RunCard
                  >[0]['mood']
                }
                tone={
                  run.state === 'needs_you'
                    ? 'wait'
                    : run.verified
                      ? 'pass'
                      : 'fail'
                }
                status={copy.runStateLabels[run.state]}
                steps={[
                  run.diagnosis ? 'done' : '',
                  run.fixBranch ? 'done' : '',
                  run.verified ? 'done' : '',
                ]}
              />
            </Link>
          ))}
          {!runs.length && !error && <p>{copy.empty}</p>}
          {error && <p role="alert">{error}</p>}
          <Button variant="secondary" onClick={() => void refresh()}>
            {copy.refresh}
          </Button>
        </section>
        <aside>
          <div className="gc-deck">
            {(['diagnose', 'repair', 'verify'] as const).map((action) => (
              <ActionKey
                key={action}
                name={action}
                disabled={
                  !runs.some((run) =>
                    action === 'diagnose'
                      ? run.state === 'failing'
                      : action === 'repair'
                        ? ['diagnosed', 'not_verified'].includes(run.state)
                        : run.state === 'repaired' && !run.verified,
                  )
                }
                onClick={() =>
                  void act(action).catch(() => setError(copy.runUnavailable))
                }
              />
            ))}
          </div>
          <p>
            <Link href="/#pricing">{copy.getDeck}</Link>
          </p>
        </aside>
      </div>
    </main>
  );
}
