'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { copy, runSchema, type Run } from '@greenci/core';
import { Button, GitHubIcon, StatusChip } from '@greenci/ui';
import { toneFor } from '../run-view';
import styles from './audit.module.css';
const c = copy.dashboardRepair;
const optionsSchema = z.object({
  repos: z
    .array(
      z.object({
        repo: z.string(),
        branch: z.string(),
        sha: z.string(),
        check: z.string(),
        available: z.boolean(),
        reason: z.string(),
      }),
    )
    .max(20),
});
type Option = z.infer<typeof optionsSchema>['repos'][number];
export default function StartRepair() {
  const [options, setOptions] = useState<Option[]>([]),
    [repo, setRepo] = useState(''),
    [runs, setRuns] = useState<Run[]>([]),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [pending, setPending] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const loadRuns = useCallback(async () => {
    const response = await fetch('/api/client/audit/repairs', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(c.unavailable);
    setRuns(
      z.object({ runs: z.array(runSchema) }).parse(await response.json()).runs,
    );
  }, []);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/client/audit/options', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(c.unavailable);
      const rows = optionsSchema.parse(await response.json()).repos;
      setOptions(rows);
      setRepo((previous) =>
        rows.some((r) => r.repo === previous)
          ? previous
          : (rows.find((r) => r.available)?.repo ?? rows[0]?.repo ?? ''),
      );
      await loadRuns();
      setError('');
    } catch {
      setError(c.unavailable);
    } finally {
      setLoaded(true);
    }
  }, [loadRuns]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(
      () => void loadRuns().catch(() => setError(c.unavailable)),
      5000,
    );
    return () => clearInterval(timer);
  }, [refresh, loadRuns]);
  async function submit(selection: Option, key: string) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/client/audit/repairs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': sessionStorage.getItem('greenci-csrf') ?? '',
        },
        body: JSON.stringify({
          repo: selection.repo,
          sha: selection.sha,
          requestId: key,
        }),
      });
      if (!response.ok) {
        const body = z
          .object({ error: z.string() })
          .safeParse(await response.json());
        throw new Error(
          body.success &&
            [...Object.values(c), ...Object.values(copy.inviteBeta)].some(
              (value) => value === body.data.error,
            )
            ? body.data.error
            : c.failed,
        );
      }
      const { run } = z.object({ run: runSchema }).parse(await response.json());
      setRuns((previous) => [run, ...previous.filter((r) => r.id !== run.id)]);
      setRequestId(null);
      setMessage(c.queued);
    } catch (e) {
      setError(e instanceof Error ? e.message : c.failed);
    } finally {
      setPending(false);
    }
  }
  useEffect(() => {
    if (message) document.getElementById('dashboard-live-runs')?.focus();
  }, [message]);
  const selected = options.find((r) => r.repo === repo);
  const busy = runs.some(
    (r) =>
      ![
        'pr_open',
        'merged',
        'handed_back',
        'stopped',
        'out_of_scope',
        'not_verified',
      ].includes(r.state),
  );
  return (
    <section className={styles.launch} aria-labelledby="start-repair-title">
      <div className={styles.heading}>
        <h2 id="start-repair-title">{c.title}</h2>
        <Button
          small
          variant="secondary"
          onClick={() => void refresh()}
          disabled={pending}
        >
          {c.refresh}
        </Button>
      </div>
      <p>{c.description}</p>
      {runs.length > 0 && <a href="#dashboard-live-runs">{c.progress}</a>}
      <form
        className={styles.launchForm}
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected?.available) return;
          const key = requestId ?? crypto.randomUUID();
          setRequestId(key);
          void submit(selected, key);
        }}
      >
        <label>
          {c.repo}
          <select
            value={repo}
            disabled={pending || !loaded}
            onChange={(e) => {
              setRepo(e.target.value);
              setRequestId(null);
              setMessage('');
            }}
          >
            {options.map((r) => (
              <option value={r.repo} key={r.repo}>
                {r.repo}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={pending || !selected?.available || busy}
          type="submit"
        >
          {pending ? c.starting : c.start}
        </Button>
      </form>
      {selected && (
        <p className={styles.selected}>
          <code>
            {selected.available
              ? `${selected.branch} · ${selected.sha.slice(0, 8)} · ${selected.check}`
              : selected.repo}
          </code>
          {!selected.available && <span> {selected.reason}</span>}
        </p>
      )}
      {loaded && !options.length && <p>{c.empty}</p>}
      <p className={styles.limit}>{c.scope}</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {runs.length > 0 && (
        <div
          id="dashboard-live-runs"
          tabIndex={-1}
          className={styles.live}
          aria-label={c.progress}
        >
          {runs.map((run) => (
            <article key={run.id} className={styles.liveRow}>
              <div>
                <strong>{run.repo}</strong>
                <StatusChip tone={toneFor(run)}>
                  {copy.runStateLabels[run.state]}
                </StatusChip>
              </div>
              {run.diagnosis && <p>{run.diagnosis.summary}</p>}
              <Link
                className="gc-btn gc-btn--secondary gc-btn--sm"
                href={`/app/runs/${run.id}`}
              >
                {c.review}
              </Link>
              {run.prUrl && run.state === 'pr_open' && (
                <a
                  className="gc-btn gc-btn--primary gc-btn--sm"
                  href={run.prUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <GitHubIcon />
                  {c.draft}
                </a>
              )}
              {run.state === 'failing' && (
                <Button
                  small
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    void submit(
                      {
                        repo: run.repo,
                        sha: run.headSha,
                        branch: run.branch,
                        check: run.failingCheckName,
                        available: true,
                        reason: '',
                      },
                      run.id.slice(-36),
                    )
                  }
                >
                  {c.retry}
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
