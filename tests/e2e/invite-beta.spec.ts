import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
test('invited tester can connect a selected repository then open the repair dashboard', async ({
  page,
}) => {
  await page.route('**/api/client/invite/me', (r) =>
    r.fulfill({
      json: {
        csrf: 'fixture-csrf',
        orgId: 'invite-42',
        login: 'outsider',
        admin: false,
        installUrl: 'https://github.com/apps/fixture/installations/new',
      },
    }),
  );
  await page.route('**/api/client/invite/repositories', (r) =>
    r.fulfill({
      json: {
        repos: [
          {
            full_name: 'outside/repo',
            default_branch: 'main',
            installationId: 123,
          },
        ],
      },
    }),
  );
  let connection: unknown;
  await page.route('**/api/client/invite/connect', (r) => {
    connection = r.request().postDataJSON();
    return r.fulfill({ json: { repo: 'outside/repo' } });
  });
  await mkdir('.data/invite-beta/review', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/beta');
  await expect(
    page.getByText('GitHub connected:', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: 'Install GreenCI Dev on selected repositories',
    }),
  ).toHaveAttribute(
    'href',
    'https://github.com/apps/fixture/installations/new',
  );
  await page
    .getByRole('button', { name: 'Refresh GitHub repositories' })
    .click();
  await page
    .getByLabel('Repository', { exact: true })
    .selectOption('outside/repo');
  await page
    .getByRole('button', { name: 'Connect repository', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Repository connected');
  await page.screenshot({
    path: '.data/invite-beta/review/connected.png',
    fullPage: true,
  });
  expect(connection).toEqual({ repo: 'outside/repo', installationId: 123 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.data/invite-beta/review/connected-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('invitation errors and operator creation/revocation stay explicit', async ({
  page,
}) => {
  await page.route('**/api/client/invite/me', (r) =>
    r.fulfill({ status: 401, json: { error: 'sign in' } }),
  );
  await page.route('**/api/client/invite/start', (r) =>
    r.fulfill({ status: 403, json: { error: 'denied' } }),
  );
  await mkdir('.data/invite-beta/review', { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/beta');
  await expect(page.getByLabel('Invitation code')).toBeVisible();
  await page.screenshot({
    path: '.data/invite-beta/review/desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: '.data/invite-beta/review/mobile.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel('Invitation code')
    .fill('fixture-invitation-code-'.repeat(3));
  await page.getByRole('button', { name: 'Continue with GitHub' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'This step could not complete.' }),
  ).toBeVisible();
  await page.route('**/api/client/invite/me', (r) =>
    r.fulfill({
      json: {
        csrf: 'fixture-csrf',
        orgId: 'owner',
        login: 'owner',
        admin: true,
        installUrl: null,
      },
    }),
  );
  let revoked = false;
  await page.route('**/api/client/invite/admin/invites', (r) =>
    r.request().method() === 'POST'
      ? r.fulfill({ status: 201, json: { code: 'private-fixture-code' } })
      : r.fulfill({
          json: {
            invites: [
              {
                id: 'fixture',
                email: 'outside@example.test',
                login: 'outsider',
                expires_at: '2026-12-01T00:00:00Z',
                revoked: revoked ? 1 : 0,
              },
            ],
          },
        }),
  );
  await page.route('**/api/client/invite/admin/revoke', (r) => {
    revoked = true;
    return r.fulfill({ json: { ok: true } });
  });
  await page.reload();
  await page.getByLabel('Access email').fill('outside@example.test');
  await page.getByLabel('GitHub username').fill('outsider');
  await page
    .getByRole('button', { name: 'Create seven-day invitation' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Share this code privately',
  );
  await page.getByRole('button', { name: 'Revoke invitation' }).click();
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
});
