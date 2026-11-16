'use client';
import { useState } from 'react';
import { z } from 'zod';
import { copy } from '@greenci/core';
import { Button, Icon } from '@greenci/ui';
import styles from './beta.module.css';
const c = copy.emailAuth;
export default function EmailSignIn({
  onSignedIn,
}: {
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [challenge, setChallenge] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/client/email/${challenge ? 'verify' : 'start'}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            challenge ? { challenge, code } : { email: email.trim() },
          ),
        },
      );
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? c.rate
            : response.status === 503
              ? c.unavailable
              : challenge
                ? c.failed
                : c.invalidEmail,
        );
      if (challenge) {
        onSignedIn();
        return;
      }
      setChallenge(
        z.object({ challenge: z.uuid() }).parse(await response.json())
          .challenge,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : c.unavailable);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.email} aria-labelledby="email-title">
      <h2 id="email-title">{c.title}</h2>
      <p className={styles.note}>{c.detail}</p>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {challenge ? (
          <>
            <p role="status">{c.sent}</p>
            <label htmlFor="email-code">{c.code}</label>
            <input
              id="email-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{8}"
              minLength={8}
              maxLength={8}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </>
        ) : (
          <>
            <label htmlFor="sign-in-email">{c.email}</label>
            <input
              id="sign-in-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        )}
        <Button type="submit" disabled={busy}>
          <Icon name={busy ? 'spinner' : 'mail'} />
          {busy ? c.working : challenge ? c.verify : c.send}
        </Button>
        {challenge && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setChallenge('');
              setCode('');
              setError('');
            }}
          >
            {c.change}
          </Button>
        )}
      </form>
    </section>
  );
}
