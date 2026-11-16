import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';
import { z } from 'zod';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const setup = z
  .object({
    appId: z.number().int().positive(),
    installationId: z.string().regex(/^\d+$/),
    repo: z.literal('heysalad-ai/greenci-practice'),
    sandboxCredentialPaired: z.literal(true),
  })
  .parse(JSON.parse(await readFile('.data/beta/setup.json', 'utf8')));
const ownerEmail = z.email().parse(process.argv[2]);
const source = parse(await readFile('apps/api/wrangler.jsonc', 'utf8'));
const response = await fetch(
  'https://greenci-web-dev.heysalad-o.workers.dev/',
  { redirect: 'manual' },
);
const location = new URL(response.headers.get('location') ?? '');
if (
  response.status !== 302 ||
  location.hostname !== 'heysalad.cloudflareaccess.com'
)
  throw new Error('Private web Access policy must remain enabled');
const audience = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .parse(location.searchParams.get('kid'));
// Public Access application metadata is only a candidate until a real signed session passes validation.
source.env = { dev: source.env.dev };
// Official SDK uses HTTP to the bearer-protected bridge in this account.
source.compatibility_flags = [
  ...new Set([...source.compatibility_flags, 'global_fetch_strictly_public']),
];
Object.assign(source.env.dev.vars, {
  SCAFFOLD_ONLY: 'false',
  BETA_ENABLED: 'true',
  GITHUB_APP_ID: String(setup.appId),
  GITHUB_INSTALLATION_ID: setup.installationId,
  BETA_REPOS: setup.repo,
  BETA_WRITE_PATHS: 'src/**',
  BETA_ACCESS_TEAM: 'heysalad',
  BETA_ACCESS_AUD: audience,
  BETA_OWNER_EMAIL: ownerEmail,
  BETA_OWNER_LOGIN: 'chilu18',
  DEV_OWNER_DAILY_REPAIRS: '3',
  AGENT_PROVIDER: 'openai',
  OPENAI_AGENT_MODEL: 'gpt-6-sol',
  DECISIONS_PROVIDER: 'responses',
  DECISIONS_MODEL: 'gpt-6-luna',
  SANDBOX_CLIENT: 'cloudflare',
  EMAIL_PROVIDER: 'disabled',
  CLOUDFLARE_SANDBOX_WORKER_URL:
    'https://greenci-sandbox-beta-dev.heysalad-o.workers.dev',
});
await writeFile(
  'apps/api/wrangler.beta.generated.jsonc',
  JSON.stringify(source, null, 2) + '\n',
);
console.log(
  'Prepared dev-only beta profile from public installation metadata. Confirm private session and live provider probes before accepting repair traffic.',
);
