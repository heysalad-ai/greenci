#!/usr/bin/env node
import { createCliClient } from './index.js';
import { copy, type Action } from '@greenci/core';
const [command = 'status', repo] = process.argv.slice(2);
const base = new URL(process.env.API_URL ?? 'http://localhost:8787');
let token = process.env.GREENCI_TOKEN;
try {
  if (!token) {
    if (!['localhost', '127.0.0.1'].includes(base.hostname))
      throw new Error(copy.api.signIn);
    const response = await fetch(new URL('/__local/session', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: repo?.startsWith('greenci/') ? 'greenci' : 'acme',
      }),
    });
    if (!response.ok) throw new Error(copy.api.signIn);
    const session = (await response.json()) as { token: unknown };
    if (typeof session.token !== 'string') throw new Error(copy.api.signIn);
    token = session.token;
  }
  const client = createCliClient({ baseUrl: new URL('/v1', base).href, token });
  if (command === 'login') {
    console.log(copy.cli.signedIn);
    console.log(copy.cli.nextStatus);
  } else if (command === 'status') {
    const runs = await client.runs();
    if (!runs.length) console.log(copy.empty);
    for (const run of runs)
      console.log(
        `${copy.runStateLabels[run.state]} ${run.repo} ${run.id}`.slice(0, 79),
      );
    console.log(copy.cli.nextDiagnose);
  } else if (['diagnose', 'repair', 'verify', 'approve'].includes(command)) {
    const runs = await client.runs(),
      run = runs.find(
        (run) =>
          (!repo || run.repo === repo) &&
          (command === 'diagnose'
            ? run.state === 'failing'
            : command === 'repair'
              ? ['diagnosed', 'not_verified'].includes(run.state)
              : command === 'verify'
                ? run.state === 'repaired' && !run.verified
                : run.state === 'needs_you'),
      );
    if (!run) throw new Error(copy.commentUnavailable);
    await client.action(run.id, command as Action, run.revision);
    console.log(copy.commentQueued);
    console.log(copy.cli.nextStatus);
  } else throw new Error(copy.cli.commands);
} catch (error) {
  console.error(error instanceof Error ? error.message : copy.unavailable);
  console.error(copy.cli.nextStatus);
  process.exitCode = 1;
}
