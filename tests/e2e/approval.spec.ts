import { test, expect } from '@playwright/test';
test('protected SDK tool state stays on the server and the proposed diff is reviewable before approval', async ({
  page,
  request,
}) => {
  const session = await page.request.post('/api/client/session', {
    data: { orgId: 'acme' },
  });
  expect(session.ok()).toBe(true);
  const { csrf } = (await session.json()) as { csrf: string };
  const checks = await request.post(
    'http://localhost:4001/repos/acme/ledger/ci',
    { data: { sha: 'main' } },
  );
  expect(checks.ok()).toBe(true);
  await page.goto('/app');
  await page.evaluate(
    (csrf) => sessionStorage.setItem('greenci-csrf', csrf),
    csrf,
  );
  const card = page
    .locator('a[href^="/app/runs/"]')
    .filter({ hasText: 'acme/ledger' })
    .first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/app\/runs\/run-/);
  await page.getByRole('button', { name: 'Diagnose', exact: true }).click();
  await expect(page.getByText('Diagnosed', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Repair', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Review before continuing' }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.gc-term')).toContainText('amount INTEGER');
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([
    'greenci-csrf',
  ]);
  await page.getByRole('button', { name: 'Approve and continue' }).click();
  await expect(page.getByText('Repaired', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText('Fix PR opened', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
});
