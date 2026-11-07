import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdir,
  writeFile,
  readFile,
  mkdtemp,
  rm,
  access,
} from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertPushBranch,
  safePath,
  needsApproval,
  rulesSchema,
  allPassed,
} from '@greenci/core';
import { signWebhook, type Patch, type gitCheckSchema } from '@greenci/github';
import { z } from 'zod';
import { fixtures, type FixtureRepo } from './fixtures.js';
const execute = promisify(execFile);
type Check = z.infer<typeof gitCheckSchema>;
export class MockStore {
  private prs = new Map<
    string,
    {
      number: number;
      state: 'open' | 'merged' | 'closed';
      url: string;
      branch: string;
    }
  >();
  private checksBySha = new Map<string, Check[]>();
  constructor(
    readonly root: string,
    readonly webhookUrl?: string,
    readonly secret = 'local-only-webhook-secret',
  ) {}
  fixture(repo: string) {
    if (!Object.hasOwn(fixtures, repo)) throw new Error('Unknown fixture repo');
    return fixtures[repo as FixtureRepo];
  }
  private repoPath(repo: string) {
    this.fixture(repo);
    return path.join(this.root, repo + '.git');
  }
  private async git(repo: string, args: string[]) {
    return (
      await execute('git', ['--git-dir', this.repoPath(repo), ...args], {
        timeout: 10_000,
        maxBuffer: 1_000_000,
      })
    ).stdout.trim();
  }
  private async persist() {
    await mkdir(this.root, { recursive: true });
    await writeFile(
      path.join(this.root, 'pulls.json'),
      JSON.stringify([...this.prs.entries()]),
    );
  }
  async seed() {
    try {
      const stored = z
        .array(
          z.tuple([
            z.string(),
            z.object({
              number: z.number().int().positive(),
              state: z.enum(['open', 'merged', 'closed']),
              url: z.string(),
              branch: z.string(),
            }),
          ]),
        )
        .parse(
          JSON.parse(
            await readFile(path.join(this.root, 'pulls.json'), 'utf8'),
          ),
        );
      this.prs = new Map(stored);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    for (const repo of Object.keys(fixtures)) {
      try {
        await access(this.repoPath(repo));
        continue;
      } catch {
        /* First seed only; never reset existing work. */
      }
      const f = this.fixture(repo),
        work = await mkdtemp(path.join(tmpdir(), 'greenci-seed-'));
      try {
        await mkdir(path.dirname(this.repoPath(repo)), { recursive: true });
        await execute('git', ['init', '--initial-branch=main', work]);
        for (const [name, content] of Object.entries({
          [f.path]: f.before,
          'test.mjs': f.test,
          'AGENTS.md':
            'Push only greenci/* branches. Never read secrets or .env files. Protected: migrations/**.\n',
        })) {
          await mkdir(path.dirname(path.join(work, name)), { recursive: true });
          await writeFile(path.join(work, name), content);
        }
        await execute('git', ['-C', work, 'add', '.']);
        await execute('git', [
          '-C',
          work,
          '-c',
          'user.name=GreenCI fixture',
          '-c',
          'user.email=fixture@localhost',
          'commit',
          '-m',
          'Seed failing fixture',
        ]);
        await execute('git', ['clone', '--bare', work, this.repoPath(repo)]);
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    }
  }
  async sha(repo: string, ref: string) {
    if (!/^[\w./-]+$/.test(ref) || ref.startsWith('-') || ref.includes('..'))
      throw new Error('Invalid ref');
    return this.git(repo, ['rev-parse', '--verify', `${ref}^{commit}`]);
  }
  async tree(repo: string, ref: string) {
    return (
      await this.git(repo, [
        'ls-tree',
        '-r',
        '--name-only',
        await this.sha(repo, ref),
      ])
    ).split('\n');
  }
  async read(repo: string, ref: string, file: string) {
    return this.git(repo, [
      'show',
      `${await this.sha(repo, ref)}:${safePath(file)}`,
    ]);
  }
  async branch(repo: string, ref: string, branch: string) {
    assertPushBranch(branch);
    const sha = await this.sha(repo, ref);
    try {
      await this.git(repo, ['branch', branch, sha]);
    } catch {
      if ((await this.sha(repo, branch)) !== sha)
        throw new Error('Branch exists at different SHA');
    }
    return sha;
  }
  async push(repo: string, branch: string, files: Patch[]) {
    assertPushBranch(branch);
    const fixture = this.fixture(repo);
    // SANDBOX=none executes only immutable first-party fixture code: arbitrary edits are never run on the host.
    for (const file of files)
      if (
        safePath(file.path) !== fixture.path ||
        file.content !== fixture.after
      )
        throw new Error('Only approved fixture patch may execute locally');
    const work = await mkdtemp(path.join(tmpdir(), 'greenci-fix-'));
    try {
      await execute('git', [
        'clone',
        '--branch',
        branch,
        this.repoPath(repo),
        work,
      ]);
      for (const file of files)
        await writeFile(path.join(work, file.path), file.content);
      await execute('git', ['-C', work, 'add', '.']);
      await execute('git', [
        '-C',
        work,
        '-c',
        'user.name=GreenCI fixture',
        '-c',
        'user.email=fixture@localhost',
        'commit',
        '--allow-empty',
        '-m',
        'Fix seeded CI failure',
      ]);
      await execute('git', ['-C', work, 'push', 'origin', branch]);
      return await this.sha(repo, branch);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  async ci(repo: string, ref: string, emit = true) {
    const sha = await this.sha(repo, ref),
      work = await mkdtemp(path.join(tmpdir(), 'greenci-ci-'));
    let status: 'passed' | 'failed' = 'passed',
      log = '';
    try {
      await execute('git', ['clone', this.repoPath(repo), work]);
      await execute('git', ['-C', work, 'checkout', '--detach', sha]);
      const fixture = this.fixture(repo);
      const source = await readFile(path.join(work, fixture.path), 'utf8');
      if (
        (source !== fixture.before && source !== fixture.after) ||
        (await readFile(path.join(work, 'test.mjs'), 'utf8')) !== fixture.test
      )
        throw new Error('Fixture integrity check failed');
      try {
        log = (
          await execute(
            process.execPath,
            ['--experimental-strip-types', '--test', 'test.mjs'],
            { cwd: work, timeout: 10_000, maxBuffer: 100_000 },
          )
        ).stdout;
      } catch (error) {
        status = 'failed';
        const output = error as { stdout?: string; stderr?: string };
        log = (output.stdout ?? '') + (output.stderr ?? '');
      }
    } finally {
      await rm(work, { recursive: true, force: true });
    }
    const checks: Check[] = [
      { sha, name: 'test (ubuntu)', status, log, defaultBranchFailed: false },
    ];
    this.checksBySha.set(`${repo}:${sha}`, checks);
    if (emit)
      await this.emit('check_run', {
        action: 'completed',
        repository: { full_name: repo, default_branch: 'main' },
        check_run: {
          name: 'test (ubuntu)',
          head_sha: sha,
          head_branch: ref,
          status: 'completed',
          conclusion: status === 'passed' ? 'success' : 'failure',
          output: { text: log },
        },
      });
    return checks;
  }
  async checks(repo: string, ref: string) {
    const sha = await this.sha(repo, ref);
    return this.checksBySha.get(`${repo}:${sha}`) ?? this.ci(repo, ref, false);
  }
  async openPr(
    repo: string,
    branch: string,
    approved: boolean,
    rules: z.infer<typeof rulesSchema>,
  ) {
    assertPushBranch(branch);
    const checks = await this.checks(repo, branch);
    if (!allPassed(checks)) throw new Error('Unverified PR denied');
    const files = (
      await this.git(repo, ['diff', '--name-only', 'main', branch])
    )
      .split('\n')
      .filter(Boolean);
    const diff = await this.git(repo, ['diff', '--numstat', 'main', branch]);
    const lines = diff.split('\n').reduce(
      (n, row) =>
        n +
        row
          .split('\t')
          .slice(0, 2)
          .reduce((a, x) => a + (Number(x) || 0), 0),
      0,
    );
    if (needsApproval(files, lines, rules) && !approved)
      throw new Error('Human approval required');
    const existing = [...this.prs.values()].find(
      (pr) => pr.branch === `${repo}:${branch}` && pr.state === 'open',
    );
    if (existing) return existing;
    const number = this.prs.size + 1,
      pr = {
        number,
        state: 'open' as const,
        url: `http://localhost:4001/repos/${repo}/pulls/${number}`,
        branch: `${repo}:${branch}`,
      };
    this.prs.set(`${repo}:${number}`, pr);
    await this.persist();
    return pr;
  }
  pr(repo: string, number: number) {
    const pr = this.prs.get(`${repo}:${number}`);
    if (!pr) throw new Error('Unknown PR');
    return pr;
  }
  async humanMerge(repo: string, number: number) {
    const pr = this.pr(repo, number);
    if (pr.state !== 'open') throw new Error('PR is not open');
    // Human-only mock UI endpoint. GitHubClient deliberately has no merge/approve method.
    const branch = pr.branch.slice(repo.length + 1);
    await this.git(repo, [
      'update-ref',
      'refs/heads/main',
      await this.sha(repo, branch),
    ]);
    pr.state = 'merged';
    await this.persist();
    await this.emit('pull_request', {
      action: 'closed',
      repository: { full_name: repo },
      pull_request: {
        number,
        merged: true,
        head: { ref: branch, sha: await this.sha(repo, branch) },
      },
    });
    return pr;
  }
  async emit(event: string, payload: unknown) {
    if (!this.webhookUrl) return;
    const body = JSON.stringify(payload);
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Event': event,
        'X-GitHub-Delivery': crypto.randomUUID(),
        'X-Hub-Signature-256': await signWebhook(this.secret, body),
      },
      body,
    });
    if (!response.ok)
      throw new Error(`Webhook delivery failed (${response.status})`);
  }
}
