import { test, expect } from '@playwright/test';
const sha = 'a'.repeat(40);
const audit = {
  version: 1,
  org: 'acme',
  observedAt: '2026-11-15T00:00:00.000Z',
  repositories: [
    {
      repo: 'acme/payments',
      private: true,
      fork: false,
      archived: false,
      sha,
      ci: 'FAILURE',
      alerts: 3,
      findings: [{ rule: 'open-dependency-alerts', level: 'high' }],
      gaps: [],
    },
    {
      repo: 'acme/practice',
      private: false,
      fork: true,
      archived: false,
      sha,
      ci: 'no-checks',
      alerts: 0,
      findings: [],
      gaps: [],
    },
  ],
  repairs: [
    {
      id: 'security',
      repo: 'acme/payments',
      title: 'Patch vulnerable dependencies',
      summary: 'Patched dependency range with synthetic verification.',
      stage: 'draft',
      local: 'passed',
      ci: 'pending',
      baseSha: sha,
      headSha: 'b'.repeat(40),
      branch: 'greenci/security-batch',
      pr: {
        number: 7,
        url: 'https://github.com/acme/payments/pull/7',
        draft: true,
      },
      evidence: ['Four unit tests passed.'],
      remaining: ['GitHub checks pending.'],
      updatedAt: '2026-11-15T00:00:00.000Z',
    },
  ],
};
test('audit dashboard shows real states, searches, filters and navigates to draft review', async ({
  page,
}) => {
  await page.route('**/api/client/audit', (r) =>
    r.fulfill({ json: { audit } }),
  );
  await page.goto('/app/audit');
  await expect(
    page.getByRole('heading', { name: 'Repository health' }),
  ).toBeVisible();
  await expect(page.getByText('Draft PR ready', { exact: true })).toBeVisible();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Review draft PR #7' }),
  ).toHaveAttribute('href', 'https://github.com/acme/payments/pull/7');
  await page.getByLabel('Show repositories').selectOption('all');
  await expect(
    page.getByText('2 of 2 repositories', { exact: true }),
  ).toHaveCount(2);
  await page.getByLabel('Find a repository').fill('payments');
  await expect(
    page.getByText('1 of 2 repositories', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'View findings' }).click();
  await expect(
    page.getByRole('heading', { name: 'acme/payments' }),
  ).toBeVisible();
  await expect(page.locator('#audit-details')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('audit dashboard recovers from errors and keeps signed-out results private', async ({
  page,
}) => {
  let status = 401;
  await page.route('**/api/client/audit', (r) =>
    r.fulfill({
      status,
      json: status === 200 ? { audit } : { error: 'Unavailable' },
    }),
  );
  await page.goto('/app/audit');
  await expect(
    page.getByRole('button', { name: 'Sign in to view private results' }),
  ).toBeVisible();
  await expect(page.getByText('acme/payments', { exact: true })).toHaveCount(0);
  status = 503;
  await page.getByRole('button', { name: 'Refresh results' }).click();
  await expect(
    page.getByText('Results could not be loaded. Refresh to try again.', {
      exact: true,
    }),
  ).toBeVisible();
  status = 200;
  await page.getByRole('button', { name: 'Refresh results' }).click();
  await expect(
    page.getByRole('heading', { name: 'Repair queue' }),
  ).toBeVisible();
});
