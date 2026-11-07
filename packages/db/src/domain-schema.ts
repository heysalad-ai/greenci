import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  githubId: text('github_id'),
  login: text('login'),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey(),
  login: text('login'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  orgId: text('org_id'),
  role: text('role'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const installations = sqliteTable('installations', {
  id: text('id').primaryKey(),
  githubInstallationId: integer('github_installation_id'),
  orgId: text('org_id'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  orgId: text('org_id'),
  fullName: text('full_name'),
  defaultBranch: text('default_branch'),
  watched: integer('watched'),
  testCommand: text('test_command'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const repoRules = sqliteTable('repo_rules', {
  id: text('id').primaryKey(),
  repoId: text('repo_id'),
  protectedPaths: text('protected_paths', { mode: 'json' }),
  pageMeBranches: text('page_me_branches', { mode: 'json' }),
  maxDiffLines: integer('max_diff_lines'),
  autoOpenPr: integer('auto_open_pr'),
  allowWorkflows: integer('allow_workflows'),
  autoMode: integer('auto_mode'),
  autoRepair: integer('auto_repair'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const decks = sqliteTable('decks', {
  id: text('id').primaryKey(),
  orgId: text('org_id'),
  userId: text('user_id'),
  serial: text('serial'),
  firmware: text('firmware'),
  lastSeenAt: text('last_seen_at'),
  status: text('status'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    repoId: text('repo_id'),
    orgId: text('org_id'),
    headSha: text('head_sha'),
    branch: text('branch'),
    failingCheckName: text('failing_check_name'),
    state: text('state'),
    causeSummary: text('cause_summary'),
    causeFile: text('cause_file'),
    causeLine: integer('cause_line'),
    confidence: text('confidence'),
    fixBranch: text('fix_branch'),
    prNumber: integer('pr_number'),
    attempts: integer('attempts'),
    startedBy: text('started_by'),
    traceId: text('trace_id'),
    snapshot: text('snapshot', { mode: 'json' }),
    version: integer('version'),
    createdAt: text('created_at'),
    updatedAt: text('updated_at'),
  },
  (table) => [index('runs_org_state').on(table.orgId, table.state)],
);
export const runEvents = sqliteTable('run_events', {
  id: text('id').primaryKey(),
  runId: text('run_id'),
  type: text('type'),
  payload: text('payload', { mode: 'json' }),
  at: text('at'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const checks = sqliteTable('checks', {
  id: text('id').primaryKey(),
  runId: text('run_id'),
  phase: text('phase'),
  name: text('name'),
  status: text('status'),
  durationMs: integer('duration_ms'),
  logExcerpt: text('log_excerpt'),
  logKey: text('log_key'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const fixes = sqliteTable('fixes', {
  id: text('id').primaryKey(),
  runId: text('run_id'),
  attempt: integer('attempt'),
  diffKey: text('diff_key'),
  filesChanged: text('files_changed', { mode: 'json' }),
  additions: integer('additions'),
  deletions: integer('deletions'),
  touchesProtected: integer('touches_protected'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  runId: text('run_id'),
  requestedReason: text('requested_reason'),
  decidedBy: text('decided_by'),
  decision: text('decision'),
  decidedAt: text('decided_at'),
  stateKey: text('state_key'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  runId: text('run_id'),
  channel: text('channel'),
  kind: text('kind'),
  sentAt: text('sent_at'),
  suppressedReason: text('suppressed_reason'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const pushTokens = sqliteTable('push_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id'),
  expoToken: text('expo_token'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const webhookDeliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  event: text('event'),
  payload: text('payload', { mode: 'json' }),
  processed: integer('processed'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),
  runId: text('run_id'),
  question: text('question', { mode: 'json' }),
  answer: text('answer', { mode: 'json' }),
  probabilities: text('probabilities', { mode: 'json' }),
  model: text('model'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});
