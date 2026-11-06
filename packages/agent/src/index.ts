import { z } from 'zod';
export const sandboxResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
});
export interface Sandbox {
  run(
    cmd: string,
    options: { timeoutMs: number },
  ): Promise<z.infer<typeof sandboxResultSchema>>;
}
/** No host shell is exposed by the M0.5 scaffold. M7 adds the allowlisted executor. */
export class DisabledSandbox implements Sandbox {
  async run(
    _cmd: string,
    _options: { timeoutMs: number },
  ): Promise<z.infer<typeof sandboxResultSchema>> {
    void _cmd;
    void _options;
    throw new Error('Sandbox command execution is not implemented in M0.5');
  }
}
