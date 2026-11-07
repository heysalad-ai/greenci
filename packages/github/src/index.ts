import { z } from 'zod';
import {
  assertPushBranch,
  inspectFiles,
  rulesSchema,
  safePath,
  allPassed,
  checkSchema,
} from '@greenci/core';
export const repoSchema = z.string().regex(/^[\w.-]+\/[\w.-]+$/);
export const gitCheckSchema = checkSchema.extend({
  sha: z.string(),
  log: z.string(),
});
export const patchSchema = z.object({
  path: z.string(),
  content: z.string().max(100_000),
});
export const diffSchema = z.object({
  diff: z.string(),
  files: z.array(z.string()),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});
export const prSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(['open', 'merged', 'closed']),
  url: z.string(),
});
export type Patch = z.infer<typeof patchSchema>;
export interface GitHubClient {
  permission(
    repo: string,
    login: string,
  ): Promise<'read' | 'write' | 'admin' | 'none'>;
  comment(repo: string, target: string, body: string): Promise<void>;
  compare(
    repo: string,
    base: string,
    head: string,
  ): Promise<z.infer<typeof diffSchema>>;
  repos(): Promise<string[]>;
  checks(repo: string, sha: string): Promise<z.infer<typeof gitCheckSchema>[]>;
  tree(repo: string, sha: string): Promise<string[]>;
  read(repo: string, sha: string, path: string): Promise<string>;
  branch(repo: string, sha: string, branch: string): Promise<string>;
  push(
    repo: string,
    branch: string,
    files: Patch[],
    rules: z.infer<typeof rulesSchema>,
  ): Promise<string>;
  runChecks(
    repo: string,
    sha: string,
  ): Promise<z.infer<typeof gitCheckSchema>[]>;
  openPr(
    repo: string,
    branch: string,
    checks: z.infer<typeof gitCheckSchema>[],
    approved: boolean,
    rules: z.infer<typeof rulesSchema>,
  ): Promise<z.infer<typeof prSchema>>;
  pr(repo: string, number: number): Promise<z.infer<typeof prSchema>>;
}
export class MockGitHubClient implements GitHubClient {
  constructor(
    private base: string,
    private transport: typeof fetch = (input, init) => fetch(input, init),
  ) {}
  private async request(path: string, body?: unknown): Promise<unknown> {
    const res = await this.transport(
      `${this.base}${path}`,
      body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
    );
    if (!res.ok) throw new Error(`GitHub request failed (${res.status})`);
    return res.json();
  }
  private path(repo: string) {
    return `/repos/${repoSchema.parse(repo)}`;
  }
  async permission(repo: string, login: string) {
    return z
      .enum(['read', 'write', 'admin', 'none'])
      .parse(
        (
          (await this.request(
            `${this.path(repo)}/permission?login=${encodeURIComponent(login)}`,
          )) as { permission: unknown }
        ).permission,
      );
  }
  async comment(repo: string, target: string, body: string) {
    await this.request(`${this.path(repo)}/comments`, { target, body });
  }
  async compare(repo: string, base: string, head: string) {
    return diffSchema.parse(
      await this.request(
        `${this.path(repo)}/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`,
      ),
    );
  }
  async repos() {
    return z.array(z.string()).parse(await this.request('/repos'));
  }
  async checks(repo: string, sha: string) {
    return z
      .array(gitCheckSchema)
      .parse(
        await this.request(
          `${this.path(repo)}/checks?ref=${encodeURIComponent(sha)}`,
        ),
      );
  }
  async tree(repo: string, sha: string) {
    return z
      .array(z.string())
      .parse(
        await this.request(
          `${this.path(repo)}/tree?ref=${encodeURIComponent(sha)}`,
        ),
      )
      .filter((path) => {
        try {
          safePath(path);
          return true;
        } catch {
          return false;
        }
      });
  }
  async read(repo: string, sha: string, path: string) {
    return z
      .object({ value: z.string() })
      .parse(
        await this.request(
          `${this.path(repo)}/file?ref=${encodeURIComponent(sha)}&path=${encodeURIComponent(safePath(path))}`,
        ),
      ).value;
  }
  async branch(repo: string, sha: string, branch: string) {
    assertPushBranch(branch);
    return z
      .object({ value: z.string() })
      .parse(await this.request(`${this.path(repo)}/branch`, { sha, branch }))
      .value;
  }
  async push(
    repo: string,
    branch: string,
    files: Patch[],
    rules: z.infer<typeof rulesSchema>,
  ) {
    assertPushBranch(branch);
    const patches = z.array(patchSchema).min(1).parse(files);
    inspectFiles(
      patches.map((f) => f.path),
      rules,
    );
    return z.object({ value: z.string() }).parse(
      await this.request(`${this.path(repo)}/push`, {
        branch,
        files: patches,
      }),
    ).value;
  }
  async runChecks(repo: string, sha: string) {
    return z
      .array(gitCheckSchema)
      .parse(await this.request(`${this.path(repo)}/ci`, { sha }));
  }
  async openPr(
    repo: string,
    branch: string,
    checks: z.infer<typeof gitCheckSchema>[],
    approved: boolean,
    rules: z.infer<typeof rulesSchema>,
  ) {
    assertPushBranch(branch);
    if (!allPassed(checks))
      throw new Error('PR denied: checks have not passed');
    return prSchema.parse(
      await this.request(`${this.path(repo)}/pulls`, {
        branch,
        approved,
        rules,
      }),
    );
  }
  async pr(repo: string, number: number) {
    return prSchema.parse(
      await this.request(
        `${this.path(repo)}/pulls/${z.number().int().positive().parse(number)}`,
      ),
    );
  }
}
export async function signWebhook(
  secret: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(body),
  );
  return (
    'sha256=' +
    Array.from(new Uint8Array(signature), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  );
}
export async function verifyWebhook(
  secret: string,
  body: string,
  signature: string,
): Promise<boolean> {
  if (!/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, (part) =>
    parseInt(part, 16),
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    bytes,
    new TextEncoder().encode(body),
  );
}
