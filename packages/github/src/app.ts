import { Buffer } from 'node:buffer';
import { createPrivateKey } from 'node:crypto';
import { z } from 'zod';
import {
  allPassed,
  assertPushBranch,
  inspectFiles,
  needsApproval,
  matchesPath,
  redact,
  safePath,
  type Config,
} from '@greenci/core';
import {
  gitCheckSchema,
  patchSchema,
  repoSchema,
  type GitHubClient,
  type Patch,
} from './index.js';

const shaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const shaObject = z.object({ sha: shaSchema });
const commitSchema = shaObject.extend({
  commit: z.object({ tree: shaObject }),
});
const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      mode: z.string(),
      sha: shaSchema,
      size: z.number().optional(),
    }),
  ),
});
const encode = encodeURIComponent;
const b64url = (value: Uint8Array | string) =>
  Buffer.from(value).toString('base64url');
export async function appJwt(
  appId: string,
  pem: string,
  now = Date.now(),
): Promise<string> {
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iat: Math.floor(now / 1000) - 60, exp: Math.floor(now / 1000) + 540, iss: appId }))}`;
  const der = createPrivateKey(pem).export({ format: 'der', type: 'pkcs8' });
  const key = await crypto.subtle.importKey(
    'pkcs8',
    new Uint8Array(der),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return `${unsigned}.${b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))))}`;
}

/** A deliberately repository-scoped installation client. No merge, approval or default-branch write API. */
export class GitHubAppClient implements GitHubClient {
  private cached?: { token: string; expires: number };
  private allowed: string[];
  constructor(
    private config: Pick<
      Config,
      | 'GITHUB_APP_ID'
      | 'GITHUB_PRIVATE_KEY'
      | 'GITHUB_INSTALLATION_ID'
      | 'BETA_REPOS'
      | 'BETA_WRITE_PATHS'
    >,
    private transport: typeof fetch = (input, init) =>
      globalThis.fetch(input, init),
  ) {
    this.allowed = config.BETA_REPOS.split(',').map((name) =>
      repoSchema.parse(name.trim()),
    );
    if (
      !this.allowed.length ||
      new Set(this.allowed.map((repo) => repo.split('/')[0]!.toLowerCase()))
        .size !== 1
    )
      throw new Error('Configure repositories from one installation owner');
  }
  private repo(repo: string) {
    if (!this.allowed.includes(repoSchema.parse(repo)))
      throw new Error('Repository is outside the beta allowlist');
    return `/repos/${repo}`;
  }
  private async raw(
    path: string,
    token: string,
    method = 'GET',
    body?: unknown,
  ) {
    const response = await this.transport(`https://api.github.com${path}`, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'GreenCI-Dev',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      console.warn('GitHub API request rejected', {
        path: path.split('?')[0],
        status: response.status,
      });
      throw new Error(`GitHub request failed (${response.status})`);
    }
    return response.json() as Promise<unknown>;
  }
  private async token() {
    if (this.cached && this.cached.expires > Date.now() + 60_000)
      return this.cached.token;
    const jwt = await appJwt(
      this.config.GITHUB_APP_ID,
      this.config.GITHUB_PRIVATE_KEY,
    );
    const id = z
      .string()
      .regex(/^\d+$/)
      .parse(this.config.GITHUB_INSTALLATION_ID);
    const installation = z
      .object({
        account: z.object({ login: z.string() }),
        suspended_at: z.string().nullable(),
      })
      .parse(await this.raw(`/app/installations/${id}`, jwt));
    if (
      installation.suspended_at ||
      installation.account.login.toLowerCase() !==
        this.allowed[0]!.split('/')[0]!.toLowerCase()
    )
      throw new Error('Installation owner does not match the beta allowlist');
    const result = z
      .object({ token: z.string().min(1), expires_at: z.iso.datetime() })
      .parse(
        await this.raw(`/app/installations/${id}/access_tokens`, jwt, 'POST', {
          repositories: this.allowed.map((repo) => repo.split('/')[1]),
          permissions: {
            contents: 'write',
            actions: 'read',
            checks: 'read',
            statuses: 'read',
            pull_requests: 'write',
            metadata: 'read',
          },
        }),
      );
    this.cached = {
      token: result.token,
      expires: Date.parse(result.expires_at),
    };
    return result.token;
  }
  private async request(
    repo: string,
    suffix: string,
    method = 'GET',
    body?: unknown,
  ) {
    const path = this.repo(repo);
    return this.raw(path + suffix, await this.token(), method, body);
  }
  async repos() {
    return [...this.allowed];
  }
  async metadata(repo: string) {
    return z
      .object({ full_name: z.string(), default_branch: z.string() })
      .parse(await this.request(repo, ''));
  }
  async permission(repo: string, login: string) {
    const response = z
      .object({ permission: z.string() })
      .parse(
        await this.request(repo, `/collaborators/${encode(login)}/permission`),
      );
    return response.permission === 'admin'
      ? 'admin'
      : ['write', 'maintain'].includes(response.permission)
        ? 'write'
        : ['read', 'triage'].includes(response.permission)
          ? 'read'
          : 'none';
  }
  async comment(repo: string, target: string, body: string) {
    if (/^\d+$/.test(target))
      await this.request(repo, `/issues/${target}/comments`, 'POST', {
        body: redact(body),
      });
    else
      await this.request(
        repo,
        `/commits/${shaSchema.parse(target)}/comments`,
        'POST',
        { body: redact(body) },
      );
  }
  private async commit(repo: string, ref: string) {
    return commitSchema.parse(
      await this.request(repo, `/commits/${encode(ref)}`),
    );
  }
  async head(repo: string, ref: string) {
    return (await this.commit(repo, ref)).sha;
  }
  private async entries(repo: string, ref: string) {
    const commit = await this.commit(repo, ref);
    const tree = treeSchema.parse(
      await this.request(
        repo,
        `/git/trees/${commit.commit.tree.sha}?recursive=1`,
      ),
    );
    if (tree.truncated || tree.tree.length > 2000)
      throw new Error('Repository snapshot exceeds the beta limit');
    return tree.tree
      .filter(
        (entry) =>
          entry.type === 'blob' && ['100644', '100755'].includes(entry.mode),
      )
      .filter((entry) => {
        try {
          safePath(entry.path);
          return true;
        } catch {
          return false;
        }
      });
  }
  async tree(repo: string, ref: string) {
    return (await this.entries(repo, ref)).map((entry) => entry.path);
  }
  async read(repo: string, ref: string, path: string) {
    const safe = safePath(path);
    const entry = (await this.entries(repo, ref)).find(
      (entry) => entry.path === safe,
    );
    if (!entry)
      throw new Error('File is not a normal, non-secret snapshot blob');
    const file = z
      .object({
        encoding: z.literal('base64'),
        content: z.string(),
        size: z.number().max(100_000),
      })
      .parse(await this.request(repo, `/git/blobs/${entry.sha}`));
    return Buffer.from(file.content.replace(/\s/g, ''), 'base64').toString(
      'utf8',
    );
  }
  async branch(repo: string, sha: string, branch: string) {
    assertPushBranch(branch);
    shaSchema.parse(sha);
    if ((await this.metadata(repo)).default_branch === branch)
      throw new Error('Default-branch writes are denied');
    try {
      const existing = z
        .object({ object: shaObject })
        .parse(
          await this.request(
            repo,
            `/git/ref/heads/${branch.split('/').map(encode).join('/')}`,
          ),
        );
      if (existing.object.sha !== sha)
        throw new Error('Existing repair branch has moved');
      return sha;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'GitHub request failed (404)'
      )
        throw error;
    }
    return z.object({ object: shaObject }).parse(
      await this.request(repo, '/git/refs', 'POST', {
        ref: `refs/heads/${branch}`,
        sha,
      }),
    ).object.sha;
  }
  async push(
    repo: string,
    branch: string,
    files: Patch[],
    rules: Parameters<GitHubClient['push']>[3],
    approved = false,
  ) {
    assertPushBranch(branch);
    if ((await this.metadata(repo)).default_branch === branch)
      throw new Error('Default-branch writes are denied');
    const patches = z.array(patchSchema).min(1).max(20).parse(files);
    inspectFiles(
      patches.map((patch) => patch.path),
      rules,
    );
    const allowedPaths = this.config.BETA_WRITE_PATHS.split(',')
      .map((path) => path.trim())
      .filter(Boolean);
    if (
      !allowedPaths.length ||
      patches.some(
        (patch) => !allowedPaths.some((glob) => matchesPath(patch.path, glob)),
      )
    )
      throw new Error('Patch is outside the beta write-path allowlist');
    if (new Set(patches.map((patch) => patch.path)).size !== patches.length)
      throw new Error('Duplicate patch paths');
    const parent = await this.commit(repo, branch),
      entries = await this.entries(repo, parent.sha);
    const comparisonTree: {
      path: string;
      mode: string;
      type: 'blob';
      content: string;
    }[] = [];
    let lines = 0;
    for (const patch of patches) {
      const old = entries.find((entry) => entry.path === patch.path);
      const original = old ? await this.read(repo, parent.sha, patch.path) : '';
      lines += original.split('\n').length + patch.content.split('\n').length;
      comparisonTree.push({
        path: patch.path,
        mode: old?.mode ?? '100644',
        type: 'blob',
        content: patch.content,
      });
    }
    if (
      needsApproval(
        patches.map((patch) => patch.path),
        lines,
        rules,
      ) &&
      !approved
    )
      throw new Error('Protected patch requires approval before push');
    const tree = shaObject.parse(
      await this.request(repo, '/git/trees', 'POST', {
        base_tree: parent.commit.tree.sha,
        tree: comparisonTree,
      }),
    );
    const commit = shaObject.parse(
      await this.request(repo, '/git/commits', 'POST', {
        message: `fix: repair failing check (${branch})`,
        tree: tree.sha,
        parents: [parent.sha],
      }),
    );
    if ((await this.commit(repo, branch)).sha !== parent.sha)
      throw new Error('Repair branch moved during staging');
    await this.request(
      repo,
      `/git/refs/heads/${branch.split('/').map(encode).join('/')}`,
      'PATCH',
      { sha: commit.sha, force: false },
    );
    return commit.sha;
  }
  async compare(repo: string, base: string, head: string) {
    const result = z
      .object({
        total_commits: z.number().max(100),
        files: z
          .array(
            z.object({
              filename: z.string(),
              previous_filename: z.string().optional(),
              status: z.string(),
              additions: z.number(),
              deletions: z.number(),
              patch: z.string().optional(),
            }),
          )
          .max(299),
      })
      .parse(
        await this.request(repo, `/compare/${encode(base)}...${encode(head)}`),
      );
    if (
      result.files.some(
        (file) =>
          !file.patch || file.previous_filename || file.status === 'renamed',
      )
    )
      throw new Error('Incomplete or renamed comparison requires a person');
    return {
      diff: result.files
        .map(
          (file) =>
            `--- a/${safePath(file.filename)}\n+++ b/${file.filename}\n${file.patch}`,
        )
        .join('\n'),
      files: result.files.map((file) => safePath(file.filename)),
      additions: result.files.reduce((sum, file) => sum + file.additions, 0),
      deletions: result.files.reduce((sum, file) => sum + file.deletions, 0),
    };
  }
  async checks(repo: string, ref: string) {
    const sha = await this.head(repo, ref);
    const result = z
      .object({
        total_count: z.number().max(100),
        check_runs: z.array(
          z.object({
            name: z.string(),
            status: z.string(),
            conclusion: z.string().nullable(),
            details_url: z.string().nullable().optional(),
            output: z.object({
              title: z.string().nullable(),
              summary: z.string().nullable(),
              text: z.string().nullable().optional(),
            }),
          }),
        ),
      })
      .parse(
        await this.request(
          repo,
          `/commits/${sha}/check-runs?filter=latest&per_page=100`,
        ),
      );
    const statuses = z
      .object({
        total_count: z.number().max(100),
        statuses: z.array(
          z.object({
            context: z.string(),
            state: z.string(),
            description: z.string().nullable(),
          }),
        ),
      })
      .parse(await this.request(repo, `/commits/${sha}/status?per_page=100`));
    const checks = result.check_runs.map((check) =>
      gitCheckSchema.parse({
        name: check.name,
        sha,
        status:
          check.status === 'completed'
            ? check.conclusion === 'success'
              ? 'passed'
              : 'failed'
            : check.status === 'queued'
              ? 'queued'
              : 'running',
        log: redact(
          [check.output.title, check.output.summary, check.output.text]
            .filter(Boolean)
            .join('\n'),
        ),
      }),
    );
    for (let index = 0; index < result.check_runs.length; index++) {
      const source = result.check_runs[index]!;
      const job = source.details_url?.match(
        new RegExp(
          `^https://github\\.com/${repo}/actions/runs/\\d+/job/(\\d+)(?:\\?|$)`,
        ),
      );
      if (job && checks[index]!.status === 'failed') {
        checks[index]!.log = redact(await this.jobLog(repo, job[1]!));
      }
    }
    for (const status of statuses.statuses)
      checks.push(
        gitCheckSchema.parse({
          name: `status:${status.context}`,
          sha,
          status:
            status.state === 'success'
              ? 'passed'
              : status.state === 'pending'
                ? 'running'
                : 'failed',
          log: redact(status.description ?? ''),
        }),
      );
    return checks;
  }
  private async jobLog(repo: string, id: string) {
    const response = await this.transport(
      `https://api.github.com${this.repo(repo)}/actions/jobs/${id}/logs`,
      {
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${await this.token()}`,
          'User-Agent': 'GreenCI-Dev',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    let logs = response;
    if (response.status === 302) {
      const location = new URL(response.headers.get('location') ?? '');
      if (
        location.protocol !== 'https:' ||
        location.username ||
        location.password ||
        !/(?:^|\.)(?:githubusercontent\.com|actions\.githubusercontent\.com|blob\.core\.windows\.net|s3\.amazonaws\.com)$/.test(
          location.hostname,
        )
      )
        throw new Error('Untrusted GitHub log redirect');
      // Never forward an installation token to a signed log-download URL.
      logs = await this.transport(location, {
        redirect: 'manual',
        signal: AbortSignal.timeout(30_000),
      });
    }
    if (!logs.ok || Number(logs.headers.get('Content-Length') ?? 0) > 4_000_000)
      throw new Error('GitHub job logs unavailable or too large');
    const reader = logs.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder();
    let text = '',
      size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4_000_000)
          throw new Error('GitHub job logs exceed the beta limit');
        text += decoder.decode(chunk.value, { stream: true });
      }
    } finally {
      await reader.cancel();
    }
    return text + decoder.decode();
  }
  async runChecks(repo: string, sha: string) {
    shaSchema.parse(sha);
    // The installation-token push triggers the repository's own CI. Never execute customer code on this host.
    for (let attempt = 0; attempt < 24; attempt++) {
      const checks = await this.checks(repo, sha);
      if (
        checks.length &&
        checks.every((check) => ['passed', 'failed'].includes(check.status))
      )
        return checks;
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    throw new Error(
      'GitHub CI did not finish within the beta verification window',
    );
  }
  async openPr(
    repo: string,
    branch: string,
    checks: Parameters<GitHubClient['openPr']>[2],
    approved: boolean,
    rules: Parameters<GitHubClient['openPr']>[4],
  ) {
    assertPushBranch(branch);
    const head = await this.head(repo, branch),
      metadata = await this.metadata(repo);
    if (
      !allPassed(checks) ||
      checks.some((check) => check.sha !== head) ||
      !allPassed(await this.checks(repo, head))
    )
      throw new Error(
        'Fresh passing checks on the exact repair SHA are required',
      );
    const diff = await this.compare(repo, metadata.default_branch, head);
    const expected = await this.checks(repo, metadata.default_branch);
    if (
      !expected.length ||
      expected.some(
        (check) =>
          !checks.some(
            (candidate) =>
              candidate.name === check.name && candidate.status === 'passed',
          ),
      )
    )
      throw new Error(
        'Required baseline checks are missing from the repair SHA',
      );
    inspectFiles(diff.files, rules);
    if (
      !diff.files.length ||
      (needsApproval(diff.files, diff.additions + diff.deletions, rules) &&
        !approved)
    )
      throw new Error('PR denied: empty or unapproved protected change');
    const existing = z
      .array(z.object({ number: z.number() }))
      .parse(
        await this.request(
          repo,
          `/pulls?state=open&head=${encode(`${repo.split('/')[0]}:${branch}`)}`,
        ),
      );
    if (existing[0])
      return this.pr(repo, existing[0].number, head, metadata.default_branch);
    const result = z.object({ number: z.number() }).parse(
      await this.request(repo, '/pulls', 'POST', {
        title: 'fix: repair failing CI check',
        body: `GreenCI verified the checks on ${head}. Review this change before merging.`,
        head: branch,
        base: metadata.default_branch,
        draft: true,
      }),
    );
    return this.pr(repo, result.number, head, metadata.default_branch);
  }
  async pr(
    repo: string,
    number: number,
    expectedSha?: string,
    expectedBase?: string,
  ) {
    const result = z
      .object({
        number: z.number(),
        state: z.enum(['open', 'closed']),
        merged: z.boolean(),
        html_url: z.url(),
        head: shaObject,
        base: z.object({ ref: z.string() }),
      })
      .parse(
        await this.request(
          repo,
          `/pulls/${z.number().int().positive().parse(number)}`,
        ),
      );
    if (!result.html_url.startsWith(`https://github.com/${repo}/pull/`))
      throw new Error('Unexpected GitHub PR URL');
    if (expectedSha && result.head.sha !== expectedSha)
      throw new Error('Pull request head changed after verification');
    if (expectedBase && result.base.ref !== expectedBase)
      throw new Error('Pull request base changed after verification');
    return {
      number: result.number,
      state: result.merged ? ('merged' as const) : result.state,
      url: result.html_url,
    };
  }
}
