import { describe, expect, it } from 'vitest';
import { loadConfig, validateBindings } from '../packages/core/src/config.js';
describe('Cloudflare configuration', () => {
  it('keeps public admission opt-in and requires a separate dev origin', () => {
    expect(loadConfig({}).PUBLIC_BETA_ENABLED).toBe('false');
    const base = {
      PUBLIC_BETA_ENABLED: 'true',
      INVITE_BETA_ENABLED: 'true',
      PUBLIC_BETA_URL: 'https://public.example',
    };
    expect(loadConfig(base).PUBLIC_BETA_URL).toBe('https://public.example');
    for (const extra of [
      { PUBLIC_BETA_URL: 'http://localhost:3000' },
      { PUBLIC_BETA_URL: 'https://public.example/path' },
      { PUBLIC_BETA_URL: 'https://user:pass@public.example' },
      { INVITE_BETA_ENABLED: 'false' },
      { APP_ENV: 'prod' },
    ])
      expect(() => loadConfig({ ...base, ...extra })).toThrow(
        'Public beta requires',
      );
  });
  it('allows explicit email-disabled private dev beta only', () => {
    const env = {
      APP_ENV: 'dev',
      SANDBOX: 'cloudflare',
      GITHUB_MODE: 'app',
      EMAIL_PROVIDER: 'disabled',
      BETA_ENABLED: 'true',
      SCAFFOLD_ONLY: 'true',
    };
    expect(loadConfig(env).EMAIL_PROVIDER).toBe('disabled');
    expect(() => loadConfig({ ...env, BETA_ENABLED: 'false' })).toThrow(
      'EMAIL_PROVIDER',
    );
    expect(() => loadConfig({ ...env, EMAIL_PROVIDER: 'local' })).toThrow(
      'EMAIL_PROVIDER',
    );
    expect(() => loadConfig({ ...env, APP_ENV: 'staging' })).toThrow(
      'EMAIL_PROVIDER',
    );
  });
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
  expect(
    loadConfig({
      AGENT_PROVIDER: 'openai',
      OPENAI_API_KEY: 'fixture-key',
      OPENAI_MODEL: 'fixture-model',
    }).AGENT_PROVIDER,
  ).toBe('openai');
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

it('accepts the explicit SDK model name', () => {
  expect(
    loadConfig({
      AGENT_PROVIDER: 'openai',
      OPENAI_API_KEY: 'fixture',
      OPENAI_AGENT_MODEL: 'fixture-model',
    }).OPENAI_AGENT_MODEL,
  ).toBe('fixture-model');
});

it('rejects the removed Anthropic provider explicitly', () => {
  expect(() => loadConfig({ AGENT_PROVIDER: 'anthropic' })).toThrow(
    'AGENT_PROVIDER',
  );
});
