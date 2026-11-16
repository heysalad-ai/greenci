'use client';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import Link from 'next/link';
import { copy } from '@greenci/core';
import { Button, GitHubIcon, Icon, Logo } from '@greenci/ui';
import styles from './beta.module.css';
import EmailSignIn from './email-sign-in';
const base = copy.inviteBeta;
const meSchema = z.object({
  csrf: z.string(),
  orgId: z.string(),
  login: z.string(),
  admin: z.boolean(),
  email: z.string().nullable().optional(),
  githubConnected: z.boolean().default(true),
  githubAuthorized: z.boolean().default(true),
  installUrl: z.url().nullable(),
});
const reposSchema = z.object({
  repos: z.array(
    z.object({
      full_name: z.string(),
      default_branch: z.string(),
      installationId: z.number(),
    }),
  ),
});
const invitesSchema = z.object({
  invites: z.array(
    z.object({
      id: z.string(),
      email: z.string(),
      login: z.string(),
      expires_at: z.string(),
      revoked: z.number(),
    }),
  ),
});
export default function BetaPage() {
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [mode, setMode] = useState<
    'loading' | 'invite' | 'public' | 'unavailable'
  >('loading');
  const c = mode === 'invite' ? base : { ...base, ...copy.publicBeta };
  const [me, setMe] = useState<z.infer<typeof meSchema> | null>(null),
    [repos, setRepos] = useState<z.infer<typeof reposSchema>['repos']>([]),
    [invites, setInvites] = useState<z.infer<typeof invitesSchema>['invites']>(
      [],
    );
  const [code, setCode] = useState(''),
    [email, setEmail] = useState(''),
    [login, setLogin] = useState(''),
    [repo, setRepo] = useState(''),
    [shared, setShared] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [configuration, response] = await Promise.all([
        fetch('/api/beta-mode', { cache: 'no-store' }),
        fetch('/api/client/invite/me', { cache: 'no-store' }),
      ]);
      if (!configuration.ok) throw new Error();
      const { publicSignup, emailSignup } = z
        .object({
          publicSignup: z.boolean(),
          emailSignup: z.boolean().default(false),
        })
        .parse(await configuration.json());
      setMode(publicSignup ? 'public' : 'invite');
      setEmailEnabled(emailSignup && publicSignup);
      const feedback = publicSignup ? copy.publicBeta : base;
      if (new URLSearchParams(window.location.search).has('error'))
        setError(feedback.failed);
      if (response.ok) {
        const data = meSchema.parse(await response.json());
        setMe(data);
        sessionStorage.setItem('greenci-csrf', data.csrf);
      } else if (response.status !== 401) setError(feedback.unavailable);
    } catch {
      setMode('unavailable');
      setError(copy.publicBeta.unavailable);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function post(
    path: string,
    body: unknown,
    scope: 'invite' | 'email' = 'invite',
  ) {
    const response = await fetch(`/api/client/${scope}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': me?.csrf ?? '',
      },
      body: JSON.stringify(body),
    });
    if (response.status === 429) throw new Error(copy.publicBeta.busy);
    if (!response.ok)
      throw new Error(response.status === 503 ? c.unavailable : c.failed);
    return response.json() as Promise<unknown>;
  }
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : c.failed);
    } finally {
      setBusy(false);
    }
  }
  async function refreshRepos() {
    const response = await fetch('/api/client/invite/repositories', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(c.failed);
    const rows = reposSchema.parse(await response.json()).repos;
    setRepos(rows);
    setRepo(rows[0]?.full_name ?? '');
  }
  async function refreshInvites() {
    const response = await fetch('/api/client/invite/admin/invites', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(c.failed);
    setInvites(invitesSchema.parse(await response.json()).invites);
  }
  useEffect(() => {
    if (me?.admin) void action(refreshInvites);
  }, [me?.admin]);
  return (
    <main className={styles.page}>
      <header>
        <Link href="/" aria-label="GreenCI">
          <Logo />
        </Link>
        <Link className="gc-btn gc-btn--secondary" href="/app/audit">
          <Icon name="repair" />
          {c.dashboard}
        </Link>
      </header>
      <section className={styles.panel} aria-labelledby="beta-title">
        <h1 id="beta-title">{c.title}</h1>
        <p>{c.intro}</p>
        <p className={styles.note}>{c.profile}</p>
        <p className={styles.note}>{c.limits}</p>
        {mode === 'public' && (
          <Link href="/docs#public-beta">{copy.publicBeta.dataLink}</Link>
        )}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {loading ? (
          <p role="status">{c.loading}</p>
        ) : mode === 'unavailable' ? (
          <Button onClick={() => void load()}>{copy.publicBeta.retry}</Button>
        ) : !me ? (
          <>
            {emailEnabled && <EmailSignIn onSignedIn={() => void load()} />}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const result = z
                    .object({ url: z.url() })
                    .parse(
                      await post(
                        mode === 'public' ? 'public/start' : 'start',
                        mode === 'public' ? {} : { code: code.trim() },
                      ),
                    );
                  window.location.assign(result.url);
                });
              }}
            >
              {mode !== 'public' && (
                <>
                  <label htmlFor="invite-code">{c.code}</label>
                  <input
                    id="invite-code"
                    required
                    autoComplete="off"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </>
              )}
              <Button
                type="submit"
                disabled={
                  busy || (mode !== 'public' && code.trim().length < 32)
                }
              >
                {busy ? <Icon name="spinner" /> : <GitHubIcon />}
                {busy ? c.loading : c.signIn}
              </Button>
            </form>
            {mode === 'public' && (
              <p className={styles.note}>
                {copy.publicBeta.templateDetail}{' '}
                <a
                  className="gc-inline-link"
                  href={copy.publicBeta.templateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GitHubIcon />
                  {copy.publicBeta.template}
                </a>
              </p>
            )}
          </>
        ) : (
          <>
            <p>
              {me.email ? copy.emailAuth.signedIn : c.signedIn}:{' '}
              <strong>{me.email || me.login}</strong>
            </p>
            {!me.admin && !me.githubAuthorized && (
              <section
                className={styles.connection}
                aria-labelledby="github-link-title"
              >
                <h2 id="github-link-title">{copy.emailAuth.link}</h2>
                <p>{copy.emailAuth.linkDetail}</p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const result = z
                        .object({ url: z.url() })
                        .parse(
                          await post(
                            me.githubConnected ? 'public/start' : 'github',
                            {},
                            me.githubConnected ? 'invite' : 'email',
                          ),
                        );
                      window.location.assign(result.url);
                    })
                  }
                >
                  <GitHubIcon />
                  {copy.emailAuth.link}
                </Button>
              </section>
            )}
            {!me.admin && me.githubAuthorized && (
              <section
                className={styles.connection}
                aria-labelledby="connect-title"
              >
                <h2 id="connect-title">{c.connectTitle}</h2>
                {me.installUrl && (
                  <a
                    className="gc-btn gc-btn--secondary"
                    href={me.installUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <GitHubIcon />
                    {c.install}
                  </a>
                )}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void action(refreshRepos)}
                >
                  <GitHubIcon />
                  {c.refresh}
                </Button>
                {!repos.length ? (
                  <p>{c.empty}</p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(async () => {
                        const row = repos.find((x) => x.full_name === repo);
                        if (!row) throw new Error(c.failed);
                        await post('connect', {
                          repo,
                          installationId: row.installationId,
                        });
                        setMessage(c.connected);
                      });
                    }}
                  >
                    <label htmlFor="repo">{c.repo}</label>
                    <select
                      id="repo"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                    >
                      {repos.map((r) => (
                        <option key={r.full_name} value={r.full_name}>
                          {r.full_name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" disabled={busy}>
                      <GitHubIcon />
                      {c.connect}
                    </Button>
                  </form>
                )}
              </section>
            )}
            {me.admin && (
              <section
                className={styles.connection}
                aria-labelledby="invite-admin"
              >
                <h2 id="invite-admin">{c.admin}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      const result = z
                        .object({ code: z.string() })
                        .parse(await post('admin/invites', { email, login }));
                      setShared(result.code);
                      await refreshInvites();
                    });
                  }}
                >
                  <label htmlFor="email">{c.email}</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <label htmlFor="login">{c.login}</label>
                  <input
                    id="login"
                    required
                    pattern="[a-zA-Z0-9-]{1,39}"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                  />
                  <Button type="submit" disabled={busy}>
                    {c.create}
                  </Button>
                </form>
                {shared && (
                  <div role="status">
                    <p>{c.invitation}</p>
                    <code className={styles.code}>{shared}</code>
                  </div>
                )}
                <h3>{c.invites}</h3>
                {invites.map((i) => (
                  <div className={styles.invite} key={i.id}>
                    <span>
                      {i.login} · {i.email}
                      <br />
                      <time dateTime={i.expires_at}>
                        {new Date(i.expires_at).toLocaleString()}
                      </time>
                    </span>
                    {i.revoked ? (
                      <span>{c.revoked}</span>
                    ) : (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await post('admin/revoke', { id: i.id });
                            await refreshInvites();
                          })
                        }
                      >
                        {c.revoke}
                      </Button>
                    )}
                  </div>
                ))}
              </section>
            )}
            <div className={styles.actions}>
              <Link className="gc-btn gc-btn--secondary" href="/app/audit">
                <Icon name="repair" />
                {c.dashboard}
              </Link>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await post('logout', {});
                    setMe(null);
                    sessionStorage.removeItem('greenci-csrf');
                  })
                }
              >
                {c.logout}
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
