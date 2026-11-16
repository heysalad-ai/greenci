import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';
import { z } from 'zod';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const origin = 'https://app.greenci.dev';
const source = z
  .object({
    account_id: z.string().regex(/^[a-f0-9]{32}$/),
    main: z.literal('src/index.ts'),
    env: z
      .object({
        dev: z
          .object({
            name: z.literal('greenci-api-dev'),
            vars: z.record(z.string(), z.string()),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough()
  .parse(
    parse(await readFile('apps/api/wrangler.beta.generated.jsonc', 'utf8')),
  );
const frontend = z
  .object({
    account_id: z.string(),
    env: z.object({
      dev: z.object({
        name: z.literal('greenci-web-public-dev'),
        workers_dev: z.literal(false),
        preview_urls: z.literal(false),
        routes: z
          .array(
            z.object({
              pattern: z.literal('app.greenci.dev'),
              custom_domain: z.literal(true),
            }),
          )
          .length(1),
      }),
    }),
  })
  .parse(parse(await readFile('apps/web/wrangler.public-beta.jsonc', 'utf8')));
if (source.account_id !== frontend.account_id)
  throw new Error('Candidate account mismatch');
const vars = source.env.dev.vars;
for (const record of [vars, source.vars]) {
  if (
    record &&
    Object.keys(record).some((key) =>
      /(?:SECRET|PRIVATE_KEY|API_KEY|TOKEN|PASSWORD)$/.test(key),
    )
  )
    throw new Error(
      'Credential values must remain in Worker secrets, not candidate configuration',
    );
}
const required = {
  APP_ENV: 'dev',
  SCAFFOLD_ONLY: 'false',
  BETA_ENABLED: 'true',
  INVITE_BETA_ENABLED: 'true',
  GITHUB_MODE: 'app',
  AGENT_PROVIDER: 'openai',
  SANDBOX_CLIENT: 'cloudflare',
  WEB_URL: 'https://beta.greenci.dev',
};
for (const [key, value] of Object.entries(required))
  if (vars[key] !== value)
    throw new Error(`Existing beta profile mismatch: ${key}`);
for (const url of [
  'https://beta.greenci.dev/beta',
  'https://greenci-api-dev.heysalad-o.workers.dev/healthz',
]) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const location = response.headers.get('location');
  if (
    response.status !== 302 ||
    !location ||
    new URL(location).hostname !== 'heysalad.cloudflareaccess.com'
  )
    throw new Error('Existing dev Access protection must remain enabled');
}
// Only the dev API is a target; encrypted provider secrets are preserved remotely.
source.env = { dev: source.env.dev };
Object.assign(vars, {
  PUBLIC_BETA_ENABLED: 'true',
  PUBLIC_BETA_URL: origin,
  EMAIL_AUTH_ENABLED: 'true',
  EMAIL_AUTH_FROM: 'no-reply@email.dev.greenci.dev',
});
source.env.dev.send_email = [
  {
    name: 'AUTH_EMAIL',
    allowed_sender_addresses: ['no-reply@email.dev.greenci.dev'],
  },
];
await writeFile(
  'apps/api/wrangler.public-beta.generated.jsonc',
  JSON.stringify(source, null, 2) + '\n',
);
console.log(
  'Prepared dev public-beta candidate; no deployment or Access change performed.',
);
console.log(`Public entry: ${origin}/beta`);
console.log(`Additive GitHub callback: ${origin}/api/client/invite/callback`);
