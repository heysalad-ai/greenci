const sha = 'a'.repeat(40);
export const dashboardFixture = {
  version: 1 as const,
  org: 'acme',
  observedAt: '2026-11-15T00:00:00.000Z',
  repositories: [
    {
      repo: 'acme/payments',
      private: true,
      fork: false,
      archived: false,
      sha,
      ci: 'FAILURE' as const,
      alerts: 3,
      findings: [{ rule: 'open-dependency-alerts', level: 'high' as const }],
      gaps: [],
    },
  ],
  repairs: [
    {
      id: 'payments-security',
      repo: 'acme/payments',
      title: 'Patch vulnerable dependencies',
      summary: 'Dependency updates prepared with local verification.',
      stage: 'draft' as const,
      local: 'passed' as const,
      ci: 'pending' as const,
      baseSha: sha,
      headSha: 'b'.repeat(40),
      branch: 'greenci/security-batch',
      pr: {
        number: 7,
        url: 'https://github.com/acme/payments/pull/7',
        draft: true as const,
      },
      evidence: ['Synthetic unit tests passed.'],
      remaining: ['GitHub checks pending.'],
      updatedAt: '2026-11-15T00:00:00.000Z',
    },
  ],
};
