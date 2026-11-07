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

import {
  diagnosisSchema,
  safePath,
  inspectFiles,
  type Run,
} from '@greenci/core';
import { fixtures, type FixtureRepo } from './fixtures.js';
import type { Patch } from '@greenci/github';
export interface AgentContext {
  run: Run;
  logs: string;
  files: Record<string, string>;
}
export interface AgentProvider {
  diagnose(context: AgentContext): Promise<z.infer<typeof diagnosisSchema>>;
  repair(context: AgentContext): Promise<{ files: Patch[]; diff: string }>;
}
export class FakeAgentProvider implements AgentProvider {
  private fixture(repo: string) {
    if (!Object.hasOwn(fixtures, repo))
      throw new Error('No fake fixture for repository');
    return fixtures[repo as FixtureRepo];
  }
  async diagnose(context: AgentContext) {
    const fixture = this.fixture(context.run.repo);
    const outOfScope = context.run.scenario === 'out_of_scope';
    return diagnosisSchema.parse({
      summary: outOfScope ? 'CI credentials need a person' : fixture.summary,
      file: fixture.path,
      line: fixture.line,
      confidence: 'high',
      category: outOfScope ? 'infra' : fixture.category,
      notAProductBug: outOfScope,
      evidence: [context.logs.slice(-2000) || 'Fixture failure reproduced'],
    });
  }
  async repair(context: AgentContext) {
    const fixture = this.fixture(context.run.repo);
    safePath(fixture.path);
    inspectFiles([fixture.path], context.run.rules);
    const content =
      context.run.scenario === 'honest_miss' ? fixture.before : fixture.after;
    return {
      files: [{ path: fixture.path, content }],
      diff: `--- a/${fixture.path}\n+++ b/${fixture.path}\n-${fixture.before.trim()}\n+${content.trim()}\n`,
    };
  }
}
