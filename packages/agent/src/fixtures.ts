export const fixtures = {
  'greenci/practice': {
    path: 'src/tax.ts',
    before:
      'export function addTax(prices: number[]) { return prices.reduce((sum, price) => sum + Math.round(price * 1.2 * 100) / 100, 0); }\n',
    after:
      'export function addTax(prices: number[]) { return Math.round(prices.reduce((sum, price) => sum + price * 1.2, 0) * 100) / 100; }\n',
    test: "import {addTax} from './src/tax.ts'; import assert from 'node:assert/strict'; import {test} from 'node:test'; test('round after summing', () => assert.equal(addTax([0.03,0.03]),0.07));\n",
    summary: 'Tax rounds before summing',
    line: 1,
    category: 'code',
  },
  'acme/payments': {
    path: 'tests/billing.spec.ts',
    before: "export const fixtureDate = '2026-10-31';\n",
    after: "export const fixtureDate = '2027-10-31';\n",
    test: "import {fixtureDate} from './tests/billing.spec.ts'; import assert from 'node:assert/strict'; import {test} from 'node:test'; test('invoice fixture is future dated', () => assert.ok(new Date(fixtureDate) > new Date('2026-11-07')));\n",
    summary: 'Fixture date 2026-10-31 is now in the past',
    line: 1,
    category: 'test',
  },
  'acme/ledger': {
    path: 'migrations/001-ledger.sql',
    before: 'CREATE TABLE ledger (amount TEXT);\n',
    after: 'CREATE TABLE ledger (amount INTEGER);\n',
    test: "import {readFileSync} from 'node:fs'; import assert from 'node:assert/strict'; import {test} from 'node:test'; test('ledger uses integer minor units', () => assert.match(readFileSync('migrations/001-ledger.sql','utf8'),/amount INTEGER/));\n",
    summary: 'Ledger migration stores amount as text',
    line: 1,
    category: 'code',
  },
  'acme/web': {
    path: 'src/main.ts',
    before: 'export const healthy = true;\n',
    after: 'export const healthy = true;\n',
    test: "import {test} from 'node:test'; test('healthy',()=>{});\n",
    summary: 'All checks passing',
    line: 1,
    category: 'code',
  },
  'acme/agent': {
    path: 'src/main.ts',
    before: 'export const healthy = true;\n',
    after: 'export const healthy = true;\n',
    test: "import {test} from 'node:test'; test('healthy',()=>{});\n",
    summary: 'All checks passing',
    line: 1,
    category: 'code',
  },
} as const;
export type FixtureRepo = keyof typeof fixtures;
