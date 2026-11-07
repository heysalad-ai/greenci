import { describe, expect, it } from 'vitest';
import {
  states,
  runSchema,
  rulesSchema,
  transition,
  allPassed,
  assertPushBranch,
  safePath,
  inspectFiles,
  needsApproval,
  matchesPath,
  redact,
  notificationPolicy,
  moodFor,
  type Run,
  type DomainEvent,
} from '../packages/core/src/index.js';
const base = (fields: Partial<Run> = {}) =>
  runSchema.parse({
    id: '4182',
    repo: 'acme/payments',
    orgId: 'acme',
    headSha: 'a3f9c21',
    branch: 'main',
    failingCheckName: 'test (ubuntu)',
    ...fields,
  });
const diagnosis = {
  summary: 'Fixture date expired',
  file: 'tests/billing.spec.ts',
  line: 41,
  confidence: 'high',
  category: 'test',
  notAProductBug: false,
  evidence: ['Expected future date'],
} as const;
const check = {
  name: 'test',
  status: 'passed',
  defaultBranchFailed: false,
} as const;
function done(): Run {
  let run = base();
  for (const event of [
    { type: 'diagnose' },
    {
      type: 'diagnosis',
      diagnosis: { ...diagnosis, evidence: [...diagnosis.evidence] },
    },
    { type: 'repair' },
    {
      type: 'fix',
      files: ['src/main.ts'],
      diffLines: 4,
      branch: 'greenci/fix-4182',
    },
    { type: 'verify' },
    { type: 'checks', checks: [check] },
  ] satisfies DomainEvent[])
    run = transition(run, event).run;
  return run;
}
describe('domain state machine', () => {
  it('produces effects without mutating input, and only opens a verified PR', () => {
    const initial = base();
    const start = transition(initial, { type: 'diagnose' });
    expect(initial.state).toBe('failing');
    expect(start.effects).toContainEqual({
      type: 'enqueue',
      phase: 'diagnose',
    });
    const verified = done();
    expect(verified.verified).toBe(true);
    expect(transition(verified, { type: 'open_pr' }).effects).toContainEqual({
      type: 'enqueue',
      phase: 'open_pr',
    });
    const pr = transition(verified, { type: 'pr', number: 418 });
    expect(pr.run.state).toBe('pr_open');
    expect(transition(pr.run, { type: 'merged' }).run.state).toBe('merged');
  });
  it('requires a human for protected or oversized verified diffs', () => {
    const run = base({
      state: 'verifying',
      filesChanged: ['migrations/001.sql'],
      diffLines: 3,
    });
    const waiting = transition(run, { type: 'checks', checks: [check] }).run;
    expect(waiting.state).toBe('needs_you');
    expect(transition(waiting, { type: 'approve' }).run.approved).toBe(true);
    expect(transition(waiting, { type: 'changes' }).run.state).toBe(
      'not_verified',
    );
    expect(transition(waiting, { type: 'take_over' }).run.state).toBe(
      'handed_back',
    );
    expect(
      transition({ ...waiting, resumeState: 'repairing' }, { type: 'approve' })
        .run.state,
    ).toBe('repairing');
    expect(
      transition({ ...waiting, resumeState: undefined }, { type: 'approve' })
        .run.state,
    ).toBe('repaired');
    expect(
      transition(
        { ...run, diffLines: 201, filesChanged: [] },
        { type: 'checks', checks: [check] },
      ).run.state,
    ).toBe('needs_you');
  });
  it('never treats empty, queued, running, failed or unrelated checks as verified', () => {
    for (const checks of [
      [],
      [{ ...check, status: 'queued' as const }],
      [{ ...check, status: 'running' as const }],
      [{ ...check, status: 'failed' as const, defaultBranchFailed: true }],
    ]) {
      expect(
        transition(base({ state: 'verifying' }), { type: 'checks', checks })
          .run,
      ).toMatchObject({ state: 'not_verified', verified: false });
      expect(allPassed(checks)).toBe(false);
    }
    expect(
      transition(
        base({
          state: 'verifying',
          rules: rulesSchema.parse({ autoOpenPr: false }),
        }),
        { type: 'checks', checks: [check] },
      ).effects.some((e) => e.type === 'enqueue'),
    ).toBe(false);
  });
  it('hands config/infra and non-product failures back and limits repairs to three', () => {
    for (const result of [
      { ...diagnosis, category: 'config' as const },
      { ...diagnosis, category: 'infra' as const },
      { ...diagnosis, notAProductBug: true },
    ]) {
      const run = transition(base({ state: 'diagnosing' }), {
        type: 'diagnosis',
        diagnosis: { ...result, evidence: [...result.evidence] },
      }).run;
      expect(run.state).toBe('out_of_scope');
      expect(transition(run, { type: 'handoff' }).run.state).toBe(
        'handed_back',
      );
    }
    expect(
      transition(base({ state: 'not_verified', attempts: 2 }), {
        type: 'repair',
      }).run.attempts,
    ).toBe(3);
    expect(() =>
      transition(base({ state: 'not_verified', attempts: 3 }), {
        type: 'repair',
      }),
    ).toThrow('Illegal');
    expect(
      transition(base({ state: 'not_verified' }), { type: 'handoff' }).run
        .state,
    ).toBe('handed_back');
  });
  it('rejects every illegal state/event edge', () => {
    const events: DomainEvent[] = [
      { type: 'diagnose' },
      {
        type: 'diagnosis',
        diagnosis: { ...diagnosis, evidence: [...diagnosis.evidence] },
      },
      { type: 'repair' },
      { type: 'fix', files: ['src/a.ts'], diffLines: 1, branch: 'greenci/fix' },
      { type: 'verify' },
      { type: 'checks', checks: [check] },
      { type: 'approve' },
      { type: 'changes' },
      { type: 'take_over' },
      { type: 'open_pr' },
      { type: 'pr', number: 1 },
      { type: 'merged' },
      { type: 'handoff' },
      { type: 'stop' },
    ];
    const legal: Record<string, string[]> = {
      diagnose: ['failing'],
      diagnosis: ['diagnosing'],
      repair: ['diagnosed', 'not_verified'],
      fix: ['repairing'],
      verify: ['repaired'],
      checks: ['verifying'],
      approve: ['needs_you'],
      changes: ['needs_you'],
      take_over: ['needs_you'],
      open_pr: ['repaired'],
      pr: ['repaired'],
      merged: ['pr_open'],
      handoff: ['out_of_scope', 'not_verified'],
      stop: states.filter(
        (s) => !['merged', 'handed_back', 'stopped'].includes(s),
      ),
    };
    for (const state of states)
      for (const event of events) {
        const run = base({ state, verified: true, checks: [check] });
        if (legal[event.type]?.includes(state))
          expect(() => transition(run, event)).not.toThrow();
        else expect(() => transition(run, event)).toThrow('Illegal');
      }
    for (const run of [
      base({ state: 'repaired' }),
      base({ state: 'repaired', verified: true }),
      base({
        state: 'repaired',
        verified: true,
        checks: [check],
        filesChanged: ['migrations/a.sql'],
      }),
    ])
      expect(() => transition(run, { type: 'pr', number: 1 })).toThrow();
    expect(() =>
      transition(base({ state: 'repaired' }), { type: 'open_pr' }),
    ).toThrow();
  });
});
it('enforces branches, secret exclusion and workflow approval at the boundary', () => {
  for (const branch of [
    'main',
    'refs/heads/main',
    'greenci/',
    'greenci/../main',
    'greenci/a//b',
    'greenci/a.lock',
    'greenci/a/',
    'greenci/a.',
    'greenci/a@{x}',
  ])
    expect(() => assertPushBranch(branch)).toThrow();
  assertPushBranch('greenci/fix-4182');
  for (const path of [
    '',
    '/etc/passwd',
    'C:/a',
    'a/../b',
    'a//b',
    './a',
    'a\u0000b',
    '%2eenv',
    '.env',
    '.env.local',
    'foo/secrets.json',
    'credentials',
    'key.pem',
    'id_rsa',
    '.git/config',
  ])
    expect(() => safePath(path)).toThrow();
  expect(safePath('src\\main.ts')).toBe('src/main.ts');
  expect(() =>
    inspectFiles(['.github/workflows/ci.yml'], rulesSchema.parse({})),
  ).toThrow('Workflow');
  expect(
    needsApproval(
      ['.github/workflows/ci.yml'],
      2,
      rulesSchema.parse({ allowWorkflows: true }),
    ),
  ).toBe(true);
  expect(needsApproval(['src/a.ts'], 1, rulesSchema.parse({}))).toBe(false);
  expect(needsApproval(['migrations\\001.sql'], 1, rulesSchema.parse({}))).toBe(
    true,
  );
  expect(redact('{"token":"fixture-private-token"}')).not.toContain(
    'fixture-private-token',
  );
  expect(matchesPath('src/a.ts', 'src/*.ts')).toBe(true);
  expect(matchesPath('src/deep/a.ts', 'src/*.ts')).toBe(false);
  expect(
    redact(
      'ghp_abcdef sk-test-key Authorization: Bearer xyz token=abc password=xyz',
    ),
  ).not.toMatch(/abcdef|test-key|xyz|abc/);
});
it('batches success, handles quiet-hour boundaries and watched/page-me branches', () => {
  for (const hour of [0, 6, 7, 21, 22, 23])
    for (const state of [
      'failing',
      'needs_you',
      'pr_open',
      'merged',
      'diagnosing',
    ] as const)
      for (const watched of [true, false])
        for (const page of [true, false]) {
          const result = notificationPolicy({
            state,
            watched,
            branch: 'main',
            pageMeBranches: page ? ['main'] : [],
            hour,
          });
          const urgent =
            state === 'needs_you' || (state === 'failing' && watched);
          expect(result.push).toBe(
            urgent && (page || (hour >= 7 && hour < 22)),
          );
          expect(result.toast).toBe(true);
          expect(result.summary).toBe(['pr_open', 'merged'].includes(state));
        }
  for (const state of states) expect(moodFor(state)).toMatch(/^key-/);
});
