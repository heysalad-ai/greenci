import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
process.env.WRANGLER_SEND_METRICS = 'false';
process.env.NEXT_TELEMETRY_DISABLED = '1';
const children = new Set();
let stopping = false;
function stop(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}
function start(args, cwd = root) {
  const child = spawn('pnpm', args, { cwd, stdio: 'inherit' });
  children.add(child);
  child.once('error', () => {
    console.error('Unable to start local GreenCI process');
    process.exitCode = 1;
    stop();
  });
  child.once('exit', (code) => {
    children.delete(child);
    if (!stopping) {
      process.exitCode = code || 1;
      stop();
    }
  });
  return child;
}
async function command(args) {
  const child = spawn('pnpm', args, { cwd: root, stdio: 'inherit' });
  children.add(child);
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => {
      children.delete(child);
      if (code === 0) resolve();
      else reject(new Error('Local preparation failed'));
    });
  });
}
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
try {
  await command(['db:migrate']);
  await command(['--filter', '@greenci/web', 'build:worker']);
  if (!stopping) {
    start([
      'exec',
      'wrangler',
      'dev',
      '--config',
      'apps/api/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '8787',
      '--persist-to',
      '.data/wrangler',
    ]);
    start([
      'exec',
      'wrangler',
      'dev',
      '--config',
      'apps/sandbox/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '8788',
      '--persist-to',
      '.data/wrangler',
    ]);
    start([
      'exec',
      'wrangler',
      'dev',
      '--config',
      'apps/web/wrangler.jsonc',
      '--ip',
      '127.0.0.1',
      '--port',
      '3000',
      '--persist-to',
      '.data/wrangler',
    ]);
    start(['--filter', '@greenci/mock-github', 'dev']);
    console.log('Deck simulator: http://localhost:3000/deck');
  }
} catch {
  console.error(
    'GreenCI local preparation failed. See the command output above.',
  );
  process.exitCode = 1;
  stop();
}
