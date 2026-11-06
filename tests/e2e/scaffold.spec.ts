import { expect, test } from '@playwright/test';
test('boots web, API and mock GitHub independently', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'GreenCI', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/m0-scaffold.png' });
  for (const [url, service] of [
    ['http://localhost:3000/api/health', 'web'],
    ['http://localhost:4000/health', 'api'],
    ['http://localhost:4001/health', 'mock-github'],
  ]) {
    const response = await request.get(url!);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service,
      milestone: 'M0',
    });
  }
});
