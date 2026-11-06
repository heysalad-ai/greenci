import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (existsSync('.env')) process.loadEnvFile('.env');
const hostOnly = process.argv.includes('--host-only');
if (!hostOnly) {
  const result = spawnSync(
    'docker',
    ['compose', 'up', '-d', '--wait', '--wait-timeout', '120'],
    { stdio: 'inherit' },
  );
  if (result.error || result.status !== 0) {
    console.error(
      'GreenCI requires Docker with Compose. Install/start Docker and retry. Node-only smoke testing: pnpm dev:host (no database or worker).',
    );
    process.exit(1);
  }
}
const filters = [
  '--filter=@greenci/web',
  '--filter=@greenci/api',
  '--filter=@greenci/mock-github',
  ...(!hostOnly ? ['--filter=@greenci/worker'] : []),
];
const child = spawn(
  'pnpm',
  ['exec', 'turbo', 'run', 'dev', '--env-mode=loose', ...filters],
  { stdio: 'inherit' },
);
let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (child.pid) {
    child.kill(signal);
  }
}
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
child.on('error', () => {
  console.error(
    'Unable to start pnpm. Enable Corepack and install dependencies.',
  );
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? (stopping ? 0 : 1);
});
