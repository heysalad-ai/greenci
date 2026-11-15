import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import {
  auditDashboardSchema,
  auditRepairSchema,
} from '../packages/core/src/index.js';
const raw = z
  .object({
    observedAt: z.iso.datetime(),
    records: z.array(
      z.object({
        repo: z.object({
          full_name: z.string(),
          private: z.boolean(),
          fork: z.boolean(),
          archived: z.boolean(),
        }),
        sha: z.string().nullable(),
        ci: z.string(),
        alerts: z.object({ totalCount: z.number() }).nullable(),
        findings: z.array(z.unknown()),
        gaps: z.array(z.string()),
      }),
    ),
  })
  .parse(JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')));
const repairs = z
  .array(auditRepairSchema)
  .parse(JSON.parse(await readFile(process.argv[3] ?? '', 'utf8')));
const org = z
  .string()
  .regex(/^[\w.-]+$/)
  .parse(process.argv[5] ?? 'heysalad-ai');
const exec = promisify(execFile);
for (const repair of repairs) {
  if (!repair.pr) continue;
  const [owner, name] = repair.repo.split('/');
  const query = `query { repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}) { pullRequest(number:${repair.pr.number}) { isDraft state headRefOid commits(last:1) { nodes { commit { statusCheckRollup { state contexts(first:100) { nodes { ... on CheckRun { name conclusion databaseId } ... on StatusContext { context state } } } } } } } } } }`;
  const { stdout } = await exec(
    'gh',
    ['api', 'graphql', '-f', `query=${query}`],
    { timeout: 45000, maxBuffer: 3000000 },
  );
  const response = z
    .object({
      data: z.object({
        repository: z.object({
          pullRequest: z.object({
            isDraft: z.literal(true),
            state: z.literal('OPEN'),
            headRefOid: z.string(),
            commits: z.object({
              nodes: z.array(
                z.object({
                  commit: z.object({
                    statusCheckRollup: z
                      .object({
                        state: z.string(),
                        contexts: z.object({
                          nodes: z.array(
                            z.object({
                              databaseId: z.number().optional(),
                              conclusion: z.string().nullable().optional(),
                            }),
                          ),
                        }),
                      })
                      .nullable(),
                  }),
                }),
              ),
            }),
          }),
        }),
      }),
    })
    .parse(JSON.parse(stdout));
  const pr = response.data.repository.pullRequest;
  if (pr.headRefOid !== repair.headSha)
    throw new Error('PR head changed; verify and update repair evidence');
  const rollup = pr.commits.nodes[0]?.commit.statusCheckRollup;
  repair.ci =
    rollup?.state === 'SUCCESS'
      ? 'passed'
      : rollup?.state === 'FAILURE' || rollup?.state === 'ERROR'
        ? 'failed'
        : rollup
          ? 'pending'
          : 'not_run';
  for (const check of rollup?.contexts.nodes ?? []) {
    if (!check.databaseId || check.conclusion !== 'FAILURE') continue;
    const { stdout: body } = await exec(
      'gh',
      [
        'api',
        `repos/${repair.repo}/check-runs/${check.databaseId}/annotations`,
      ],
      { timeout: 45000, maxBuffer: 1000000 },
    );
    const annotations = z
      .array(z.object({ message: z.string() }))
      .parse(JSON.parse(body));
    if (
      annotations.some((a) =>
        a.message.includes(
          'recent account payments have failed or your spending limit needs to be increased',
        ),
      )
    ) {
      repair.ci = 'blocked';
      const note =
        'GitHub did not start the jobs because account billing or spending limits need attention.';
      if (!repair.remaining.includes(note)) repair.remaining.push(note);
    }
  }
  repair.updatedAt = new Date().toISOString();
}
const dashboard = auditDashboardSchema.parse({
  version: 1,
  org,
  observedAt: raw.observedAt,
  repositories: raw.records
    .filter((r) => r.repo.full_name.split('/')[0] === org)
    .map((r) => ({
      repo: r.repo.full_name,
      private: r.repo.private,
      fork: r.repo.fork,
      archived: r.repo.archived,
      sha: r.sha,
      ci: r.ci,
      alerts: r.alerts?.totalCount ?? null,
      findings: r.findings,
      gaps: r.gaps,
    })),
  repairs,
});
await writeFile(process.argv[4] ?? '', JSON.stringify(dashboard), {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    repositories: dashboard.repositories.length,
    repairs: dashboard.repairs.map((r) => ({
      repo: r.repo,
      stage: r.stage,
      ci: r.ci,
      pr: r.pr?.number ?? null,
    })),
  }),
);
