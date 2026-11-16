import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add } from './src/add.mjs';

test('adds two positive numbers', () => {
  assert.equal(add(2, 2), 4);
});
test('adds a negative number', () => {
  assert.equal(add(2, -1), 1);
});
