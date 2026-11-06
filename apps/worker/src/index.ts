import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { z } from 'zod';
const paramsSchema = z.object({ requiresApproval: z.boolean().default(false) });
export class RunWorkflow extends WorkflowEntrypoint<
  { DB: D1Database },
  { requiresApproval: boolean }
> {
  async run(
    event: WorkflowEvent<{ requiresApproval: boolean }>,
    step: WorkflowStep,
  ) {
    const params = paramsSchema.parse(event.payload);
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
