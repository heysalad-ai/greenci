import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { z } from 'zod';
import { domainWorkflow, applyEvent, type RunEnv } from './domain.js';
const paramsSchema = z.object({
  requiresApproval: z.boolean().default(false),
  runId: z.string().optional(),
});
export class RunWorkflow extends WorkflowEntrypoint<
  RunEnv,
  { requiresApproval?: boolean; runId?: string }
> {
  async run(
    event: WorkflowEvent<{ requiresApproval?: boolean; runId?: string }>,
    step: WorkflowStep,
  ) {
    const params = paramsSchema.parse(event.payload);
    if (params.runId) {
      const id = params.runId;
      try {
        return await domainWorkflow(
          this.env,
          { ...event, payload: { runId: id } },
          step,
        );
      } catch {
        return step.do('Hand failed job back', async () => {
          const run = await applyEvent(
            this.env,
            id,
            { type: 'route_failed' },
            `${id}:job-failed`,
          );
          return {
            id,
            state: run.state,
            error:
              'The job could not complete. Review the run before retrying.',
          };
        });
      }
    }
    let sequence = 0;
    for (const phase of ['diagnose', 'repair', 'verify']) {
      await step.waitForEvent(`Wait for ${phase}`, {
        type: phase,
        timeout: '7 days',
      });
      const order = ++sequence;
      await step.do(`Record ${phase} transport probe`, async () => {
        const at = new Date().toISOString();
        await this.env.DB.prepare(
          'INSERT INTO workflow_probes (id,phase,sequence,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
        )
          .bind(`${event.instanceId}:${phase}`, phase, order, at, at)
          .run();
      });
    }
    if (params.requiresApproval)
      await step.waitForEvent('Wait for approval', {
        type: 'approval',
        timeout: '7 days',
      });
    // Transport smoke only: no diagnosis, diff, verification or PR is claimed.
    return {
      kind: 'scaffold_transport',
      agentExecuted: false,
      approvalsRequired: params.requiresApproval,
    };
  }
}
export { publishRun } from './domain.js';
