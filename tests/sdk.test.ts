import { createRequire } from 'node:module';
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

it('recognizes SDK freeform patch fields and validates both paths in moves', async () => {
  const { toolPaths } = await import('../packages/agent/src/sdk.js');
  expect(
    toolPaths({
      patch:
        '*** Begin Patch\n*** Update File: /workspace/src/add.mjs\n*** Move to: src/sum.mjs\n@@\n-old\n+new\n*** End Patch',
    }),
  ).toEqual(['src/add.mjs', 'src/sum.mjs']);
  expect(() =>
    toolPaths({
      patch:
        '*** Begin Patch\n*** Update File: /workspace/../secrets\n*** End Patch',
    }),
  ).toThrow();
});

it('guards native Responses patch edits at the editor boundary, including beta write scope', async () => {
  const { vi } = await import('vitest');
  const { guardNativePatchTool } = await import('../packages/agent/src/sdk.js');
  type NativeTool = Parameters<typeof guardNativePatchTool>[0];
  // Resolve the actual SDK from its owning workspace instead of adding a duplicate root dependency.
  const { applyPatchTool, RunContext } = createRequire(
    new URL('../packages/agent/package.json', import.meta.url),
  )('@openai/agents') as {
    applyPatchTool(options: { editor: NativeTool['editor'] }): NativeTool;
    RunContext: new () => Parameters<NativeTool['needsApproval']>[0];
  };
  const editor = {
    createFile: vi.fn(async () => {}),
    updateFile: vi.fn(async () => {}),
    deleteFile: vi.fn(async () => {}),
  };
  const rules = context().run.rules;
  const guarded = guardNativePatchTool(applyPatchTool({ editor }), rules, [
    'src/**',
  ]);
  expect(guarded.type).toBe('apply_patch');
  await guarded.editor.updateFile({
    type: 'update_file',
    path: '/workspace/src/add.mjs',
    diff: '@@\n-old\n+new',
  });
  expect(editor.updateFile).toHaveBeenCalledWith(
    expect.objectContaining({ path: 'src/add.mjs' }),
    undefined,
  );
  for (const file of [
    '/etc/passwd',
    '/workspace/../secret',
    'src/.env',
    'test.mjs',
    '.github/workflows/ci.yml',
  ]) {
    expect(() =>
      guarded.editor.updateFile({
        type: 'update_file',
        path: file,
        diff: '@@\n-old\n+new',
      }),
    ).toThrow();
  }
  expect(editor.updateFile).toHaveBeenCalledTimes(1);
  const local = guardNativePatchTool(applyPatchTool({ editor }), {
    ...rules,
    protectedPaths: ['migrations/**'],
  });
  expect(
    await local.needsApproval(new RunContext(), {
      type: 'update_file',
      path: 'migrations/001.sql',
      diff: '@@\n-old\n+new',
    }),
  ).toBe(true);
  expect(
    await guarded.needsApproval(new RunContext(), {
      type: 'update_file',
      path: 'src/add.mjs',
      diff: '@@\n-old\n+new',
    }),
  ).toBe(false);
});
