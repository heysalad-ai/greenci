import { test, expect } from '@playwright/test';
const sha = 'a'.repeat(40);
const option = {
  repo: 'acme/repo',
  branch: 'main',
  sha,
  check: 'test',
  available: true,
  reason: '',
};
const run = {
  id: 'dashboard-acme-11111111-1111-4111-8111-111111111111',
  repo: 'acme/repo',
  orgId: 'acme',
  headSha: sha,
  branch: 'main',
  failingCheckName: 'test',
  state: 'failing',
  rules: {},
  startedBy: 'web',
};
test('dashboard starts one pinned repair and shows a live draft when the server finishes', async ({
  page,
}) => {
  let submitted: unknown,
    done = false;
  await page.route('**/api/client/audit', (r) =>
    r.fulfill({
      json: {
        audit: {
          version: 1,
          org: 'acme',
          observedAt: '2026-11-15T00:00:00.000Z',
          repositories: [],
          repairs: [],
        },
      },
    }),
  );
  await page.route('**/api/client/audit/options', (r) =>
    r.fulfill({ json: { repos: [option] } }),
  );
  await page.route('**/api/client/audit/repairs', async (r) => {
    if (r.request().method() === 'POST') {
      submitted = r.request().postDataJSON();
      done = true;
      await r.fulfill({
        status: 202,
        json: { run: { ...run, state: 'diagnosing' } },
      });
    } else
      await r.fulfill({
        json: {
          runs: done
            ? [
                {
                  ...run,
                  state: 'pr_open',
                  verified: true,
                  prUrl: 'https://github.com/acme/repo/pull/2',
                  prNumber: 2,
                },
              ]
            : [],
        },
      });
  });
  await page.goto('/app/audit');
  await expect(page.getByLabel('Connected repository')).toHaveValue(
    'acme/repo',
  );
  await page.getByRole('button', { name: 'Start repair', exact: true }).click();
  await expect(page.locator('#dashboard-live-runs')).toBeFocused();
  expect(submitted).toMatchObject({
    repo: 'acme/repo',
    sha,
    requestId: expect.any(String),
  });
  await expect(
    page.getByRole('status').filter({ hasText: 'Repair accepted' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Review draft PR', exact: true }),
    // Allow two five-second polling cycles plus response/render time on CI.
  ).toHaveAttribute('href', 'https://github.com/acme/repo/pull/2', {
    timeout: 15000,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('unsupported repos cannot start and failed starts preserve the idempotency key', async ({
  page,
}) => {
  let count = 0;
  const keys: string[] = [];
  await page.route('**/api/client/audit', (r) =>
    r.fulfill({
      json: {
        audit: {
          version: 1,
          org: 'acme',
          observedAt: '2026-11-15T00:00:00.000Z',
          repositories: [],
          repairs: [],
        },
      },
    }),
  );
  await page.route('**/api/client/audit/options', (r) =>
    r.fulfill({
      json: {
        repos: [
          option,
          {
            ...option,
            repo: 'acme/unsupported',
            available: false,
            reason: 'This repository needs a supported repair test profile.',
          },
        ],
      },
    }),
  );
  await page.route('**/api/client/audit/repairs', (r) => {
    if (r.request().method() === 'POST') {
      keys.push(r.request().postDataJSON().requestId);
      count++;
      return r.fulfill({
        status: 409,
        json: {
          error:
            'The repair could not start. Review the run or retry the same request.',
        },
      });
    }
    return r.fulfill({ json: { runs: [] } });
  });
  await page.goto('/app/audit');
  await page
    .getByLabel('Connected repository')
    .selectOption('acme/unsupported');
  await expect(
    page.getByRole('button', { name: 'Start repair', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Connected repository').selectOption('acme/repo');
  await page.getByRole('button', { name: 'Start repair', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Start repair', exact: true }).click();
  await expect.poll(() => count).toBe(2);
  expect(keys[0]).toBe(keys[1]);
});
