import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { copy } from '../packages/core/src/index.js';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const base = 'http://localhost:8977',
  state = randomBytes(32).toString('hex');
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
const manifest = {
  name: `GreenCI Dev HeySalad ${randomBytes(3).toString('hex')}`,
  url: 'https://greenci-web-dev.heysalad-o.workers.dev',
  public: false,
  description:
    'Private GreenCI beta. Install only on heysalad-ai/greenci-practice.',
  redirect_url: `${base}/callback`,
  setup_url: `${base}/installed?state=${state}`,
  hook_attributes: {
    url: 'https://greenci-webhooks-dev.heysalad-o.workers.dev/webhooks/github',
    active: true,
  },
  default_permissions: {
    actions: 'read',
    checks: 'read',
    statuses: 'read',
    contents: 'write',
    pull_requests: 'write',
    metadata: 'read',
  },
  default_events: ['check_run', 'pull_request', 'commit_comment'],
};
async function putSecret(name: string, value: string, config: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'corepack',
      [
        'pnpm',
        'exec',
        'wrangler',
        'secret',
        'put',
        name,
        '--config',
        config,
        '--env',
        'dev',
      ],
      { stdio: ['pipe', 'ignore', 'ignore'] },
    );
    child.on('error', () => reject(new Error('Secret upload could not start')));
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`Secret upload failed for ${name}; no value was logged`),
          ),
    );
    child.stdin.end(value);
  });
}
await mkdir('.data/beta', { recursive: true, mode: 0o700 });
let exchanged = false;
const server = createServer((request, response) => {
  void (async () => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(request.url ?? '/', base);
    if (request.headers.host !== 'localhost:8977' || request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader(
        'Set-Cookie',
        `greenci_setup=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`,
      );
      response.end(
        `<!doctype html><html lang="en"><meta charset="utf-8"><title>GreenCI private beta setup</title><body><h1>${escape(copy.beta.setupTitle)}</h1><p>${escape(copy.beta.setupScope)}</p><p>${escape(copy.beta.setupKeys)}</p><form method="post" action="https://github.com/organizations/heysalad-ai/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}"><button>${escape(copy.beta.setupAction)}</button></form></body></html>`,
      );
      return;
    }
    if (
      url.searchParams.get('state') !== state ||
      !request.headers.cookie?.split('; ').includes(`greenci_setup=${state}`)
    ) {
      response.writeHead(403).end(copy.beta.setupState);
      return;
    }
    if (url.pathname === '/callback' && !exchanged) {
      const code = z
        .string()
        .regex(/^[\w-]{1,200}$/)
        .parse(url.searchParams.get('code'));
      const result = await fetch(
        `https://api.github.com/app-manifests/${code}/conversions`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'GreenCI-Dev',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          redirect: 'error',
        },
      );
      if (!result.ok) throw new Error('GitHub manifest exchange failed');
      const app = z
        .object({
          id: z.number().int().positive(),
          slug: z.string().regex(/^[\w-]+$/),
          pem: z.string().min(100),
          webhook_secret: z.string().min(16),
          owner: z.object({ login: z.literal('heysalad-ai') }),
        })
        .parse(await result.json());
      exchanged = true;
      await putSecret('GITHUB_PRIVATE_KEY', app.pem, 'apps/api/wrangler.jsonc');
      await putSecret(
        'GITHUB_WEBHOOK_SECRET',
        app.webhook_secret,
        'apps/api/wrangler.jsonc',
      );
      const sandboxKey = randomBytes(32).toString('base64url');
      await putSecret(
        'CLOUDFLARE_SANDBOX_API_KEY',
        sandboxKey,
        'apps/api/wrangler.jsonc',
      );
      await putSecret(
        'SANDBOX_API_KEY',
        sandboxKey,
        'apps/sandbox/wrangler.beta.jsonc',
      );
      await writeFile(
        '.data/beta/setup.json',
        JSON.stringify(
          {
            appId: app.id,
            appSlug: app.slug,
            owner: app.owner.login,
            repo: 'heysalad-ai/greenci-practice',
            sandboxCredentialPaired: true,
          },
          null,
          2,
        ) + '\n',
        { mode: 0o600 },
      );
      response
        .writeHead(303, {
          Location: `https://github.com/apps/${app.slug}/installations/new`,
        })
        .end();
      console.log(
        'GitHub App credentials stored in dev Worker secrets; choose only greenci-practice on GitHub.',
      );
      return;
    }
    if (url.pathname === '/installed' && exchanged) {
      const installationId = z
        .string()
        .regex(/^\d+$/)
        .parse(url.searchParams.get('installation_id'));
      const metadata = JSON.parse(
        await readFile('.data/beta/setup.json', 'utf8'),
      ) as Record<string, unknown>;
      await writeFile(
        '.data/beta/setup.json',
        JSON.stringify({ ...metadata, installationId }, null, 2) + '\n',
        { mode: 0o600 },
      );
      response.end(copy.beta.setupComplete);
      console.log('GitHub installation metadata saved.');
      return;
    }
    response.writeHead(404).end();
  })().catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end(copy.beta.setupFailure);
    console.error(
      'GitHub setup did not complete; no secret-bearing response was logged.',
    );
  });
});
server.listen(8977, '127.0.0.1', () =>
  console.log(`GitHub App setup: ${base}`),
);
setTimeout(() => server.close(), 3600_000).unref();
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
