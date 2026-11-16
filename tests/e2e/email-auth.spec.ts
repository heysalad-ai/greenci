import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { copy } from '../../packages/core/src/copy.js';
test('email signup and returning login verify a code, expose a separate GitHub connection and sign out', async ({
  page,
}) => {
  let signedIn = false,
    requested = '';
  await page.route('**/api/beta-mode', (r) =>
    r.fulfill({ json: { publicSignup: true, emailSignup: true } }),
  );
  await page.route('**/api/client/invite/me', (r) =>
    signedIn
      ? r.fulfill({
          json: {
            csrf: 'fixture-csrf',
            orgId: 'invite-email-fixture',
            login: '',
            admin: false,
            email: 'qa@example.com',
            githubConnected: false,
            githubAuthorized: false,
            installUrl: null,
          },
        })
      : r.fulfill({ status: 401, json: { error: 'sign in' } }),
  );
  await page.route('**/api/client/email/start', (r) => {
    requested = r.request().postDataJSON().email;
    return r.fulfill({
      json: { challenge: '12345678-1234-4234-8234-123456789012' },
    });
  });
  await page.route('**/api/client/email/verify', (r) => {
    if (r.request().postDataJSON().code !== '12345678')
      return r.fulfill({ status: 401, json: { error: 'invalid' } });
    signedIn = true;
    return r.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/client/invite/logout', (r) => {
    signedIn = false;
    return r.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/client/email/github', (r) => {
    expect(r.request().headers()['x-csrf-token']).toBe('fixture-csrf');
    return r.fulfill({ status: 503, json: { error: 'provider fixture' } });
  });
  await mkdir('.data/email-auth/review', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/beta');
  await expect(
    page.getByRole('button', { name: 'Continue with GitHub' }),
  ).toBeVisible();
  await page.screenshot({
    path: '.data/email-auth/review/desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel(copy.emailAuth.email, { exact: true })
    .fill('qa@example.com');
  await page
    .getByRole('button', { name: copy.emailAuth.send, exact: true })
    .click();
  expect(requested).toBe('qa@example.com');
  await expect(page.getByRole('status')).toHaveText(copy.emailAuth.sent);
  await page.getByLabel(copy.emailAuth.code).fill('00000000');
  await page.getByRole('button', { name: copy.emailAuth.verify }).click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    copy.emailAuth.failed,
  );
  await page.screenshot({
    path: '.data/email-auth/review/code-error-mobile.png',
    fullPage: true,
  });
  await page.getByLabel(copy.emailAuth.code).fill('12345678');
  await page.getByRole('button', { name: copy.emailAuth.verify }).click();
  await expect(page.getByText('qa@example.com', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: copy.emailAuth.link, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: copy.inviteBeta.refresh, exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: '.data/email-auth/review/signed-in-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: copy.inviteBeta.logout, exact: true })
    .click();
  await expect(
    page.getByLabel(copy.emailAuth.email, { exact: true }),
  ).toBeVisible();
  // Returning login uses the same email verification UI rather than a new-account form.
  await page
    .getByLabel(copy.emailAuth.email, { exact: true })
    .fill('qa@example.com');
  await page
    .getByRole('button', { name: copy.emailAuth.send, exact: true })
    .click();
  await page.getByLabel(copy.emailAuth.code).fill('12345678');
  await page.getByRole('button', { name: copy.emailAuth.verify }).click();
  await page
    .getByRole('button', { name: copy.emailAuth.link, exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    copy.publicBeta.unavailable,
  );
});
test('email request errors retain recovery and do not hide GitHub sign-in', async ({
  page,
}) => {
  await page.route('**/api/beta-mode', (r) =>
    r.fulfill({ json: { publicSignup: true, emailSignup: true } }),
  );
  await page.route('**/api/client/invite/me', (r) =>
    r.fulfill({ status: 401, json: { error: 'sign in' } }),
  );
  await page.route('**/api/client/email/start', (r) =>
    r.fulfill({ status: 429, json: { error: 'limit' } }),
  );
  await page.goto('/beta');
  await page
    .getByLabel(copy.emailAuth.email, { exact: true })
    .fill('qa@example.com');
  await page
    .getByRole('button', { name: copy.emailAuth.send, exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    copy.emailAuth.rate,
  );
  await expect(
    page.getByRole('button', { name: 'Continue with GitHub', exact: true }),
  ).toBeEnabled();
});

test('returning email users retain their GitHub workspace and get a separate reconnect action', async ({
  page,
}) => {
  await page.route('**/api/beta-mode', (r) =>
    r.fulfill({ json: { publicSignup: true, emailSignup: true } }),
  );
  await page.route('**/api/client/invite/me', (r) =>
    r.fulfill({
      json: {
        csrf: 'fixture-csrf',
        orgId: 'invite-42',
        login: 'linked-tester',
        email: 'qa@example.com',
        admin: false,
        githubConnected: true,
        githubAuthorized: false,
        installUrl: null,
      },
    }),
  );
  let freshLinkRequested = false,
    reauthorized = false;
  await page.route('**/api/client/email/github', (r) => {
    freshLinkRequested = true;
    return r.fulfill({ status: 403, json: { error: 'must not relink' } });
  });
  await page.route('**/api/client/invite/public/start', (r) => {
    reauthorized = true;
    return r.fulfill({ status: 503, json: { error: 'provider fixture' } });
  });
  await page.goto('/beta');
  await expect(page.getByText(copy.emailAuth.reconnectDetail)).toBeVisible();
  await expect(
    page.getByRole('link', { name: copy.inviteBeta.dashboard }).first(),
  ).toHaveAttribute('href', '/app/audit');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.data/email-auth/review/returning-linked-mobile.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: copy.emailAuth.reconnect, exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText(
    copy.publicBeta.unavailable,
  );
  expect(reauthorized).toBe(true);
  expect(freshLinkRequested).toBe(false);
});
