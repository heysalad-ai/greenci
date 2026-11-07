import { z } from 'zod';
export const states = [
  'failing',
  'diagnosing',
  'diagnosed',
  'repairing',
  'repaired',
  'verifying',
  'needs_you',
  'pr_open',
  'merged',
  'not_verified',
  'out_of_scope',
  'handed_back',
  'stopped',
] as const;
export const stateSchema = z.enum(states);
export type RunState = z.infer<typeof stateSchema>;
export const rulesSchema = z.object({
  protectedPaths: z.array(z.string()).default(['migrations/**']),
  pageMeBranches: z.array(z.string()).default([]),
  maxDiffLines: z.number().int().positive().default(200),
  autoOpenPr: z.boolean().default(true),
  allowWorkflows: z.boolean().default(false),
  autoMode: z.boolean().default(false),
  autoRepair: z.boolean().default(false),
});
export const checkSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['queued', 'running', 'passed', 'failed']),
  defaultBranchFailed: z.boolean().default(false),
});
export const diagnosisSchema = z.object({
  summary: z.string().min(1),
  file: z.string(),
  line: z.number().int().positive(),
  confidence: z.enum(['high', 'medium', 'low']),
  category: z.enum(['code', 'test', 'dependency', 'config', 'flaky', 'infra']),
  notAProductBug: z.boolean(),
  evidence: z.array(z.string()).min(1),
});
export const runSchema = z.object({
  scenario: z.enum(['normal', 'honest_miss', 'out_of_scope']).default('normal'),
  id: z.string().min(1),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  orgId: z.string().min(1),
  headSha: z.string().min(1),
  branch: z.string().min(1),
  failingCheckName: z.string(),
  state: stateSchema.default('failing'),
  attempts: z.number().int().min(0).max(3).default(0),
  startedBy: z
    .enum(['deck', 'web', 'cli', 'mobile', 'comment', 'auto'])
    .default('web'),
  rules: rulesSchema.default(() => rulesSchema.parse({})),
  diagnosis: diagnosisSchema.optional(),
  filesChanged: z.array(z.string()).default([]),
  diffLines: z.number().int().nonnegative().default(0),
  checks: z.array(checkSchema).default([]),
  fixBranch: z.string().optional(),
  prNumber: z.number().int().positive().optional(),
  verified: z.boolean().default(false),
  approved: z.boolean().default(false),
  resumeState: z.enum(['repairing', 'pr_open']).optional(),
});
export type Run = z.infer<typeof runSchema>;
export const actionSchema = z.enum([
  'diagnose',
  'repair',
  'verify',
  'approve',
  'changes',
  'take_over',
  'open_pr',
  'stop',
  'handoff',
]);
export type Action = z.infer<typeof actionSchema>;
export type DomainEvent =
  | { type: Action }
  | { type: 'diagnosis'; diagnosis: z.infer<typeof diagnosisSchema> }
  | { type: 'fix'; files: string[]; diffLines: number; branch: string }
  | { type: 'checks'; checks: z.infer<typeof checkSchema>[] }
  | { type: 'pr'; number: number }
  | { type: 'merged' };
export type Effect =
  | { type: 'enqueue'; phase: 'diagnose' | 'repair' | 'verify' | 'open_pr' }
  | { type: 'publish' | 'notify' | 'lights'; state: RunState };
const finalStates: RunState[] = ['merged', 'handed_back', 'stopped'];
export function transition(
  input: Run,
  event: DomainEvent,
): { run: Run; effects: Effect[] } {
  const run = runSchema.parse(input);
  const illegal = () => {
    throw new Error(`Illegal transition: ${run.state} → ${event.type}`);
  };
  const effects: Effect[] = [];
  const job = (phase: 'diagnose' | 'repair' | 'verify' | 'open_pr') =>
    effects.push({ type: 'enqueue', phase });
  switch (event.type) {
    case 'diagnose':
      if (run.state !== 'failing') return illegal();
      run.state = 'diagnosing';
      job('diagnose');
      break;
    case 'diagnosis': {
      if (run.state !== 'diagnosing') return illegal();
      run.diagnosis = diagnosisSchema.parse(event.diagnosis);
      run.state =
        run.diagnosis.notAProductBug ||
        ['config', 'infra'].includes(run.diagnosis.category)
          ? 'out_of_scope'
          : 'diagnosed';
      break;
    }
    case 'repair':
      if (
        !['diagnosed', 'not_verified'].includes(run.state) ||
        run.attempts >= 3
      )
        return illegal();
      run.state = 'repairing';
      run.attempts++;
      run.verified = false;
      run.approved = false;
      run.checks = [];
      job('repair');
      break;
    case 'fix':
      if (run.state !== 'repairing') return illegal();
      assertPushBranch(event.branch);
      inspectFiles(event.files, run.rules);
      run.filesChanged = event.files;
      run.diffLines = z.number().int().nonnegative().parse(event.diffLines);
      run.fixBranch = event.branch;
      run.state = 'repaired';
      break;
    case 'verify':
      if (run.state !== 'repaired') return illegal();
      run.state = 'verifying';
      job('verify');
      break;
    case 'checks': {
      if (run.state !== 'verifying') return illegal();
      run.checks = z.array(checkSchema).parse(event.checks);
      run.verified = allPassed(run.checks);
      if (!run.verified) {
        run.state = 'not_verified';
        break;
      }
      if (needsApproval(run.filesChanged, run.diffLines, run.rules)) {
        run.state = 'needs_you';
        run.resumeState = 'pr_open';
      } else {
        run.state = 'repaired';
        if (run.rules.autoOpenPr) job('open_pr');
      }
      break;
    }
    case 'approve':
      if (run.state !== 'needs_you') return illegal();
      run.approved = true;
      if (run.resumeState === 'repairing') {
        run.state = 'repairing';
        job('repair');
      } else {
        run.state = 'repaired';
        job('open_pr');
      }
      break;
    case 'changes':
      if (run.state !== 'needs_you') return illegal();
      run.state = 'not_verified';
      run.verified = false;
      break;
    case 'take_over':
      if (run.state !== 'needs_you') return illegal();
      run.state = 'handed_back';
      break;
    case 'open_pr':
      if (run.state !== 'repaired' || !run.verified) return illegal();
      job('open_pr');
      break;
    case 'pr':
      if (
        run.state !== 'repaired' ||
        !run.verified ||
        !allPassed(run.checks) ||
        (needsApproval(run.filesChanged, run.diffLines, run.rules) &&
          !run.approved)
      )
        return illegal();
      run.prNumber = z.number().int().positive().parse(event.number);
      run.state = 'pr_open';
      break;
    case 'merged':
      if (run.state !== 'pr_open') return illegal();
      run.state = 'merged';
      break;
    case 'handoff':
      if (!['out_of_scope', 'not_verified'].includes(run.state))
        return illegal();
      run.state = 'handed_back';
      break;
    case 'stop':
      if (finalStates.includes(run.state)) return illegal();
      run.state = 'stopped';
      break;
  }
  effects.push(
    { type: 'publish', state: run.state },
    { type: 'notify', state: run.state },
    { type: 'lights', state: run.state },
  );
  return { run, effects };
}
export function allPassed(
  checks: readonly z.infer<typeof checkSchema>[],
): boolean {
  return (
    checks.length > 0 && checks.every((check) => check.status === 'passed')
  );
}
export function assertPushBranch(branch: string): void {
  if (
    !/^greenci\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) ||
    /\.\.|\/\/|@\{|[.]lock$|[/.]$/.test(branch)
  )
    throw new Error('Push denied: use a greenci/* branch');
}
export function safePath(input: string): string {
  const path = input.replaceAll('\\', '/');
  if (
    !path ||
    path.startsWith('/') ||
    path.includes(':') ||
    path.split('/').some((p) => !p || p === '.' || p === '..') ||
    // Reject control bytes before a path reaches git or a sandbox.
    // eslint-disable-next-line no-control-regex
    /[\x00-\x1f%]/.test(path)
  )
    throw new Error('Unsafe repository path');
  if (
    path
      .split('/')
      .some((p) => /^(\.env.*|\.git|secrets?|credentials?)(\.|$)/i.test(p)) ||
    /\.(pem|key|p12|pfx)$/i.test(path) ||
    /(^|\/)id_(rsa|ed25519)/.test(path)
  )
    throw new Error('Secret path denied');
  return path;
}
export function matchesPath(path: string, glob: string): boolean {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\uE000')
    .replace(/\*/g, '[^/]*')
    .replace(/\uE000/g, '.*');
  return new RegExp(`^${escaped}$`).test(path);
}
export function inspectFiles(
  files: readonly string[],
  rules: z.infer<typeof rulesSchema>,
): void {
  for (const file of files) {
    const path = safePath(file);
    if (path.startsWith('.github/workflows/') && !rules.allowWorkflows)
      throw new Error('Workflow edit denied');
  }
}
export function needsApproval(
  files: readonly string[],
  lines: number,
  rules: z.infer<typeof rulesSchema>,
): boolean {
  inspectFiles(files, rules);
  return (
    lines > rules.maxDiffLines ||
    files.some((file) => {
      const path = safePath(file);
      return (
        path.startsWith('.github/workflows/') ||
        rules.protectedPaths.some((glob) => matchesPath(path, glob))
      );
    })
  );
}
export function redact(input: string): string {
  return input
    .replace(
      /"(password|secret|token|api_key)"\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"',
    )
    .replace(
      /\b(?:gh[pousr]_[\w]+|github_pat_[\w]+|sk-[\w-]+)\b/g,
      '[REDACTED]',
    )
    .replace(
      /(authorization\s*[:=]\s*(?:bearer|token)\s+)\S+/gi,
      '$1[REDACTED]',
    )
    .replace(
      /((?:password|secret|token|api_key)\s*[:=]\s*)[^\s,;]+/gi,
      '$1[REDACTED]',
    );
}
export function notificationPolicy(input: {
  state: RunState;
  watched: boolean;
  branch: string;
  pageMeBranches: readonly string[];
  hour: number;
}): { push: boolean; toast: true; summary: boolean; reason: string | null } {
  const urgent =
    input.state === 'needs_you' || (input.state === 'failing' && input.watched);
  const quiet = input.hour >= 22 || input.hour < 7;
  const suppressed = quiet && !input.pageMeBranches.includes(input.branch);
  return {
    push: urgent && !suppressed,
    toast: true,
    summary: ['pr_open', 'merged'].includes(input.state),
    reason: !urgent ? 'not_urgent' : suppressed ? 'quiet_hours' : null,
  };
}
export function moodFor(state: RunState): string {
  return (
    {
      failing: 'key-failing',
      diagnosing: 'key-diagnosing',
      diagnosed: 'key-ready',
      repairing: 'key-repairing',
      repaired: 'key-ready',
      verifying: 'key-verifying',
      needs_you: 'key-ready',
      pr_open: 'key-passing',
      merged: 'key-shipped',
      not_verified: 'key-failing',
      out_of_scope: 'key-failing',
      handed_back: 'key-ready',
      stopped: 'key-ready',
    } as const
  )[state];
}
