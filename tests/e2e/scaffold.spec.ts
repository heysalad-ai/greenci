import { expect, test } from '@playwright/test';
test('boots Workers and resolves API through the web service binding', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', {
      name: 'Red to green, one key at a time.',
      exact: true,
    }),
  ).toBeVisible();
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    status: 'ok',
    service: 'web',
    milestone: 'M0.5',
    api: { status: 'ok', service: 'api', milestone: 'M0.5' },
  });
  const bindings = await request.get('http://localhost:8787/__local/bindings');
  expect(bindings.status()).toBe(200);
  expect(await bindings.json()).toMatchObject({
    d1: true,
    kv: true,
    r2: true,
    sandbox: { mode: 'none', executionEnabled: false },
  });
  expect((await request.get('http://localhost:4001/health')).status()).toBe(
    200,
  );
});
test('deck simulator connects to DeckSession and acknowledges buttons and keyboard', async ({
  page,
}) => {
  const sent: string[] = [];
  page.on('websocket', (socket) =>
    socket.on('framesent', (frame) => sent.push(String(frame.payload))),
  );
  await page.route('https://**/*', (route) => route.abort());
  await page.goto('/deck');
  await expect(page.getByRole('status')).toHaveText(
    'Deck connected. Press Diagnose.',
  );
  await page.getByRole('button', { name: 'Diagnose', exact: true }).click();
  await expect(page.getByTestId('last-key')).toHaveText(
    'Key received: Diagnose',
  );
  await page.keyboard.press('3');
  await expect(page.getByTestId('last-key')).toHaveText('Key received: Repair');
  await page.getByRole('button', { name: 'Command', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => sent.at(-1))
    .toBe(JSON.stringify({ type: 'key', key: 'command', action: 'press' }));
  await page.keyboard.press('Shift+1');
  await expect
    .poll(() => sent.at(-1))
    .toBe(
      JSON.stringify({ type: 'key', key: 'command', action: 'long_press' }),
    );
  await page.screenshot({ path: 'test-results/m05-deck.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: 'test-results/m05-deck-mobile.png' });
});
test('local email viewer reads the D1-backed outbox', async ({ page }) => {
  await page.goto('/app/_emails');
  await expect(
    page.getByRole('heading', { name: 'Local emails', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('No emails yet. The first fix email follows in M8.'),
  ).toBeVisible();
});
