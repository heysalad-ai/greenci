import { test, expect } from '@playwright/test';
test('component catalogue renders reference assets and keyboard controls in both themes', async ({
  page,
}) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto('/app/_ui');
  await expect(
    page.getByRole('heading', { name: 'GreenCI components' }),
  ).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(10);
  for (const theme of ['light', 'dark']) {
    await page
      .locator('html')
      .evaluate((node, theme) => node.setAttribute('data-theme', theme), theme);
    await page
      .getByRole('button', { name: 'Open fix PR', exact: true })
      .focus();
    await expect(
      page.getByRole('button', { name: 'Open fix PR', exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Verify', exact: true }).first(),
    ).toBeDisabled();
    expect(
      await page
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: `docs/fidelity/ui-${theme}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
