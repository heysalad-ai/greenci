import { describe, expect, it } from 'vitest';
import { loadConfig } from '../packages/core/src/config.js';
describe('boot configuration', () => {
  it('defaults to offline mock providers and Docker sandbox', () => {
    expect(loadConfig({})).toMatchObject({
      APP_ENV: 'local',
      GITHUB_MODE: 'mock',
      AGENT_PROVIDER: 'fake',
      SANDBOX: 'docker',
    });
  });
  it.each(['dev', 'staging', 'prod'])(
    'rejects undeployed environment %s',
    (APP_ENV) => {
      expect(() => loadConfig({ APP_ENV })).toThrow('TODO(deploy)');
    },
  );
  it('restricts unsandboxed execution to CI', () => {
    expect(() => loadConfig({ SANDBOX: 'none' })).toThrow('only in CI');
    expect(loadConfig({ SANDBOX: 'none', CI: 'true' }).SANDBOX).toBe('none');
  });
  it.each([
    { GITHUB_MODE: 'app' },
    { AGENT_PROVIDER: 'openai' },
    { AGENT_PROVIDER: 'anthropic' },
  ])('rejects incomplete real provider credentials: %j', (env) => {
    expect(() => loadConfig(env)).toThrow(/required/);
  });
  it('does not expose invalid values in configuration errors', () => {
    expect(() => loadConfig({ DATABASE_URL: 'private-token' })).toThrow(
      'Invalid configuration fields: DATABASE_URL',
    );
    expect(() => loadConfig({ DATABASE_URL: 'private-token' })).not.toThrow(
      'private-token',
    );
  });
});
