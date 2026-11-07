import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { MockStore } from '../apps/mock-github/src/store.js';
const root = new URL('../', import.meta.url).pathname;
const dataDir = process.env.GREENCI_DATA_DIR ?? '.data';
if (!/^\.data(?:\/e2e-[\w-]+)?$/.test(dataDir))
  throw new Error('Invalid local data directory');
execFileSync(
  'corepack',
  [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'greenci-local',
    '--local',
    '--config',
    'apps/api/wrangler.jsonc',
    '--persist-to',
    `${dataDir}/wrangler`,
  ],
  { cwd: root, stdio: 'inherit' },
);
const store = new MockStore(`${root}${dataDir}/mock-github`);
await store.seed();
const at = '2026-11-07T09:14:00.000Z';
const rows: string[] = [];
const quote = (value: string | number) =>
  typeof value === 'number'
    ? String(value)
    : `'${value.replaceAll("'", "''")}'`;
const insert = (table: string, data: Record<string, string | number>) =>
  rows.push(
    `INSERT OR IGNORE INTO ${table} (${Object.keys(data).join(',')},created_at,updated_at) VALUES (${Object.values(data).map(quote).join(',')},${quote(at)},${quote(at)});`,
  );
insert('users', {
  id: 'sam',
  github_id: '1',
  login: 'sam',
  name: 'Sam',
  avatar_url: '',
});
for (const org of ['acme', 'greenci']) {
  insert('orgs', { id: org, login: org });
  insert('memberships', {
    id: `sam:${org}`,
    user_id: 'sam',
    org_id: org,
    role: 'owner',
  });
  insert('installations', {
    id: org,
    github_installation_id: org === 'acme' ? 1 : 2,
    org_id: org,
  });
}
for (const repo of [
  'greenci/practice',
  'acme/payments',
  'acme/ledger',
  'acme/web',
  'acme/agent',
]) {
  insert('repos', {
    id: repo,
    org_id: repo.split('/')[0]!,
    full_name: repo,
    default_branch: 'main',
    watched: 1,
    test_command: 'node --experimental-strip-types --test test.mjs',
  });
  insert('repo_rules', {
    id: repo,
    repo_id: repo,
    protected_paths: '["migrations/**"]',
    page_me_branches: '[]',
    max_diff_lines: 200,
    auto_open_pr: 1,
    allow_workflows: 0,
    auto_mode: 0,
    auto_repair: 0,
  });
}
insert('decks', {
  id: 'GC-1',
  org_id: 'acme',
  user_id: 'sam',
  serial: 'GC-1',
  firmware: 'simulator',
  last_seen_at: at,
  status: 'offline',
});
await mkdir(`${root}${dataDir}`, { recursive: true });
await writeFile(`${root}${dataDir}/seed.sql`, rows.join('\n'));
execFileSync(
  'corepack',
  [
    'pnpm',
    'exec',
    'wrangler',
    'd1',
    'execute',
    'greenci-local',
    '--local',
    '--config',
    'apps/api/wrangler.jsonc',
    '--persist-to',
    `${dataDir}/wrangler`,
    '--file',
    `${dataDir}/seed.sql`,
  ],
  { cwd: root, stdio: 'inherit' },
);
console.log(
  'Local users, orgs, repos, rules, deck and real git fixtures seeded. Original failing runs arrive through signed CI webhooks.',
);
