'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { copy, auditDashboardSchema, type AuditDashboard } from '@greenci/core';
import { Banner, Button, StatusChip } from '@greenci/ui';
import { SideNav, TopBar } from '../shell';
import shell from '../app.module.css';
import styles from './audit.module.css';
import StartRepair from './start-repair';
import { sessionResponseSchema } from '@greenci/client';
import { z } from 'zod';
const c = copy.auditDashboard;
type Filter = 'all' | 'original' | 'failing' | 'security';
export default function AuditPage() {
  const [data, setData] = useState<AuditDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auth, setAuth] = useState(false);
  const [filter, setFilter] = useState<Filter>('original');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/client/audit', { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) {
        setAuth(true);
        setData(null);
        setError('');
        return;
      }
      if (!response.ok) throw new Error();
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('audit' in result))
        throw new Error();
      setData(
        result.audit === null ? null : auditDashboardSchema.parse(result.audit),
      );
      setAuth(false);
      setError('');
    } catch {
      setError(c.unavailable);
    } finally {
      setLoading(false);
    }
  }, []);
  async function signIn() {
    setLoading(true);
    try {
      const modeResponse = await fetch('/api/beta-mode', { cache: 'no-store' });
      if (!modeResponse.ok) throw new Error();
      if (
        z.object({ publicSignup: z.boolean() }).parse(await modeResponse.json())
          .publicSignup
      ) {
        window.location.assign('/beta');
        return;
      }
      const response = await fetch('/api/client/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error();
      const session = sessionResponseSchema.parse(await response.json());
      sessionStorage.setItem('greenci-csrf', session.csrf);
      await refresh();
    } catch {
      setError(copy.auditDashboard.unavailable);
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const shown = useMemo(
    () =>
      (data?.repositories ?? [])
        .filter(
          (r) =>
            r.repo.toLowerCase().includes(search.toLowerCase()) &&
            (filter === 'original'
              ? !r.fork && !r.archived
              : filter === 'failing'
                ? ['FAILURE', 'ERROR'].includes(r.ci)
                : filter === 'security'
                  ? (r.alerts ?? 0) > 0
                  : true),
        )
        .sort((a, b) => (b.alerts ?? 0) - (a.alerts ?? 0)),
    [data, search, filter],
  );
  useEffect(() => {
    if (selected) document.getElementById('audit-details')?.focus();
  }, [selected]);
  const detail = data?.repositories.find((r) => r.repo === selected);
  return (
    <div className={shell.root}>
      <TopBar deckOnline={false} compact>
        {data ? <span className={shell.org}>{data.org}</span> : undefined}
      </TopBar>
      <div className={shell.layout}>
        <SideNav
          current="repos"
          prCount={data?.repairs.filter((r) => r.stage === 'draft').length ?? 0}
        />
        <main className={`${shell.main} ${styles.main}`}>
          <div className={styles.heading}>
            <div>
              <h1>{c.title}</h1>
              <p>{c.intro}</p>
            </div>
            <Button
              variant="secondary"
              small
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? copy.working : c.refresh}
            </Button>
          </div>
          {auth && (
            <Banner tone="wait" title={c.signIn}>
              <Button
                variant="secondary"
                small
                disabled={loading}
                onClick={() => void signIn()}
              >
                {c.signIn}
              </Button>
            </Banner>
          )}
          {error && (
            <Banner tone="fail" title={error}>
              {c.refresh}
            </Banner>
          )}
          {!loading && !data && !auth && !error && <p>{c.empty}</p>}
          {!loading && !auth && !error && <StartRepair />}
          {data && (
            <>
              <div className={styles.snapshot}>
                <strong>{c.snapshot}</strong>
                <time dateTime={data.observedAt}>
                  {new Date(data.observedAt).toLocaleString()}
                </time>
                <span>
                  {c.count(data.repositories.length, data.repositories.length)}
                </span>
              </div>
              <nav className={styles.shortcuts} aria-label={c.scope}>
                <a href="#repair-title">{c.repairs}</a>
                <a href="#inventory-title">{c.inventory}</a>
              </nav>
              <p className={styles.health}>
                {c.summaryCounts(
                  data.repositories.filter((r) =>
                    ['FAILURE', 'ERROR'].includes(r.ci),
                  ).length,
                  data.repositories.filter((r) => (r.alerts ?? 0) > 0).length,
                )}
              </p>
              <section
                aria-labelledby="repair-title"
                className={styles.section}
              >
                <h2 id="repair-title">{c.repairs}</h2>
                <p>{c.draftNote}</p>
                {!data.repairs.length && <p>{c.noRepairs}</p>}
                <div className={styles.queue}>
                  {data.repairs.map((r) => (
                    <article key={r.id} className={styles.repair}>
                      <div className={styles.repairHead}>
                        <code>{r.repo}</code>
                        <StatusChip
                          tone={
                            r.stage === 'blocked'
                              ? 'wait'
                              : r.stage === 'draft'
                                ? 'wait'
                                : 'idle'
                          }
                        >
                          {c.stages[r.stage]}
                        </StatusChip>
                      </div>
                      <h3>{r.title}</h3>
                      <small className={styles.observed}>
                        {c.updated}{' '}
                        <time dateTime={r.updatedAt}>
                          {new Date(r.updatedAt).toLocaleString()}
                        </time>
                      </small>
                      {r.pr && (
                        <a
                          className="gc-btn gc-btn--secondary gc-btn--sm"
                          href={r.pr.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {c.review} #{r.pr.number}
                        </a>
                      )}
                      <p>{r.summary}</p>
                      <dl className={styles.proof}>
                        <div>
                          <dt>{c.local}</dt>
                          <dd>
                            <StatusChip
                              tone={
                                r.local === 'passed'
                                  ? 'pass'
                                  : r.local === 'failed'
                                    ? 'fail'
                                    : 'idle'
                              }
                            >
                              {c.checks[r.local]}
                            </StatusChip>
                          </dd>
                        </div>
                        <div>
                          <dt>{c.github}</dt>
                          <dd>
                            <StatusChip
                              tone={
                                r.ci === 'passed'
                                  ? 'pass'
                                  : r.ci === 'failed'
                                    ? 'fail'
                                    : r.ci === 'blocked'
                                      ? 'wait'
                                      : r.ci === 'pending'
                                        ? 'work'
                                        : 'idle'
                              }
                            >
                              {c.checks[r.ci]}
                            </StatusChip>
                          </dd>
                        </div>
                      </dl>
                      <details>
                        <summary>{c.evidence}</summary>
                        <ul>
                          {r.evidence.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                        {r.remaining.length > 0 && (
                          <>
                            <strong>{c.remaining}</strong>
                            <ul>
                              {r.remaining.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </details>
                    </article>
                  ))}
                </div>
              </section>
              <section
                aria-labelledby="inventory-title"
                className={styles.section}
              >
                <h2 id="inventory-title">{c.inventory}</h2>
                <div className={styles.filters}>
                  <label>
                    {c.search}
                    <input
                      value={search}
                      placeholder={c.searchHint}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setLimit(25);
                      }}
                      type="search"
                    />
                  </label>
                  <label>
                    {c.filters}
                    <select
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value as Filter);
                        setLimit(25);
                      }}
                    >
                      {(
                        ['original', 'all', 'failing', 'security'] as const
                      ).map((f) => (
                        <option value={f} key={f}>
                          {c[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span aria-live="polite">
                    {c.count(shown.length, data.repositories.length)}
                  </span>
                </div>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>{c.repository}</th>
                        <th>{c.ci}</th>
                        <th>{c.alerts}</th>
                        <th>{c.commit}</th>
                        <th>{copy.audit.findings}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.slice(0, limit).map((r) => (
                        <tr key={r.repo}>
                          <td>
                            <strong>{r.repo.split('/')[1]}</strong>
                            <small>
                              {r.fork
                                ? c.fork
                                : r.private
                                  ? c.private
                                  : data.org}
                            </small>
                          </td>
                          <td>
                            <StatusChip
                              tone={
                                r.ci === 'SUCCESS'
                                  ? 'pass'
                                  : ['FAILURE', 'ERROR'].includes(r.ci)
                                    ? 'fail'
                                    : 'idle'
                              }
                            >
                              {c.ciLabels[r.ci]}
                            </StatusChip>
                          </td>
                          <td className={styles.number}>
                            {r.alerts ?? c.unknown}
                          </td>
                          <td>
                            <code>{r.sha?.slice(0, 8) ?? '—'}</code>
                          </td>
                          <td>
                            <button
                              className={styles.detailButton}
                              onClick={() => setSelected(r.repo)}
                            >
                              {c.detail}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {shown.length > limit && (
                  <Button
                    variant="secondary"
                    small
                    onClick={() => setLimit(limit + 25)}
                  >
                    {c.showMore}
                  </Button>
                )}
                {!shown.length && <p>{c.noMatch}</p>}
              </section>
              {detail && (
                <section
                  className={styles.detail}
                  id="audit-details"
                  aria-labelledby="details-title"
                  tabIndex={-1}
                >
                  <div className={styles.heading}>
                    <h2 id="details-title">{detail.repo}</h2>
                    <Button
                      variant="secondary"
                      small
                      onClick={() => setSelected(null)}
                    >
                      {c.close}
                    </Button>
                  </div>
                  <ul>
                    {detail.findings.map((f, i) => (
                      <li key={i}>
                        {copy.audit.rules[
                          f.rule as keyof typeof copy.audit.rules
                        ] ?? f.rule}
                        {f.path && (
                          <code>
                            {' '}
                            {f.path}:{f.line ?? 1}
                          </code>
                        )}
                      </li>
                    ))}
                  </ul>
                  {detail.gaps.length > 0 && (
                    <>
                      <h3>{c.gaps}</h3>
                      <ul>
                        {detail.gaps.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              )}
              <aside className={styles.limit}>
                <p>{c.limits}</p>
                <p>{c.stale}</p>
                {data.repositories.some((r) => r.gaps.length) && (
                  <p>
                    {c.coverage(
                      data.repositories.filter((r) => r.gaps.length).length,
                    )}
                  </p>
                )}
              </aside>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
