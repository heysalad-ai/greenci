import { test, expect } from '@playwright/test';
import { signWebhook } from '../../packages/github/src/index.js';
test('a deckless user runs a real fixture through comment Diagnose, Repair, Verify and human mock merge', async ({
  page,
  request,
  context,
}) => {
  await page.goto('/start');
  await page
    .getByRole('button', { name: 'No deck yet? Continue without it' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Let GreenCI read your checks.' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Connect GitHub', exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\?deckless=1/);
  const card = page
    .locator('a[href^="/app/runs/"]')
    .filter({ hasText: 'greenci/practice' })
    .first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/app\/runs\/run-/);
  const id = page.url().split('/').pop()!;
  const csrf = await page.evaluate(() =>
    sessionStorage.getItem('greenci-csrf'),
  );
  const runResponse = await page.request.get(`/api/client/runs/${id}`);
  expect(runResponse.ok()).toBe(true);
  const run = (await runResponse.json()) as { headSha: string };
  const postCommand = async (login: string) => {
    const body = JSON.stringify({
      action: 'created',
      repository: { full_name: 'greenci/practice' },
      comment: {
        id: login === 'sam' ? 11 : 12,
        body: '/greenci diagnose',
        commit_id: run.headSha,
        user: { login },
      },
    });
    return request.post('http://localhost:8787/webhooks/github', {
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': 'commit_comment',
        'X-GitHub-Delivery': crypto.randomUUID(),
        'X-Hub-Signature-256': await signWebhook(
          'local-only-webhook-secret',
          body,
        ),
      },
    });
  };
  await postCommand('eve');
  await page.waitForTimeout(300);
  await expect(page.getByText('Failing', { exact: true })).toBeVisible();
  expect((await postCommand('sam')).status()).toBe(202);
  await expect(page.getByText('Diagnosed', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Repair', exact: true }).click();
  await expect(page.getByText('Repaired', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  await expect(page.getByText('Fix PR opened', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole('heading', { name: 'Why GreenCI chose this' }),
  ).toBeVisible();
  const link = page.getByRole('link', { name: /View pull request/ });
  const popupPromise = context.waitForEvent('page');
  await link.click();
  const popup = await popupPromise;
  await popup
    .getByRole('button', { name: 'Merge practice pull request' })
    .click();
  await expect(popup.getByText('Merged', { exact: true })).toBeVisible();
  await expect(page.getByText('Merged', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  expect(csrf).toBeTruthy();
  const response = await page.request.get(`/api/client/runs/${id}`);
  expect(((await response.json()) as { startedBy: string }).startedBy).toBe(
    'comment',
  );
});
