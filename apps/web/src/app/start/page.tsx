'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { sessionResponseSchema } from '@greenci/client';
import { copy } from '@greenci/core';
import { Button, Logo, Mascot } from '@greenci/ui';
import styles from '../app/app.module.css';

type Step = 1 | 2 | 3 | 4;

function Start() {
  const query = useSearchParams();
  const router = useRouter();
  const [deckless, setDeckless] = useState(query.get('deckless') === '1');
  const [step, setStep] = useState<Step>(deckless ? 2 : 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const o = copy.onboarding;

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/client/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: 'greenci' }),
      });
      if (!response.ok) throw new Error();
      const session = sessionResponseSchema.parse(await response.json());
      // CSRF is not a session credential; the authenticated session stays in an HttpOnly cookie.
      sessionStorage.setItem('greenci-csrf', session.csrf);
      setStep(3);
    } catch {
      setError(copy.previewNotConnected);
    } finally {
      setBusy(false);
    }
  }

  async function watch() {
    setBusy(true);
    setError('');
    try {
      const practice = await fetch('/api/client/practice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': sessionStorage.getItem('greenci-csrf') ?? '',
        },
        body: '{}',
      });
      if (!practice.ok) throw new Error();
      setStep(4);
    } catch {
      setError(copy.previewNotConnected);
    } finally {
      setBusy(false);
    }
  }

  const pillState = (n: number) =>
    n < step ? 'done' : n === step ? 'now' : 'todo';

  return (
    <div className={styles.root}>
      <div className={styles.onboard}>
        <header className={styles.onboardHead}>
          <Link href="/" aria-label={copy.name}>
            <Logo />
          </Link>
          <ol className={styles.pills} aria-label={o.progress}>
            {o.steps.map((name, i) => (
              <li
                key={name}
                className={styles.pill}
                data-state={pillState(i + 1)}
                aria-current={i + 1 === step ? 'step' : undefined}
              >
                {i + 1 < step ? '✔ ' : `${i + 1} `}
                {name}
              </li>
            ))}
          </ol>
        </header>

        <div className={styles.stepGrid}>
          <section className={styles.stepCard}>
            <span className={styles.stepNo}>{o.stepLabel(step)}</span>

            {step === 1 && (
              <>
                <h1>{copy.onboardingTitle}</h1>
                <p>{copy.onboardingDetail}</p>
                <div className={styles.stepActions}>
                  <Button onClick={() => setStep(2)}>{o.deckReady}</Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDeckless(true);
                      setStep(2);
                    }}
                  >
                    {copy.deckless}
                  </Button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1>{copy.githubTitle}</h1>
                <p>{copy.githubDetail}</p>
                <div className={styles.perms}>
                  <b>{o.githubCan}</b>
                  {o.can.map((line) => (
                    <span key={line}>
                      <span className={styles.ok} aria-hidden="true">
                        ✔{' '}
                      </span>
                      {line}
                    </span>
                  ))}
                  <b>{o.githubNever}</b>
                  {o.never.map((line) => (
                    <span key={line}>
                      <span className={styles.bad} aria-hidden="true">
                        ✕{' '}
                      </span>
                      {line}
                    </span>
                  ))}
                </div>
                <div className={styles.stepActions}>
                  <Button disabled={busy} onClick={() => void connect()}>
                    {busy ? copy.working : copy.connectGithub}
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1>{o.reposTitle}</h1>
                <p>{o.reposDetail}</p>
                <div className={styles.repoList}>
                  <label className={styles.repoRow} data-on="true">
                    <input type="checkbox" checked readOnly />
                    <span style={{ flex: 1 }}>
                      <b>{copy.practiceRepo}</b>
                      <small>{copy.practiceDetail}</small>
                    </span>
                  </label>
                </div>
                <p>{o.reposMore}</p>
                <div className={styles.stepActions}>
                  <Button disabled={busy} onClick={() => void watch()}>
                    {busy ? copy.working : o.watch(1)}
                  </Button>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h1>{copy.practiceTitle}</h1>
                <p>{o.practiceDetail}</p>
                <div className={styles.failCard}>
                  <Mascot mood="failing" size={44} />
                  <span>
                    <b>{copy.failing}</b> · {copy.practiceRepo}
                  </span>
                </div>
                <div className={styles.stepActions}>
                  <Button
                    onClick={() =>
                      router.push(deckless ? '/app?deckless=1' : '/app')
                    }
                  >
                    {o.openRun}
                  </Button>
                </div>
                <p>
                  {o.cliHint}{' '}
                  <code className={styles.code}>{o.cliCommand}</code>
                </p>
              </>
            )}
            {error && (
              <p role="alert" className={styles.alert}>
                {error}
              </p>
            )}
          </section>

          <aside className={styles.visual} aria-hidden="true">
            <div className={styles.miniDeck}>
              <span />
              <span
                style={
                  step === 4
                    ? {
                        boxShadow:
                          '0 0 0 4px var(--fail), inset 0 -6px 0 rgba(0,0,0,.3)',
                      }
                    : undefined
                }
              />
              <span />
              <span />
            </div>
            <Mascot
              mood={step === 4 ? 'failing' : step === 1 ? 'ready' : 'passing'}
              size={56}
            />
            <p>
              {deckless && step > 1 ? copy.app.deckHintDeckless : o.eyebrow}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Start />
    </Suspense>
  );
}
