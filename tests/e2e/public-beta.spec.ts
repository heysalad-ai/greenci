import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { copy } from '../../packages/core/src/copy.js';
test('public signup needs no invitation code and names its scope before GitHub consent', async ({
  page,
}) => {
  await page.route('**/api/beta-mode', (r) =>
    r.fulfill({ json: { publicSignup: true } }),
  );
  await page.route('**/api/client/invite/me', (r) =>
    r.fulfill({ status: 401, json: { error: 'sign in' } }),
  );
  let submitted: unknown;
  await page.route('**/api/client/invite/public/start', (r) => {
    submitted = r.request().postDataJSON();
    return r.fulfill({ status: 429, json: { error: 'capacity' } });
  });
  await mkdir('.data/public-beta/review', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/beta');
  await expect(
    page.getByRole('heading', { name: 'Try GreenCI', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Invitation code')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Continue with GitHub' }),
  ).toBeEnabled();
  await expect(page.getByText(copy.publicBeta.profile)).toBeVisible();
  await expect(page.getByText(copy.publicBeta.limits)).toBeVisible();
  await page.screenshot({
    path: '.data/public-beta/review/desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.data/public-beta/review/mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 415, height: 844 });
  await page.getByRole('button', { name: 'Continue with GitHub' }).focus();
  await page.screenshot({
    path: '.data/public-beta/review/user-415.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  expect(submitted).toEqual({});
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    copy.publicBeta.busy,
  );
  await page.screenshot({
    path: '.data/public-beta/review/capacity-mobile.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Beta limits and data use' }).click();
  await expect(
    page.getByRole('heading', { name: 'Beta limits and data use' }),
  ).toBeVisible();
  await expect(
    page.getByText(/Automatic artifact deletion is not enabled/),
  ).toBeVisible();
  await page.screenshot({
    path: '.data/public-beta/review/docs-mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: '.data/public-beta/review/docs-desktop.png',
    fullPage: true,
  });
});
test('public mode setup fails closed and recovers through retry', async ({
  page,
}) => {
  let ready = false;
  await page.route('**/api/beta-mode', (r) =>
    ready
      ? r.fulfill({ json: { publicSignup: true } })
      : r.fulfill({ status: 503, json: { error: 'unavailable' } }),
  );
  await page.route('**/api/client/invite/me', (r) =>
    r.fulfill({ status: 401, json: { error: 'sign in' } }),
  );
  await page.goto('/beta');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    copy.publicBeta.unavailable,
  );
  await expect(
    page.getByRole('button', { name: 'Continue with GitHub' }),
  ).toHaveCount(0);
  ready = true;
  await page
    .getByRole('button', { name: 'Retry sign-in', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Try GreenCI' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue with GitHub' }),
  ).toBeEnabled();
  await page.goto('/beta?error=signin');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    copy.publicBeta.failed,
  );
  await expect(page.getByLabel('Invitation code')).toHaveCount(0);
});
test('an anonymous public dashboard user goes to GitHub signup instead of the owner session flow', async ({
  page,
}) => {
  await page.route('**/api/beta-mode', (r) =>
    r.fulfill({ json: { publicSignup: true } }),
  );
  await page.route('**/api/client/audit', (r) =>
    r.fulfill({ status: 401, json: { error: 'sign in' } }),
  );
  await page.route('**/api/client/invite/me', (r) =>
    r.fulfill({ status: 401, json: { error: 'sign in' } }),
  );
  let ownerSessionRequested = false;
  await page.route('**/api/client/session', (r) => {
    ownerSessionRequested = true;
    return r.fulfill({ status: 401, json: { error: 'owner only' } });
  });
  await page.goto('/app/audit');
  await page
    .getByRole('button', { name: 'Sign in to view private results' })
    .click();
  await expect(page).toHaveURL(/\/beta$/);
  await expect(
    page.getByRole('heading', { name: 'Try GreenCI' }),
  ).toBeVisible();
  expect(ownerSessionRequested).toBe(false);
});
