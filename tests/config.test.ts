import { describe, expect, it } from 'vitest';
import { loadConfig, validateBindings } from '../packages/core/src/config.js';
describe('Cloudflare configuration', () => {
  it('defaults to Docker-free local fake providers', () => {
    expect(loadConfig({})).toMatchObject({
      APP_ENV: 'local',
      GITHUB_MODE: 'mock',
      AGENT_PROVIDER: 'fake',
      SANDBOX: 'none',
      EMAIL_PROVIDER: 'local',
    });
  });
  it.each(['dev', 'staging', 'prod'])(
    'rejects uncontained execution in %s',
    (APP_ENV) => {
      expect(() => loadConfig({ APP_ENV, SANDBOX: 'none' })).toThrow(
        'only locally',
      );
    },
  );
  it.each([
    { GITHUB_MODE: 'app' },
    { AGENT_PROVIDER: 'openai' },
    { AGENT_PROVIDER: 'anthropic' },
    { EMAIL_PROVIDER: 'resend' },
  ])('rejects incomplete credentials: %j', (env) => {
    expect(() => loadConfig(env)).toThrow(/required/);
  });
  it('names missing bindings and never exposes invalid input values', () => {
    expect(() => validateBindings({})).toThrow('Missing binding: DB');
    expect(() => loadConfig({ WEB_URL: 'private-token' })).toThrow(
      'Invalid configuration fields: WEB_URL',
    );
    expect(() => loadConfig({ WEB_URL: 'private-token' })).not.toThrow(
      'private-token',
    );
  });
  it('rejects mock GitHub and local email outside local', () => {
    expect(() => loadConfig({ APP_ENV: 'dev', SANDBOX: 'cloudflare' })).toThrow(
      'GITHUB_MODE',
    );
    expect(() =>
      loadConfig({ APP_ENV: 'dev', SANDBOX: 'cloudflare', GITHUB_MODE: 'app' }),
    ).toThrow('EMAIL_PROVIDER');
  });
});

it('allows a health-only dev scaffold without manufacturing provider credentials', () => {
  const env = {
    APP_ENV: 'dev',
    GITHUB_MODE: 'app',
    EMAIL_PROVIDER: 'resend',
    SANDBOX: 'cloudflare',
    SCAFFOLD_ONLY: 'true',
  };
  expect(loadConfig(env).SCAFFOLD_ONLY).toBe('true');
  expect(() => loadConfig({ ...env, SCAFFOLD_ONLY: 'false' })).toThrow(
    'GITHUB_APP_ID',
  );
  for (const APP_ENV of ['staging', 'prod'])
    expect(() => loadConfig({ ...env, APP_ENV })).toThrow('only in dev');
  expect(() => loadConfig({ ...env, AGENT_PROVIDER: 'openai' })).toThrow(
    'AGENT_PROVIDER=fake',
  );
});

it('validates complete deployed credentials and each partially supplied provider pair', () => {
  const env = {
    APP_ENV: 'dev',
    SANDBOX: 'cloudflare',
    GITHUB_MODE: 'app',
    EMAIL_PROVIDER: 'resend',
    GITHUB_APP_ID: 'fixture-id',
    GITHUB_PRIVATE_KEY: 'fixture-private-key',
    RESEND_API_KEY: 'fixture-resend',
  };
  expect(() => loadConfig(env)).toThrow('GITHUB_WEBHOOK_SECRET');
  expect(
    loadConfig({ ...env, GITHUB_WEBHOOK_SECRET: 'fixture-webhook-secret' })
      .APP_ENV,
  ).toBe('dev');
  expect(() =>
    loadConfig({ GITHUB_MODE: 'app', GITHUB_APP_ID: 'fixture-id' }),
  ).toThrow();
  expect(() =>
    loadConfig({ AGENT_PROVIDER: 'openai', OPENAI_API_KEY: 'fixture-key' }),
  ).toThrow();
  expect(() =>
    loadConfig({
      AGENT_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'fixture-key',
    }),
  ).toThrow();
  expect(
    loadConfig({
      AGENT_PROVIDER: 'openai',
      OPENAI_API_KEY: 'fixture-key',
      OPENAI_MODEL: 'fixture-model',
    }).AGENT_PROVIDER,
  ).toBe('openai');
  expect(
    loadConfig({
      AGENT_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'fixture-key',
      ANTHROPIC_MODEL: 'fixture-model',
    }).AGENT_PROVIDER,
  ).toBe('anthropic');
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
  expect(() =>
    validateBindings(
      Object.fromEntries(
        Object.entries(capabilities).map(([key, method]) => [
          key,
          { [method]: () => undefined },
        ]),
      ),
    ),
  ).not.toThrow();
  expect(() =>
    validateBindings({ DB: {}, SESSIONS: null, ARTIFACTS: 'invalid' }),
  ).toThrow();
});
