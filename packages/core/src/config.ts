import { z } from 'zod';
const optional = z.string().optional().default('');
export const configSchema = z.object({
  APP_ENV: z.enum(['local', 'dev', 'staging', 'prod']).default('local'),
  DATABASE_URL: z
    .url()
    .default('postgres://greenci:greenci@localhost:5432/greenci'),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  GITHUB_MODE: z.enum(['mock', 'app']).default('mock'),
  GITHUB_APP_ID: optional,
  GITHUB_PRIVATE_KEY_PATH: optional,
  GITHUB_WEBHOOK_SECRET: z
    .string()
    .min(16)
    .default('local-only-webhook-secret'),
  SMEE_URL: z.union([z.literal(''), z.url()]).default(''),
  AGENT_PROVIDER: z.enum(['fake', 'openai', 'anthropic']).default('fake'),
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: optional,
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: optional,
  SMTP_URL: z.url().default('smtp://localhost:1025'),
  WEB_URL: z.url().default('http://localhost:3000'),
  API_URL: z.url().default('http://localhost:4000'),
  MOCK_GITHUB_URL: z.url().default('http://localhost:4001'),
  WORK_DIR: z.string().min(1).default('.data/work'),
  SANDBOX: z.enum(['docker', 'none']).default('docker'),
});
export type Config = z.infer<typeof configSchema>;
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    // Only field names: validation messages must never echo secret values.
    throw new Error(
      `Invalid configuration fields: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  const config = result.data;
  if (config.APP_ENV !== 'local')
    throw new Error('TODO(deploy): only APP_ENV=local is supported');
  if (config.SANDBOX === 'none' && env.CI !== 'true')
    throw new Error('SANDBOX=none is permitted only in CI');
  if (
    config.GITHUB_MODE === 'app' &&
    (!config.GITHUB_APP_ID || !config.GITHUB_PRIVATE_KEY_PATH)
  )
    throw new Error('GitHub App credentials are required');
  if (
    config.AGENT_PROVIDER === 'openai' &&
    (!config.OPENAI_API_KEY || !config.OPENAI_MODEL)
  )
    throw new Error('OpenAI key and model are required');
  if (
    config.AGENT_PROVIDER === 'anthropic' &&
    (!config.ANTHROPIC_API_KEY || !config.ANTHROPIC_MODEL)
  )
    throw new Error('Anthropic key and model are required');
  return config;
}
