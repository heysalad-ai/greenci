import { test, expect } from '@playwright/test';

test('device page waits for the matching device acknowledgment', async ({
  page,
}) => {
  let ack = 41;
  await page.route('**/api/client/device/status', async (route) => {
    await route.fulfill({
      json: {
        status: {
          firmware: 'greenci-pad-0.3.2',
          slot: 'ota_1',
          ack,
          result: ack === 42 ? 'applied' : 'boot',
          led1: ack === 42 ? 1 : 0,
          led4: 0,
          healthy: true,
          seenAt: Date.now(),
        },
        // A stale status fetch can reach the UI before the pending-command fetch.
        pending: null,
      },
    });
  });
  await page.route('**/api/client/device/command', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ op: 'led1', value: 1 });
    await route.fulfill({
      status: 202,
      json: { seq: 42, expires: Math.floor(Date.now() / 1000) + 300 },
    });
  });
  await page.goto('/app/device');
  await expect(page.getByText('Pad connected over Wi-Fi')).toBeVisible();
  await page
    .getByRole('group', { name: 'Port 1 light' })
    .getByRole('button', { name: 'Minimum' })
    .click();
  await expect(
    page.getByText('Command queued. Waiting for the pad.'),
  ).toBeVisible();
  await expect(page.getByText('Pad acknowledged the command.')).toHaveCount(0);
  ack = 42;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Pad acknowledged the command.')).toBeVisible();
});
