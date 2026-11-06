import { z } from 'zod';
export const configSchema = z.object({
  APP_ENV: z.enum(['local', 'dev', 'staging', 'prod']).default('local'),
  GITHUB_MODE: z.enum(['mock', 'app']).default('mock'),
  AGENT_PROVIDER: z.enum(['fake', 'openai', 'anthropic']).default('fake'),
  SANDBOX: z.enum(['none', 'cloudflare']).default('none'),
  EMAIL_PROVIDER: z.enum(['local', 'resend']).default('local'),
  WEB_URL: z.url().default('http://localhost:3000'),
  API_URL: z.url().default('http://localhost:8787'),
  MOCK_GITHUB_URL: z.url().default('http://localhost:4001'),
  GITHUB_APP_ID: z.string().default(''),
  GITHUB_PRIVATE_KEY: z.string().default(''),
  GITHUB_WEBHOOK_SECRET: z
    .string()
    .min(16)
    .default('local-only-webhook-secret'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
});
export type Config = z.infer<typeof configSchema>;
export function loadConfig(env: Record<string, unknown>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Invalid configuration fields: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const config = result.data;
  if (config.APP_ENV !== 'local' && config.SANDBOX === 'none')
    throw new Error('SANDBOX=none is permitted only locally');
  if (config.APP_ENV !== 'local' && config.GITHUB_MODE !== 'app')
    throw new Error('GITHUB_MODE must be app outside local');
  if (config.APP_ENV !== 'local' && config.EMAIL_PROVIDER !== 'resend')
    throw new Error('EMAIL_PROVIDER must be resend outside local');
  if (
    config.GITHUB_MODE === 'app' &&
    (!config.GITHUB_APP_ID || !config.GITHUB_PRIVATE_KEY)
  )
    throw new Error('GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required');
  if (
    config.APP_ENV !== 'local' &&
    config.GITHUB_WEBHOOK_SECRET === 'local-only-webhook-secret'
  )
    throw new Error('GITHUB_WEBHOOK_SECRET is required outside local');
  if (
    config.AGENT_PROVIDER === 'openai' &&
    (!config.OPENAI_API_KEY || !config.OPENAI_MODEL)
  )
    throw new Error('OPENAI_API_KEY and OPENAI_MODEL are required');
  if (
    config.AGENT_PROVIDER === 'anthropic' &&
    (!config.ANTHROPIC_API_KEY || !config.ANTHROPIC_MODEL)
  )
    throw new Error('ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required');
  if (config.EMAIL_PROVIDER === 'resend' && !config.RESEND_API_KEY)
    throw new Error('RESEND_API_KEY is required');
  return config;
}
// Bindings validate capabilities by name; never stringify a binding or secret.
const capabilities = {
  DB: 'prepare',
  SESSIONS: 'get',
  ARTIFACTS: 'put',
  EVENTS: 'send',
  ORG_ROOMS: 'idFromName',
  DECK_SESSIONS: 'idFromName',
  RUN_WORKFLOW: 'create',
  SANDBOX_SERVICE: 'fetch',
};
export const bindingsSchema = z.object(
  Object.fromEntries(
    Object.entries(capabilities).map(([name, method]) => [
      name,
      z.custom<Record<string, unknown>>(
        (value) =>
          !!value &&
          typeof value === 'object' &&
          typeof (value as Record<string, unknown>)[method] === 'function',
      ),
    ]),
  ),
);
export function validateBindings(env: Record<string, unknown>): void {
  const result = bindingsSchema.safeParse(env);
  if (!result.success)
    throw new Error(
      `Missing binding: ${result.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
}
