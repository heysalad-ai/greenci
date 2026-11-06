import { Worker } from 'bullmq';
import { loadConfig } from '@greenci/core/config';
const config = loadConfig(process.env);
const url = new URL(config.REDIS_URL);
const worker = new Worker(
  'greenci',
  async (job) => {
    // Fail closed: M0 must never acknowledge an unimplemented agent job.
    throw new Error(`Job type is not implemented in M0: ${job.name}`);
  },
  {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      db: Number(url.pathname.slice(1) || 0),
      ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    },
    concurrency: 1,
  },
);
worker.on('ready', () =>
  console.log('GreenCI worker ready (M0; no agent jobs implemented)'),
);
worker.on('error', () =>
  console.error('Worker connection unavailable; check Redis'),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void worker.close().then(() => process.exit(0));
  });
}
