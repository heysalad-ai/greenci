'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createActionClient } from '@greenci/client';
import { copy, type Action, type Run } from '@greenci/core';
import {
  ActionKey,
  Button,
  Icon,
  Mascot,
  StatusChip,
  Terminal,
  type Tone,
} from '@greenci/ui';
import { TopBar } from '../../shell';
import {
  canPress,
  label,
  moodOf,
  phaseStatus,
  toneFor,
  type PhaseKey,
  type PhaseStatus,
} from '../../run-view';
import styles from '../../app.module.css';

const client = createActionClient({
  baseUrl: '/api/client',
  csrf: () => sessionStorage.getItem('greenci-csrf') ?? '',
});
type Decision = Awaited<ReturnType<typeof client.decisions>>[number];
type Event = Awaited<ReturnType<typeof client.events>>[number];

const phaseTone: Record<PhaseStatus, Tone> = {
  done: 'pass',
  running: 'work',
  next: 'wait',
  waiting: 'idle',
  stopped: 'idle',
};

function Phase({
  run,
  phase,
  children,
}: {
  run: Run;
  phase: PhaseKey;
  children: ReactNode;
}) {
  const status = phaseStatus(run, phase);
  return (
    <section className={styles.phase} data-status={status}>
      <div className={styles.phaseHead}>
        <span className={styles.phaseName}>{copy.app.phase[phase]}</span>
        <StatusChip tone={phaseTone[status]}>
          {copy.app.phase[status]}
        </StatusChip>
      </div>
      {children}
    </section>
  );
}

function DiffView({ diff }: { diff: string }) {
  return (
    <Terminal>
      <span className={styles.diff} style={{ display: 'block' }}>
        {diff.split('\n').map((line, i) => (
          <span
            key={i}
            className={
              line.startsWith('+') && !line.startsWith('+++')
                ? 'ok'
                : line.startsWith('-') && !line.startsWith('---')
                  ? 'bad'
                  : line.startsWith('@@') || line.startsWith('diff ')
                    ? 'dim'
                    : undefined
            }
          >
            {line}
            {'\n'}
          </span>
        ))}
      </span>
    </Terminal>
  );
}

function questionText(q: unknown): string {
  return typeof q === 'object' && q && 'instructions' in q
    ? String((q as { instructions: unknown }).instructions)
    : '';
}
function firstLine(text: string) {
  const line =
    text
      .replace(/TAP version \d+/g, '')
      .split(/\n| # | --- /)
      .map((l) => l.trim())
      .find((l) => l && !/^TAP version/.test(l)) ?? '';
  return line.length > 90 ? `${line.slice(0, 89)}…` : line;
}
function describe(decision: Decision, value: unknown): string {
  const q = (decision.question ?? {}) as {
    type?: string;
    levels?: { label: string }[];
  };
  if (q.type === 'predicate' && typeof value === 'number')
    return `${value >= 0.5 ? copy.app.decisionYes : copy.app.decisionNo} · ${copy.app.decisionProbability(value >= 0.5 ? value : 1 - value)}`;
  if (
    q.type === 'score' &&
    typeof value === 'number' &&
    q.levels &&
    Number.isInteger(value) &&
    q.levels[value]
  )
    return copy.app.scoreOf(q.levels[value].label, q.levels.length);
  if (value === true) return copy.app.decisionYes;
  if (value === false) return copy.app.decisionNo;
  return value === undefined ? '—' : String(value);
}
function DecisionCard({
  decision,
  asked,
}: {
  decision: Decision;
  asked: number;
}) {
  const answer = (decision.answer ?? {}) as {
    value?: unknown;
    confidence?: number | null;
    probabilities?: { value: unknown; probability: number }[] | null;
  };
  const value = describe(decision, answer.value);
  const q = (decision.question ?? {}) as { type?: string };
  const probs = q.type === 'predicate' ? [] : (answer.probabilities ?? []);
  return (
    <article className={styles.decision}>
      <span className={styles.decisionQ}>
        {questionText(decision.question)}
      </span>
      <span className={styles.decisionA}>{value}</span>
      {probs.length > 0 && (
        <div className={styles.probs}>
          {probs.slice(0, 6).map((p) => (
            <div className={styles.prob} key={String(p.value)}>
              <span>
                {p.value === true
                  ? copy.app.decisionYes
                  : p.value === false
                    ? copy.app.decisionNo
                    : String(p.value)}
              </span>
              <span>
                <i style={{ width: `${Math.round(p.probability * 100)}%` }} />
              </span>
              <span>{copy.app.decisionProbability(p.probability)}</span>
            </div>
          ))}
        </div>
      )}
      <span className={styles.statNote}>
        {copy.app.decisionModel(decision.model)}
        {asked > 1 && <> · {copy.app.decisionAsked(asked)}</>}
      </span>
    </article>
  );
}

/** One card per question: the latest answer, with how many times it was asked. */
function latestDecisions(list: Decision[]) {
  const byQuestion = new Map<string, { decision: Decision; asked: number }>();
  for (const decision of list) {
    const key = questionText(decision.question) || decision.id;
    const seen = byQuestion.get(key);
    byQuestion.set(key, { decision, asked: (seen?.asked ?? 0) + 1 });
  }
  return [...byQuestion.values()];
}

function time(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
}

export default function RunPage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState('');
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  const refresh = useCallback(async () => {
    try {
      const value = await client.run(id);
      setRun(value);
      setDecisions(await client.decisions(id));
      setEvents(await client.events(id).catch(() => []));
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

  const act = useCallback(
    async (action: Action) => {
      setBusy(true);
      try {
        await client.action(id, action, run?.revision);
        await refresh();
      } catch {
        setError(copy.runUnavailable);
      } finally {
        setBusy(false);
      }
    },
    [id, run?.revision, refresh],
  );

  // Keys 2–4 mirror the deck simulator: Diagnose, Repair, Verify.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!run || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const key = ({ '2': 'diagnose', '3': 'repair', '4': 'verify' } as const)[
        e.key as '2' | '3' | '4'
      ];
      if (key && canPress(run, key)) void act(key);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, busy, act]);

  const passed = run?.checks.filter((c) => c.status === 'passed').length ?? 0;
  const total = run?.checks.length ?? 0;

  return (
    <div className={styles.root}>
      <TopBar deckOnline={false}>
        <nav aria-label={copy.app.breadcrumb} className={styles.crumbs}>
          <Link href="/app">{copy.app.runsCrumb}</Link>
          <span aria-hidden="true">/</span>
          <span>{run?.repo ?? '…'}</span>
          <span aria-hidden="true">/</span>
          <code>{copy.app.runId(id).slice(0, 16)}</code>
        </nav>
      </TopBar>

      <div className={styles.page}>
        {run && (
          <>
            <div className={styles.hero}>
              <div className={styles.heroText}>
                <Mascot mood={moodOf(run)} size={64} />
                <div style={{ minWidth: 0 }}>
                  <div className={styles.titleRow}>
                    <h1 className={styles.h1}>
                      {copy.app.runTitle(run.failingCheckName, run.branch)}
                    </h1>
                    <StatusChip tone={toneFor(run)}>{label(run)}</StatusChip>
                  </div>
                  <div className={styles.meta}>
                    <span>{run.repo}</span>·
                    <code>{run.headSha.slice(0, 7)}</code>·
                    <span>{copy.app.startedBy[run.startedBy]}</span>
                  </div>
                </div>
              </div>
              <div className={styles.heroDeck}>
                {(['diagnose', 'repair', 'verify'] as const).map((key) => (
                  <ActionKey
                    key={key}
                    name={key}
                    busy={busy && canPress(run, key)}
                    hot={key === 'diagnose' && run.state === 'failing'}
                    disabled={busy || !canPress(run, key)}
                    onClick={() => void act(key)}
                  />
                ))}
              </div>
            </div>

            {run.state === 'needs_you' && (
              <section className={styles.approval}>
                <StatusChip tone="wait">{copy.app.bannerYouTitle}</StatusChip>
                <h2>{copy.approvalTitle}</h2>
                <p>{copy.approvalDetail}</p>
                <div className={styles.approvalActions}>
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
                </div>
              </section>
            )}

            {(
              [
                'not_verified',
                'out_of_scope',
                'handed_back',
                'stopped',
              ] as const
            ).map(
              (s) =>
                run.state === s && (
                  <div
                    key={s}
                    className={`gc-banner ${s === 'stopped' || s === 'handed_back' ? 'gc-banner--wait' : 'gc-banner--fail'}`}
                  >
                    <span>{copy.app.endStates[s]}</span>
                  </div>
                ),
            )}

            <div className={styles.phases}>
              <Phase run={run} phase="diagnose">
                {run.diagnosis ? (
                  <>
                    <h2 className={styles.h2}>{run.diagnosis.summary}</h2>
                    <p>
                      <code className={styles.code}>
                        {run.diagnosis.file}:{run.diagnosis.line}
                      </code>
                    </p>
                    {run.diagnosis.evidence.length > 0 && (
                      <details className={styles.evidence}>
                        <summary>
                          {copy.app.evidenceTitle} ·{' '}
                          {firstLine(run.diagnosis.evidence[0] ?? '')}
                        </summary>
                        <pre>{run.diagnosis.evidence.join('\n\n')}</pre>
                      </details>
                    )}
                    <div className={styles.facts}>
                      <span>
                        {copy.app.confidence(run.diagnosis.confidence)}
                      </span>
                      ·<span>{copy.app.category(run.diagnosis.category)}</span>
                      {run.diagnosis.notAProductBug && (
                        <>
                          ·<span>{copy.app.notProductBug}</span>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p>
                    {run.state === 'diagnosing'
                      ? copy.app.diagnoseRunning
                      : copy.app.diagnosePending}
                  </p>
                )}
              </Phase>

              <Phase run={run} phase="repair">
                {run.state === 'repairing' && <p>{copy.app.repairRunning}</p>}
                {run.fixBranch ? (
                  <>
                    <div className={styles.facts}>
                      <span>{copy.app.fixBranch}</span>
                      <code className={styles.code}>{run.fixBranch}</code>
                    </div>
                    <p>
                      {copy.app.filesChanged(
                        run.filesChanged.length,
                        run.diffLines,
                      )}
                    </p>
                  </>
                ) : (
                  run.state !== 'repairing' && <p>{copy.app.repairPending}</p>
                )}
                {diff && <DiffView diff={diff} />}
              </Phase>

              <Phase run={run} phase="verify">
                {total > 0 ? (
                  <>
                    <h2 className={styles.h2}>
                      {copy.app.checksSummary(passed, total)}
                    </h2>
                    <div className={styles.bar}>
                      <div
                        style={{
                          width: `${Math.round((passed / total) * 100)}%`,
                        }}
                      />
                    </div>
                    <ul className={styles.checks}>
                      {run.checks.map((check) => (
                        <li key={check.name}>
                          <span>
                            <span
                              className={
                                check.status === 'passed'
                                  ? styles.ok
                                  : check.status === 'failed'
                                    ? styles.bad
                                    : styles.run
                              }
                              aria-hidden="true"
                            >
                              {check.status === 'passed'
                                ? '✔'
                                : check.status === 'failed'
                                  ? '✕'
                                  : '◐'}
                            </span>{' '}
                            {check.name}
                            {check.status === 'failed' &&
                              check.defaultBranchFailed && (
                                <span className={styles.muted}>
                                  {' '}
                                  · {copy.app.likelyUnrelated}
                                </span>
                              )}
                          </span>
                          <span className={styles.muted}>
                            {copy.app.checkStatus[check.status]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>
                    {run.state === 'verifying'
                      ? copy.app.verifyRunning
                      : copy.app.verifyPending}
                  </p>
                )}
              </Phase>
            </div>

            <section className={styles.strip}>
              <span className={styles.ok}>
                <Icon name={run.prNumber ? 'check' : 'clock'} />
              </span>
              <div>
                <div className={styles.stripTitle}>
                  {run.prNumber
                    ? copy.app.prReadyTitle
                    : copy.app.prPendingTitle}
                </div>
                <p>{copy.app.prDetail}</p>
              </div>
              {run.prNumber && run.prUrl && (
                <a
                  className="gc-btn gc-btn--primary"
                  href={run.prUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.viewPr} #{run.prNumber}
                </a>
              )}
            </section>

            <div className={styles.lower}>
              <section className={styles.card}>
                <h2 className={styles.h2}>{copy.whyDecision}</h2>
                {decisions.length ? (
                  <div className={styles.decisions}>
                    {latestDecisions(decisions).map(({ decision, asked }) => (
                      <DecisionCard
                        key={decision.id}
                        decision={decision}
                        asked={asked}
                      />
                    ))}
                  </div>
                ) : (
                  <p className={styles.statNote}>{copy.app.decisionsEmpty}</p>
                )}
              </section>
              <section className={styles.card}>
                <h2 className={styles.h2}>{copy.app.timeline}</h2>
                {events.length === 0 && (
                  <p className={styles.statNote}>{copy.app.activityEmpty}</p>
                )}
                <ul className={styles.activity}>
                  {events.map((e) => (
                    <li key={e.id}>
                      <code className={styles.muted} style={{ width: 44 }}>
                        {time(e.at)}
                      </code>
                      <span>{copy.app.eventLabels[e.type] ?? e.type}</span>
                    </li>
                  ))}
                </ul>
                <p className={styles.statNote}>{copy.app.keyboardHint}</p>
              </section>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className={styles.alert}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
