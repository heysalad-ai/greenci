import { z } from 'zod';
const repository = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const auditRepairSchema = z
  .object({
    id: z
      .string()
      .regex(/^[\w-]+$/)
      .max(100),
    repo: repository,
    title: z.string().min(1).max(180),
    summary: z.string().max(2000),
    stage: z.enum(['diagnosed', 'repairing', 'draft', 'blocked']),
    local: z.enum(['passed', 'failed', 'not_run']),
    ci: z.enum([
      'passed',
      'failed',
      'pending',
      'not_run',
      'unknown',
      'blocked',
    ]),
    baseSha: sha,
    headSha: sha.nullable(),
    branch: z
      .string()
      .regex(/^greenci\/[\w./-]+$/)
      .nullable(),
    pr: z
      .object({
        number: z.number().int().positive(),
        url: z.url(),
        draft: z.literal(true),
      })
      .nullable(),
    evidence: z.array(z.string().max(1000)).max(30),
    remaining: z.array(z.string().max(1000)).max(30),
    updatedAt: z.iso.datetime(),
  })
  .superRefine((r, ctx) => {
    if (r.pr && r.pr.url !== `https://github.com/${r.repo}/pull/${r.pr.number}`)
      ctx.addIssue({ code: 'custom', message: 'PR repository mismatch' });
    if (r.stage === 'draft' && (!r.pr || !r.headSha || !r.branch))
      ctx.addIssue({ code: 'custom', message: 'Draft evidence required' });
  });
export const auditDashboardSchema = z
  .object({
    version: z.literal(1),
    org: z.string().regex(/^[\w.-]+$/),
    observedAt: z.iso.datetime(),
    repositories: z
      .array(
        z.object({
          repo: repository,
          private: z.boolean(),
          fork: z.boolean(),
          archived: z.boolean(),
          sha: sha.nullable(),
          ci: z.enum([
            'SUCCESS',
            'FAILURE',
            'ERROR',
            'PENDING',
            'EXPECTED',
            'no-checks',
            'empty',
            'unknown',
          ]),
          alerts: z.number().int().nonnegative().nullable(),
          findings: z
            .array(
              z.object({
                rule: z.string().max(100),
                level: z.enum(['high', 'medium', 'low']),
                path: z.string().max(300).optional(),
                line: z.number().int().positive().optional(),
              }),
            )
            .max(2000),
          gaps: z.array(z.string().max(300)).max(100),
        }),
      )
      .max(2000),
    repairs: z.array(auditRepairSchema).max(200),
  })
  .superRefine((data, ctx) => {
    const repos = new Set(data.repositories.map((r) => r.repo));
    if (repos.size !== data.repositories.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate repository' });
    if (
      data.repositories.some((r) => r.repo.split('/')[0] !== data.org) ||
      data.repairs.some((r) => !repos.has(r.repo))
    )
      ctx.addIssue({ code: 'custom', message: 'Organisation mismatch' });
    if (new Set(data.repairs.map((r) => r.id)).size !== data.repairs.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate repair' });
  });
export type AuditDashboard = z.infer<typeof auditDashboardSchema>;
export type AuditRepair = z.infer<typeof auditRepairSchema>;
