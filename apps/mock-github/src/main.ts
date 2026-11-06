import { loadConfig } from '@greenci/core/config';
import { buildServer } from './server.js';
const config = loadConfig(process.env);
const url = new URL(config.MOCK_GITHUB_URL);
const server = await buildServer();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void server.close();
  });
}
await server.listen({
  port: Number(url.port || 4001),
  host: process.env.HOST ?? '127.0.0.1',
});
