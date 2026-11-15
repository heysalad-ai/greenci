import { describe, expect, it } from 'vitest';
import {
  auditDashboardSchema,
  auditRepairSchema,
  copy,
} from '../packages/core/src/index.js';
import { safeRepairPath } from '../scripts/publish-repair.mjs';
import { dashboardFixture } from './fixtures/audit.js';
describe('private audit dashboard schema', () => {
  it('labels observed counts and coverage without a security-verification claim', () => {
    expect(copy.auditDashboard.count(5, 10)).toBe('5 of 10 repositories');
    expect(copy.auditDashboard.summaryCounts(0, 3)).toBe(
      '0 default commits failing · 3 repositories with dependency alerts',
    );
    expect(copy.auditDashboard.coverage(2)).toBe(
      '2 repositories have coverage gaps. Open their findings for details.',
    );
    expect(copy.auditDashboard.ciLabels['no-checks']).not.toBe(
      copy.auditDashboard.ciLabels.SUCCESS,
    );
  });
  it('accepts pending draft evidence without promoting CI to passed', () => {
    expect(auditDashboardSchema.parse(dashboardFixture).repairs[0]?.ci).toBe(
      'pending',
    );
  });
  it('rejects cross-tenant repositories and repairs', () => {
    expect(
      auditDashboardSchema.safeParse({ ...dashboardFixture, org: 'other' })
        .success,
    ).toBe(false);
  });
  it('rejects PR links pointing at another repository or website', () => {
    const repair = dashboardFixture.repairs[0]!;
    for (const url of [
      'https://evil.test/',
      'https://github.com/acme/other/pull/7',
    ])
      expect(
        auditRepairSchema.safeParse({ ...repair, pr: { ...repair.pr, url } })
          .success,
      ).toBe(false);
  });
  it('requires a draft PR and commit for draft status', () => {
    expect(
      auditRepairSchema.safeParse({ ...dashboardFixture.repairs[0], pr: null })
        .success,
    ).toBe(false);
  });
  it('rejects duplicate repos and ambiguous repairs', () => {
    expect(
      auditDashboardSchema.safeParse({
        ...dashboardFixture,
        repositories: [
          ...dashboardFixture.repositories,
          ...dashboardFixture.repositories,
        ],
      }).success,
    ).toBe(false);
    expect(
      auditDashboardSchema.safeParse({
        ...dashboardFixture,
        repairs: [...dashboardFixture.repairs, ...dashboardFixture.repairs],
      }).success,
    ).toBe(false);
  });
  it('keeps repair publishing away from secrets, workflows, auth and default refs', () => {
    for (const p of [
      '.env',
      '../package.json',
      '.github/workflows/ci.yml',
      'src/auth.ts',
      'secrets.json',
    ])
      expect(safeRepairPath(p)).toBe(false);
    expect(safeRepairPath('workers/package-lock.json')).toBe(true);
    expect(safeRepairPath('src/math.ts', ['src/math.ts'])).toBe(true);
    expect(safeRepairPath('src/auth.ts', ['src/auth.ts'])).toBe(false);
    expect(safeRepairPath('src/math.ts')).toBe(false);
  });
});
