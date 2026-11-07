import { copy, runSchema, stateSchema } from '@greenci/core';
import { RunCard } from '@greenci/ui';
import { label, moodOf, steps, toneFor } from '../run-view';
import styles from '../app.module.css';

/** Every run state, rendered with the same helpers as the dashboard. Local reference only. */
export default function StatesPage() {
  const runs = stateSchema.options.map((state) =>
    runSchema.parse({
      id: `run-${state}`,
      repo: 'acme/payments',
      orgId: 'acme',
      headSha: 'a3f9c21e0b',
      branch: 'main',
      failingCheckName: 'test (ubuntu)',
      state,
      diagnosis: ['failing', 'diagnosing', 'out_of_scope'].includes(state)
        ? undefined
        : {
            summary: 'A test fixture expired on 1 November',
            file: 'tests/billing.spec.ts',
            line: 41,
            confidence: 'high',
            category: 'test',
            notAProductBug: true,
            evidence: ['expected "pending", received "overdue"'],
          },
      fixBranch: [
        'repaired',
        'verifying',
        'needs_you',
        'pr_open',
        'merged',
        'not_verified',
      ].includes(state)
        ? 'greenci/fix-4182'
        : undefined,
      verified: ['pr_open', 'merged'].includes(state),
    }),
  );
  return (
    <div className={styles.root}>
      <div className={styles.page}>
        <div>
          <span className={styles.eyebrow}>{copy.name}</span>
          <h1 className={styles.h1}>{copy.states.title}</h1>
          <p className={styles.statNote}>{copy.states.detail}</p>
        </div>
        <div className={styles.runs}>
          {runs.map((run) => (
            <RunCard
              key={run.id}
              title={`${run.state} · ${copy.app.runTitle(run.failingCheckName, run.branch)}`}
              repo={run.repo}
              sha={run.headSha.slice(0, 7)}
              time=""
              mood={moodOf(run)}
              tone={toneFor(run)}
              status={label(run)}
              steps={steps(run)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
