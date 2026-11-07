import { test, expect } from '@playwright/test';
test('landing preserves the approved design and adds a usable software-only entry', async ({
  page,
}) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Red to green, one key at a time.' }),
  ).toBeVisible();
  await expect(
    page.locator('#pricing').getByText('Software only', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path:
      process.env.UPDATE_FIDELITY === '1'
        ? 'docs/fidelity/landing-desktop.png'
        : test.info().outputPath('landing-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path:
      process.env.UPDATE_FIDELITY === '1'
        ? 'docs/fidelity/landing-mobile.png'
        : test.info().outputPath('landing-mobile.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Continue without a deck', exact: true })
    .click();
  await expect(page).toHaveURL(/\/start\?deckless=1/);
  await expect(
    page.getByRole('heading', { name: 'Let GreenCI read your checks.' }),
  ).toBeVisible();
});
