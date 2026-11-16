import { expect, it } from 'vitest';
// This operator-only helper is intentionally plain JS and never bundled in the app.
// @ts-expect-error standalone Worker module has no generated declaration.
import { phaseFor } from '../tools/dev-pad-controller/worker.mjs';
it('only mirrors green after verified checks and a real draft PR exist', () => {
  expect(phaseFor({ state: 'pr_open', pr_number: 3 }, { verified: true })).toBe(
    4,
  );
  for (const verified of [false, undefined, 'true'])
    expect(phaseFor({ state: 'pr_open', pr_number: 3 }, { verified })).toBe(5);
  expect(
    phaseFor({ state: 'pr_open', pr_number: null }, { verified: true }),
  ).toBe(5);
  for (const [state, phase] of Object.entries({
    failing: 1,
    diagnosing: 1,
    diagnosed: 1,
    repairing: 2,
    repaired: 2,
    verifying: 3,
    needs_you: 5,
    stopped: 5,
    not_verified: 5,
    unknown: 5,
  }))
    expect(phaseFor({ state }, {})).toBe(phase);
});
