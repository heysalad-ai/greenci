'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { sessionResponseSchema } from '@greenci/client';
import { Logo, Button, Mascot } from '@greenci/ui';
import { copy } from '@greenci/core';
import styles from '../software.module.css';
function Start() {
  const query = useSearchParams(),
    router = useRouter();
  const [step, setStep] = useState(query.get('deckless') === '1' ? 2 : 1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
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
      const practice = await fetch('/api/client/practice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrf,
        },
        body: '{}',
      });
      if (!practice.ok) throw new Error();
      router.push('/app?deckless=1');
    } catch {
      setError(copy.previewNotConnected);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <Logo />
      <section className={styles.onboarding}>
        <Mascot mood={step === 1 ? 'ready' : 'failing'} size={64} />
        <h1>{step === 1 ? copy.onboardingTitle : copy.githubTitle}</h1>
        <p>{step === 1 ? copy.onboardingDetail : copy.githubDetail}</p>
        {step === 1 ? (
          <>
            <Button onClick={() => setStep(2)}>{copy.connectGithub}</Button>
            <button className="gc-btn gc-btn--ghost" onClick={() => setStep(2)}>
              {copy.deckless}
            </button>
          </>
        ) : (
          <>
            <p>
              <b>{copy.practiceRepo}</b> · {copy.practiceDetail}
            </p>
            <Button disabled={busy} onClick={() => void connect()}>
              {busy ? copy.working : copy.connectGithub}
            </Button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  );
}
export default function StartPage() {
  return (
    <Suspense>
      <Start />
    </Suspense>
  );
}
