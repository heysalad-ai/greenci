import { expect, it } from 'vitest';
import {
  deviceMessageSchema,
  hostMessageSchema,
} from '../packages/deck-protocol/src/index.js';
import { DisabledSandbox } from '../packages/agent/src/index.js';
it('rejects malformed device keys and light progress', () => {
  expect(
    deviceMessageSchema.safeParse({
      type: 'key',
      key: 'merge',
      action: 'press',
    }).success,
  ).toBe(false);
  expect(
    deviceMessageSchema.safeParse({
      type: 'key',
      key: 'command',
      action: 'long_press',
    }).success,
  ).toBe(true);
  expect(
    hostMessageSchema.safeParse({
      type: 'lights',
      key: 'verify',
      mode: 'fill',
      color: 'green',
      progress: 1.1,
    }).success,
  ).toBe(false);
});
it('never launches host commands from the disabled sandbox', async () => {
  await expect(
    new DisabledSandbox().run('echo must-not-run', { timeoutMs: 1 }),
  ).rejects.toThrow('not implemented');
});
