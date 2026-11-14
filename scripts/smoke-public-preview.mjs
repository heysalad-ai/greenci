const base = new URL(process.argv[2]);
if (!['http:', 'https:'].includes(base.protocol))
  throw new Error('HTTP preview URL required');
const results = [];
for (const path of [
  '/',
  '/preview',
  '/docs',
  '/styles.css',
  '/screens/m5-app.png',
  '/fonts/geist.woff2',
  '/healthz',
]) {
  const response = await fetch(new URL(path, base), { redirect: 'manual' });
  if (response.status !== 200)
    throw new Error(`${path}: expected 200, got ${response.status}`);
  if (
    !response.headers
      .get('Content-Security-Policy')
      ?.includes("connect-src 'none'")
  )
    throw new Error(`${path}: missing preview policy`);
  if (['/', '/preview', '/docs'].includes(path)) {
    const html = await response.text();
    if (
      !html.includes('Public preview.') ||
      /\[(?:PRICE|SHIP DATE|CUSTOMER QUOTE)/.test(html)
    )
      throw new Error(`${path}: invalid preview copy`);
    if (
      path === '/preview' &&
      !html.includes('These images are not interactive.')
    )
      throw new Error('Gallery must identify captures');
  }
  results.push({ path, status: response.status });
}
for (const [path, method, expected] of [
  ['/api/client/session', 'POST', 405],
  ['/api/client/runs', 'GET', 404],
  ['/webhooks/github', 'POST', 405],
  ['/start', 'GET', 303],
  ['/app', 'GET', 303],
  ['/.dev.vars', 'GET', 404],
]) {
  const response = await fetch(new URL(path, base), {
    method,
    redirect: 'manual',
  });
  if (response.status !== expected)
    throw new Error(
      `${method} ${path}: expected ${expected}, got ${response.status}`,
    );
  if (expected === 303 && response.headers.get('location') !== '/preview')
    throw new Error('Unexpected preview redirect');
  results.push({ path, method, status: response.status });
}
console.log(
  JSON.stringify({ origin: base.origin, mode: 'read-only', results }, null, 2),
);
