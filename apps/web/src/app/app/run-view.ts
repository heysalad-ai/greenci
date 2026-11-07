import { copy, moodFor, type Run, type RunState } from '@greenci/core';
import type { Mood, Tone } from '@greenci/ui';

export type PhaseKey = 'diagnose' | 'repair' | 'verify';
export type PhaseStatus = 'done' | 'running' | 'next' | 'waiting' | 'stopped';

const working: readonly RunState[] = ['diagnosing', 'repairing', 'verifying'];
const ended: readonly RunState[] = ['out_of_scope', 'handed_back', 'stopped'];

export function toneFor(run: Run): Tone {
  if (run.state === 'needs_you') return 'wait';
  if (run.state === 'failing' || run.state === 'not_verified') return 'fail';
  if (run.state === 'out_of_scope') return 'fail';
  if (working.includes(run.state)) return 'work';
  if (run.state === 'pr_open' || run.state === 'merged' || run.verified)
    return 'pass';
  // diagnosed, repaired, handed back, stopped: waiting on the next key, not working
  return 'idle';
}

export function moodOf(run: Run): Mood {
  return moodFor(run.state).replace('key-', '') as Mood;
}

export function label(run: Run): string {
  return copy.runStateLabels[run.state];
}

/** Which on-screen key is usable for this run right now. */
export function canPress(run: Run, key: PhaseKey): boolean {
  if (key === 'diagnose') return run.state === 'failing';
  if (key === 'repair')
    return run.state === 'diagnosed' || run.state === 'not_verified';
  return run.state === 'repaired' && !run.verified;
}

export function phaseStatus(run: Run, key: PhaseKey): PhaseStatus {
  const s = run.state;
  if (key === 'diagnose') {
    if (run.diagnosis) return 'done';
    if (s === 'diagnosing') return 'running';
    if (s === 'failing') return 'next';
    return ended.includes(s) ? 'stopped' : 'waiting';
  }
  if (key === 'repair') {
    if (s === 'repairing') return 'running';
    if (run.fixBranch && s !== 'not_verified') return 'done';
    if (s === 'diagnosed' || s === 'not_verified') return 'next';
    if (s === 'needs_you' && !run.verified) return 'waiting';
    return ended.includes(s) ? 'stopped' : 'waiting';
  }
  if (s === 'verifying') return 'running';
  if (run.verified) return 'done';
  if (s === 'repaired') return 'next';
  return ended.includes(s) ? 'stopped' : 'waiting';
}

export function steps(run: Run): ('done' | 'now' | '')[] {
  return (['diagnose', 'repair', 'verify'] as const).map((k) => {
    const p = phaseStatus(run, k);
    return p === 'done' ? 'done' : p === 'running' ? 'now' : '';
  });
}

/** Sort: needs you, failing, in progress, everything else. */
export function priority(run: Run): number {
  if (run.state === 'needs_you') return 0;
  if (run.state === 'failing' || run.state === 'not_verified') return 1;
  if (
    working.includes(run.state) ||
    run.state === 'diagnosed' ||
    run.state === 'repaired'
  )
    return 2;
  return 3;
}

export function isFixed(run: Run) {
  return run.state === 'pr_open' || run.state === 'merged';
}
export function isWorking(run: Run) {
  return (
    working.includes(run.state) ||
    run.state === 'diagnosed' ||
    run.state === 'repaired'
  );
}

export function activityLine(run: Run): string {
  const a = copy.app.activityLine;
  switch (run.state) {
    case 'failing':
      return a.failing(run.failingCheckName, run.repo);
    case 'needs_you':
      return a.needs_you(run.repo);
    case 'pr_open':
      return a.pr_open(run.repo, run.prNumber);
    case 'merged':
      return a.merged(run.repo);
    case 'diagnosing':
    case 'diagnosed':
    case 'repairing':
    case 'repaired':
    case 'verifying':
      return a.progress(label(run), run.repo);
    default:
      return a.other(label(run), run.repo);
  }
}
