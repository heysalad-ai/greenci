import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assertPushBranch } from '../packages/core/src/index.js';
const exec = promisify(execFile);
const spec = z.object({
  mode: z.enum(['create', 'update']).default('create'),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  base: z.string().regex(/^[\w./-]+$/),
  baseSha: z.string().regex(/^[a-f0-9]{40}$/),
  branch: z.string().regex(/^greenci\/[\w.-]+$/),
  title: z.string().min(1).max(180),
  directory: z.string().min(1),
  approvedSourcePaths: z.array(z.string()).max(8).default([]),
  files: z
    .array(
      z.object({
        path: z.string(),
        beforeSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
      }),
    )
    .min(1)
    .max(12),
});
export function safeRepairPath(
  path: string,
  approvedSourcePaths: string[] = [],
) {
  if (
    /^(?:(?:frontend|workers|sally-api|shopping-agent)\/)?package(?:-lock)?\.json$/.test(
      path,
    )
  )
    return true;
  if (!approvedSourcePaths.includes(path)) return false;
  if (
    /(?:^|\/)(?:auth|session|secret|credential|token|migration|node_modules|dist)[^/]*(?:\/|\.|$)/i.test(
      path,
    ) ||
    path.includes('..')
  )
    return false;
  return /^(?:src\/[\w/-]+\.tsx?|tests\/[\w/-]+\.(?:test|spec)\.(?:mjs|js|ts|tsx))$/.test(
    path,
  );
}
async function gh(args: string[], input?: unknown): Promise<unknown> {
  // Exec stdin is used for structured bodies, never command interpolation.
  if (input !== undefined) {
    const { spawn } = await import('node:child_process');
    return new Promise((done, reject) => {
      const child = spawn('gh', [...args, '--input', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (b) => {
        output += String(b);
      });
      child.stderr.resume();
      child.on('error', () => reject(new Error('GitHub request unavailable')));
      child.on('close', (code) => {
        if (code !== 0) return reject(new Error('GitHub request rejected'));
        try {
          done(JSON.parse(output) as unknown);
        } catch {
          reject(new Error('Invalid GitHub response'));
        }
      });
      child.stdin.end(JSON.stringify(input));
    });
  }
  const { stdout } = await exec('gh', args, {
    timeout: 45000,
    maxBuffer: 8000000,
  });
  return JSON.parse(stdout) as unknown;
}
export async function publish(input: unknown) {
  const plan = spec.parse(input);
  assertPushBranch(plan.branch);
  if (plan.mode === 'update' && plan.base !== plan.branch)
    throw new Error('Only the existing repair branch may be updated');
  const root = resolve(plan.directory);
  const repo = plan.repo;
  const latest = z
    .object({ object: z.object({ sha: z.string() }) })
    .parse(await gh(['api', `repos/${repo}/git/ref/heads/${plan.base}`]));
  if (latest.object.sha !== plan.baseSha)
    throw new Error('Base moved; rebase and verify before publishing');
  const parent = z
    .object({ tree: z.object({ sha: z.string() }) })
    .parse(await gh(['api', `repos/${repo}/git/commits/${plan.baseSha}`]));
  // Check every source hash before creating any GitHub object or branch.
  const changes = await Promise.all(
    plan.files.map(async (f) => {
      if (!safeRepairPath(f.path, plan.approvedSourcePaths))
        throw new Error('Repair path is outside dependency scope');
      const file = resolve(root, f.path),
        rel = relative(root, file);
      if (isAbsolute(rel) || rel.startsWith('..'))
        throw new Error('Repair path escaped workspace');
      if (f.beforeSha256 === null) {
        const tree = z
          .object({
            truncated: z.literal(false),
            tree: z.array(z.object({ path: z.string() })),
          })
          .parse(
            await gh([
              'api',
              `repos/${repo}/git/trees/${parent.tree.sha}?recursive=1`,
            ]),
          );
        if (
          !f.path.startsWith('tests/') ||
          !plan.approvedSourcePaths.includes(f.path) ||
          tree.tree.some((e) => e.path === f.path)
        )
          throw new Error('Expected new regression test');
      } else {
        const old = z
          .object({ encoding: z.literal('base64'), content: z.string() })
          .parse(
            await gh([
              'api',
              `repos/${repo}/contents/${f.path}?ref=${plan.baseSha}`,
            ]),
          );
        if (
          createHash('sha256')
            .update(Buffer.from(old.content, 'base64'))
            .digest('hex') !== f.beforeSha256
        )
          throw new Error('Source hash mismatch');
      }
      const content = await readFile(file, 'utf8');
      if (f.path.endsWith('.json')) JSON.parse(content);
      if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/.test(content))
        throw new Error('Potential credential in repair file');
      if (Buffer.byteLength(content) > 4000000)
        throw new Error('Repair file too large');
      return { path: f.path, mode: '100644', type: 'blob', content };
    }),
  );
  const tree = z.object({ sha: z.string() }).parse(
    await gh(['api', '--method', 'POST', `repos/${repo}/git/trees`], {
      base_tree: parent.tree.sha,
      tree: changes,
    }),
  );
  const commit = z.object({ sha: z.string() }).parse(
    await gh(['api', '--method', 'POST', `repos/${repo}/git/commits`], {
      message: plan.title,
      tree: tree.sha,
      parents: [plan.baseSha],
    }),
  );
  if (plan.mode === 'update') {
    await gh(
      [
        'api',
        '--method',
        'PATCH',
        `repos/${repo}/git/refs/heads/${plan.branch}`,
      ],
      { sha: commit.sha, force: false },
    );
  } else {
    await gh(['api', '--method', 'POST', `repos/${repo}/git/refs`], {
      ref: `refs/heads/${plan.branch}`,
      sha: commit.sha,
    });
  }
  return {
    repo,
    base: plan.base,
    baseSha: plan.baseSha,
    branch: plan.branch,
    headSha: commit.sha,
  };
}
// This publishes a review branch only. Draft PR creation is a separate explicit operation.
if (process.argv[1]?.endsWith('publish-repair.mts')) {
  console.log(
    JSON.stringify(
      await publish(JSON.parse(await readFile(process.argv[2] ?? '', 'utf8'))),
    ),
  );
}
