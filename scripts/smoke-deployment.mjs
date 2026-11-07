import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const environment = process.argv[2];
if (!['dev', 'staging', 'production'].includes(environment))
  throw new Error('Explicit environment required');
const suffix = { dev: 'dev', staging: 'staging', production: 'prod' }[
  environment
];
await mkdir('.data/smoke', { recursive: true });
await writeFile(
  '.data/smoke/index.mjs',
  `export default {fetch(request,env){const path=new URL(request.url).pathname;return path==='/api-healthz'?env.API.fetch('https://api/healthz'):env.WEB.fetch('https://web'+path)}};`,
);
await writeFile(
  '.data/smoke/wrangler.jsonc',
  JSON.stringify({
    name: 'greenci-private-smoke',
    main: 'index.mjs',
    compatibility_date: '2026-11-06',
    workers_dev: false,
    services: [
      { binding: 'API', service: `greenci-api-${suffix}`, remote: true },
      { binding: 'WEB', service: `greenci-web-${suffix}`, remote: true },
    ],
  }),
);
const child = spawn(
  'corepack',
  [
    'pnpm',
    'exec',
    'wrangler',
    'dev',
    '--config',
    '.data/smoke/wrangler.jsonc',
    '--ip',
    '127.0.0.1',
    '--port',
    '8799',
  ],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);
const stopped = once(child, 'exit');
let spawnError;
child.on('error', (error) => {
  spawnError = error;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnError) throw spawnError;
    try {
      const res = await fetch('http://127.0.0.1:8799/healthz', {
        signal: globalThis.AbortSignal.timeout(1000),
      });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Local proxy starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready)
    throw new Error('Authenticated deployment probe did not become healthy');
  for (const path of ['/api-healthz', '/healthz']) {
    const res = await fetch('http://127.0.0.1:8799' + path);
    if (!res.ok || (await res.json()).status !== 'ok')
      throw new Error(`Health check failed: ${path}`);
  }
  const landing = await fetch('http://127.0.0.1:8799/');
  const html = await landing.text();
  if (
    !landing.ok ||
    !html.includes('Red to green, one key at a time.') ||
    !html.includes('Software only')
  )
    throw new Error('Landing smoke failed');
  console.log(`Authenticated ${environment} API/web health and landing passed`);
} finally {
  child.kill('SIGTERM');
  await stopped;
}
