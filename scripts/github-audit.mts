import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { copy } from '../packages/core/src/copy.js';

const c = copy.audit;
export type Transport = (endpoint: string, query?: string) => Promise<unknown>;
const repoSchema = z.object({
  full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  default_branch: z.string(),
  pushed_at: z.string().nullable(),
  security_and_analysis: z
    .record(z.string(), z.object({ status: z.string() }))
    .optional(),
});
type Repo = z.infer<typeof repoSchema>;
export type Finding = {
  rule: string;
  level: 'high' | 'medium' | 'low';
  path?: string;
  line?: number;
};
export type Record = {
  repo: Repo;
  observedAt: string;
  sha: string | null;
  ci: string;
  protection: unknown;
  alerts: unknown;
  security: Repo['security_and_analysis'];
  files: number;
  workflows: number;
  workflowsRead: number;
  findings: Finding[];
  gaps: string[];
};

// This allowlist is also applied to fake transports. GraphQL mutation is forbidden.
export function allowed(endpoint: string, query?: string): boolean {
  if (endpoint === 'graphql')
    return !!query && /^query\s*\{/.test(query) && !/\bmutation\b/.test(query);
  return (
    !query &&
    /^(?:user|user\/repos\?affiliation=owner&per_page=100&page=\d+|orgs\/[\w.-]+\/repos\?type=all&per_page=100&page=\d+|repos\/[\w.-]+\/[\w.-]+\/(?:git\/trees\/[a-f0-9]{40}\?recursive=1|contents\/\.github\/workflows\/[\w.-]+\.ya?ml\?ref=[a-f0-9]{40}))$/.test(
      endpoint,
    )
  );
}
export const liveTransport: Transport = async (endpoint, query) => {
  if (!allowed(endpoint, query)) throw new Error('endpoint-denied');
  const args =
    endpoint === 'graphql'
      ? ['api', 'graphql', '-f', `query=${query}`]
      : ['api', '--method', 'GET', endpoint];
  try {
    const { stdout } = await promisify(execFile)('gh', args, {
      timeout: 45000,
      maxBuffer: 24 * 1024 * 1024,
    });
    return JSON.parse(stdout) as unknown;
  } catch (error) {
    const partial = z.object({ stdout: z.string() }).safeParse(error);
    if (endpoint === 'graphql' && partial.success) {
      try {
        return JSON.parse(partial.data.stdout) as unknown;
      } catch {
        /* generic error below */
      }
    }
    throw new Error('api-unavailable-or-denied');
  } // Never surface raw stderr/body.
};

export async function inventory(
  api: Transport,
  owner: string,
  org: boolean,
): Promise<Repo[]> {
  if (!/^[\w.-]+$/.test(owner)) throw new Error('invalid-owner');
  const result: Repo[] = [];
  for (let page = 1; page <= 100; page++) {
    const endpoint = org
      ? `orgs/${owner}/repos?type=all&per_page=100&page=${page}`
      : `user/repos?affiliation=owner&per_page=100&page=${page}`;
    const rows = z.array(repoSchema).parse(await api(endpoint));
    result.push(
      ...rows.filter(
        (r) => r.full_name.split('/')[0]?.toLowerCase() === owner.toLowerCase(),
      ),
    );
    if (rows.length < 100) {
      if (new Set(result.map((r) => r.full_name)).size !== result.length)
        throw new Error('duplicate-inventory');
      return result;
    }
  }
  throw new Error('pagination-limit');
}

export function workflowFindings(path: string, body: string): Finding[] {
  const findings: Finding[] = [];
  const add = (rule: string, level: Finding['level'], line?: number) =>
    findings.push({
      rule,
      level,
      path,
      ...(line === undefined ? {} : { line }),
    });
  const lines = body.split('\n');
  const target = /\bpull_request_target\s*:/.test(body);
  if (target) add('target-context-review', 'medium');
  if (
    target &&
    /github\.event\.pull_request\.head\.(?:sha|ref|repo)/.test(body) &&
    /uses:\s*actions\/checkout@/.test(body)
  )
    add('target-head-checkout-review', 'high');
  let inRun = false,
    runIndent = -1;
  for (const [i, line] of lines.entries()) {
    if (/^\s*#/.test(line)) continue;
    const run = /^(\s*)(?:-\s*)?run\s*:/.exec(line);
    if (run) {
      inRun = true;
      runIndent = line.indexOf('run');
    } else if (
      line.trim() &&
      (line.match(/^\s*/)?.[0].length ?? 0) <= runIndent
    )
      inRun = false;
    if (
      inRun &&
      /\$\{\{\s*github\.(?:event\.(?:issue|pull_request|comment|discussion)\.(?:title|body|head\.(?:ref|label))|head_ref)/.test(
        line,
      )
    )
      add('untrusted-shell-expression', 'high', i + 1);
    const action = /\buses:\s*['"]?([^\s'"#]+)/.exec(line)?.[1];
    if (
      action &&
      !action.startsWith('./') &&
      !/@[a-f0-9]{40}$/i.test(action) &&
      !/@sha256:[a-f0-9]{64}$/i.test(action)
    )
      add('action-not-immutable', 'medium', i + 1);
    if (/permissions:\s*write-all/.test(line))
      add('broad-token-permissions', 'medium', i + 1);
  }
  if (!/^\s*permissions\s*:/m.test(body))
    add('token-permissions-inherited', 'low');
  if (!/^\s*concurrency\s*:/m.test(body)) add('no-concurrency-policy', 'low');
  if (!/^\s*timeout-minutes\s*:/m.test(body)) add('no-job-timeout', 'low');
  return findings;
}

const commitSchema = z.object({
  data: z
    .object({
      repository: z
        .object({
          defaultBranchRef: z
            .object({
              name: z.string(),
              branchProtectionRule: z.unknown().optional(),
              target: z.object({
                oid: z.string().regex(/^[a-f0-9]{40}$/),
                statusCheckRollup: z.object({ state: z.string() }).nullable(),
              }),
            })
            .nullable(),
          vulnerabilityAlerts: z
            .object({ totalCount: z.number().int().nonnegative() })
            .nullable()
            .optional(),
        })
        .nullable(),
    })
    .optional(),
  errors: z
    .array(
      z.object({
        type: z.string().optional(),
        path: z.array(z.union([z.string(), z.number()])).optional(),
      }),
    )
    .optional(),
});
const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      size: z.number().optional(),
    }),
  ),
});
export async function auditRepo(api: Transport, repo: Repo): Promise<Record> {
  const out: Record = {
    repo,
    observedAt: new Date().toISOString(),
    sha: null,
    ci: 'unknown',
    protection: null,
    alerts: null,
    security: repo.security_and_analysis,
    files: 0,
    workflows: 0,
    workflowsRead: 0,
    findings: [],
    gaps: [],
  };
  const [owner, name] = repo.full_name.split('/');
  try {
    const result = commitSchema.parse(
      await api(
        'graphql',
        `query { repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}) { defaultBranchRef { name branchProtectionRule { requiresApprovingReviews requiredApprovingReviewCount requiresStatusChecks requiresCodeOwnerReviews isAdminEnforced } target { ... on Commit { oid statusCheckRollup { state } } } } vulnerabilityAlerts(first:1,states:OPEN) { totalCount } } }`,
      ),
    );
    for (const e of result.errors ?? [])
      out.gaps.push(`graphql:${(e.path ?? []).join('.')}:${e.type ?? 'error'}`);
    const data = result.data?.repository;
    if (!data) {
      out.gaps.push('repository-data-unavailable');
      return out;
    }
    out.alerts = data.vulnerabilityAlerts ?? null;
    if (data.vulnerabilityAlerts && data.vulnerabilityAlerts.totalCount > 0)
      out.findings.push({ rule: 'open-dependency-alerts', level: 'high' });
    if (!data.defaultBranchRef) {
      out.ci = 'empty';
      return out;
    }
    const branch = data.defaultBranchRef;
    out.sha = branch.target.oid;
    out.ci = branch.target.statusCheckRollup?.state ?? 'no-checks';
    out.protection = branch.branchProtectionRule ?? null;
    if (!branch.branchProtectionRule)
      out.findings.push({
        rule: 'no-classic-branch-protection',
        level: 'medium',
      });
    if (out.ci === 'FAILURE' || out.ci === 'ERROR')
      out.findings.push({ rule: 'default-ci-failing', level: 'high' });
    if (out.ci === 'no-checks')
      out.findings.push({ rule: 'no-default-checks', level: 'medium' });
    const tree = treeSchema.parse(
      await api(`repos/${repo.full_name}/git/trees/${out.sha}?recursive=1`),
    );
    if (tree.truncated) out.gaps.push('tree-truncated');
    const paths = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path);
    out.files = paths.length;
    if (!tree.truncated && !paths.some((p) => /(^|\/)SECURITY\.md$/i.test(p)))
      out.findings.push({ rule: 'no-security-policy-file', level: 'low' });
    if (
      !tree.truncated &&
      !paths.some((p) =>
        /(^|\/)(?:test[s]?|__tests__)(\/|\.)|\.(?:test|spec)\./i.test(p),
      )
    )
      out.findings.push({ rule: 'no-test-paths-detected', level: 'low' });
    if (
      !tree.truncated &&
      paths.includes('package.json') &&
      !paths.some((p) =>
        /^(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/.test(
          p,
        ),
      )
    )
      out.findings.push({ rule: 'no-root-js-lockfile', level: 'medium' });
    if (
      !tree.truncated &&
      !paths.some((p) => /^\.github\/dependabot\.ya?ml$/.test(p))
    )
      out.findings.push({ rule: 'no-dependabot-config', level: 'low' });
    const workflows = tree.tree.filter(
      (e) =>
        e.type === 'blob' &&
        /^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(e.path),
    );
    out.workflows = workflows.length;
    for (const w of workflows) {
      if ((w.size ?? Infinity) > 128000) {
        out.gaps.push(`workflow-size:${w.path}`);
        continue;
      }
      try {
        const file = z
          .object({
            encoding: z.literal('base64'),
            content: z.string(),
            type: z.literal('file'),
          })
          .parse(
            await api(
              `repos/${repo.full_name}/contents/${w.path}?ref=${out.sha}`,
            ),
          );
        const body = Buffer.from(file.content, 'base64').toString('utf8');
        out.findings.push(...workflowFindings(w.path, body));
        out.workflowsRead++;
      } catch {
        out.gaps.push(`workflow-unavailable:${w.path}`);
      }
    }
    // Feature omission means unknown, never disabled. No secret alert values are requested.
    for (const key of [
      'secret_scanning',
      'secret_scanning_push_protection',
      'dependabot_security_updates',
    ]) {
      if (repo.security_and_analysis?.[key]?.status === 'disabled')
        out.findings.push({ rule: `disabled-${key}`, level: 'medium' });
    }
  } catch {
    out.gaps.push('api-or-schema-unavailable');
  }
  return out;
}

export function markdown(records: Record[]): string {
  const count = (rule: string) =>
    records.filter((r) => r.findings.some((f) => f.rule === rule)).length;
  const rows = [...records].sort(
    (a, b) =>
      b.findings.filter((f) => f.level === 'high').length -
      a.findings.filter((f) => f.level === 'high').length,
  );
  return (
    `# ${c.title}\n\n${new Date().toISOString()}\n\n${c.scope}\n\n${c.limits}\n\n${c.total}: ${records.length}; ${c.pinned}: ${records.filter((r) => r.sha).length}; ${c.gaps}: ${records.filter((r) => r.gaps.length).length}.\n\n` +
    Object.entries(c.rules)
      .map(([rule, label]) => `- ${label}: ${count(rule)}`)
      .join('\n') +
    `\n\n| ${c.repository} | ${c.commit} | CI | ${c.findings} | ${c.gaps} |\n|---|---|---|---|---|\n` +
    rows
      .map(
        (r) =>
          `| ${r.repo.full_name} | ${r.sha?.slice(0, 12) ?? '—'} | ${r.ci} | ${r.findings.map((f) => `${f.level}: ${c.rules[f.rule as keyof typeof c.rules] ?? f.rule}${f.path ? ` (${f.path}:${f.line ?? 1})` : ''}`).join('<br>')} | ${r.gaps.join(', ')} |`,
      )
      .join('\n') +
    '\n'
  );
}

export async function main() {
  const output = resolve(process.argv[2] ?? '.data/github-audit/latest');
  await mkdir(output, { recursive: true, mode: 0o700 });
  const repos = [
    ...(await inventory(liveTransport, 'chilu18', false)),
    ...(await inventory(liveTransport, 'heysalad-ai', true)),
  ];
  const records: Record[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < repos.length) {
        const repo = repos[next++];
        if (!repo) break;
        const record = await auditRepo(liveTransport, repo);
        records.push(record);
        await writeFile(
          resolve(output, repo.full_name.replace('/', '--') + '.json'),
          JSON.stringify(record, null, 2),
          { mode: 0o600 },
        );
        if (records.length % 20 === 0)
          console.log(`${c.progress}: ${records.length}/${repos.length}`);
      }
    }),
  );
  await writeFile(
    resolve(output, 'report.json'),
    JSON.stringify(
      { version: 1, observedAt: new Date().toISOString(), records },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await writeFile(resolve(output, 'report.md'), markdown(records), {
    mode: 0o600,
  });
  console.log(`${c.saved}: ${output}; ${records.length}`);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await main();
