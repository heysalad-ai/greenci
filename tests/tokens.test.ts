import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { tokens } from '../packages/tokens/src/index.js';
it('exports the exact approved tokens for non-web clients', () => {
  expect(tokens).toEqual(
    JSON.parse(readFileSync('design-system/tokens.json', 'utf8')),
  );
  expect(readFileSync('packages/tokens/generated/tokens.css', 'utf8')).toBe(
    readFileSync('design-system/tokens.css', 'utf8'),
  );
});
