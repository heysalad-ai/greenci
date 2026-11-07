'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createActionClient } from '@greenci/client';
import { copy, type Run, type Action } from '@greenci/core';
import { Logo, Button, ActionKey, StatusChip, Terminal } from '@greenci/ui';
import styles from '../../../software.module.css';
const client = createActionClient({
  baseUrl: '/api/client',
  csrf: () => sessionStorage.getItem('greenci-csrf') ?? '',
});
export default function RunPage() {
  const { id } = useParams<{ id: string }>(),
    [run, setRun] = useState<Run>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [diff, setDiff] = useState(''),
    [decisions, setDecisions] = useState<
      Awaited<ReturnType<typeof client.decisions>>
    >([]);
  const refresh = useCallback(async () => {
    try {
      const value = await client.run(id);
      setRun(value);
      setDecisions(await client.decisions(id));
      if (value.attempts) {
        const response = await fetch(`/api/client/runs/${id}/diff`);
        if (response.ok) setDiff(await response.text());
      }
      setError('');
    } catch {
      setError(copy.runUnavailable);
    }
  }, [id]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function act(action: Action) {
    setBusy(true);
    try {
      await client.action(id, action, run?.revision);
      await refresh();
    } catch {
      setError(copy.runUnavailable);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <Link href="/app">{copy.back}</Link>
      </header>
      {run && (
        <>
          <h1>
            {run.failingCheckName} · {run.repo}
          </h1>
          <StatusChip
            tone={
              run.state === 'needs_you'
                ? 'wait'
                : run.verified
                  ? 'pass'
                  : 'work'
            }
          >
            {copy.runStateLabels[run.state]}
          </StatusChip>
          {run.diagnosis && (
            <p>
              {run.diagnosis.summary} ·{' '}
              <code>
                {run.diagnosis.file}:{run.diagnosis.line}
              </code>
            </p>
          )}
          <div className={styles.deck}>
            <div className="gc-deck">
              {(['diagnose', 'repair', 'verify'] as const).map((action) => (
                <ActionKey
                  key={action}
                  name={action}
                  busy={busy}
                  disabled={
                    busy ||
                    (action === 'diagnose'
                      ? run.state !== 'failing'
                      : action === 'repair'
                        ? !['diagnosed', 'not_verified'].includes(run.state)
                        : run.state !== 'repaired' || run.verified)
                  }
                  onClick={() => void act(action)}
                />
              ))}
            </div>
          </div>
          {run.state === 'needs_you' && (
            <section className={styles.panel}>
              <h2>{copy.approvalTitle}</h2>
              <p>{copy.approvalDetail}</p>
              <Button disabled={busy} onClick={() => void act('approve')}>
                {copy.approve}
              </Button>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() => void act('changes')}
              >
                {copy.changes}
              </Button>
              <Button
                disabled={busy}
                variant="ghost"
                onClick={() => void act('take_over')}
              >
                {copy.takeOver}
              </Button>
            </section>
          )}
          {diff && <Terminal>{diff}</Terminal>}
          {run.prNumber && (
            <p>
              <a href={run.prUrl} target="_blank" rel="noreferrer">
                {copy.viewPr} #{run.prNumber}
              </a>
            </p>
          )}
          <section>
            <h2>{copy.whyDecision}</h2>
            {decisions.map((decision) => (
              <details key={decision.id}>
                <summary>{decision.model}</summary>
                <pre className={styles.json}>
                  {JSON.stringify(
                    { question: decision.question, answer: decision.answer },
                    null,
                    2,
                  )}
                </pre>
              </details>
            ))}
          </section>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
