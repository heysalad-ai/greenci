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
