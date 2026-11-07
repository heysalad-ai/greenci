import { expect, it } from 'vitest';
import { SdkAgentProvider } from '../packages/agent/src/sdk.js';
import { loadConfig, runSchema } from '../packages/core/src/index.js';
const context = (repo = 'acme/payments') => ({
  run: runSchema.parse({
    id: 'sdk-fixture',
    repo,
    orgId: 'acme',
    headSha: 'fixture',
    branch: 'main',
    failingCheckName: 'test',
    state: 'repairing',
    attempts: 1,
  }),
  logs: 'test failed',
  files: {
    'AGENTS.md': 'Never touch secrets. Migrations require approval.',
  } as Record<string, string>,
});
it('runs diagnosis and deterministic repair through the actual Agents SDK with no network', async () => {
  const provider = new SdkAgentProvider(loadConfig({}));
  expect((await provider.diagnose(context())).summary).toContain(
    'Fixture date',
  );
  const result = await provider.repair(context());
  expect(result.pendingState).toBeUndefined();
  expect(result.files[0]?.content).toContain('2027-10-31');
});
it('serializes a real SDK interruption and resumes the exact approved tool call', async () => {
  const provider = new SdkAgentProvider(loadConfig({})),
    input = context('acme/ledger');
  const pending = await provider.repair(input);
  expect(pending.pendingState).toBeTruthy();
  expect(pending.files).toEqual([]);
  const result = await provider.resume(input, pending.pendingState!);
  expect(result.pendingState).toBeUndefined();
  expect(result.files[0]?.path).toBe('migrations/001-ledger.sql');
  expect(result.files[0]?.content).toContain('INTEGER');
});

it('falls back to the SDK fake provider when local Docker is unavailable', async () => {
  const { createLocalAgentProvider } =
    await import('../packages/agent/src/local.js');
  const config = loadConfig({
    AGENT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'fixture-key',
    OPENAI_AGENT_MODEL: 'fixture-model',
    SANDBOX_CLIENT: 'docker',
  });
  const provider = await createLocalAgentProvider(config, async () => false);
  expect((await provider.repair(context())).files[0]?.content).toContain(
    '2027-10-31',
  );
  await expect(
    createLocalAgentProvider({ ...loadConfig({}), APP_ENV: 'dev' }),
  ).rejects.toThrow('local-only');
});

it('requires approval from actual before/after size even if the fixture model reports a tiny diff', async () => {
  const provider = new SdkAgentProvider(loadConfig({})),
    input = context();
  input.files['tests/billing.spec.ts'] = Array.from(
    { length: 220 },
    (_, i) => `original line ${i}`,
  ).join('\n');
  const result = await provider.repair(input);
  expect(result.pendingState).toBeTruthy();
  expect(result.files).toEqual([]);
  expect(result.diff).toContain('-original line 219');
  expect(result.diff).toContain("+export const fixtureDate = '2027-10-31'");
});
