import type { D1Database } from '@cloudflare/workers-types';
import { z } from 'zod';
import { runSchema, type Run, type Effect } from '@greenci/core';
const rowSchema = z.object({ snapshot: z.string(), version: z.number() });
export class RunRepository {
  constructor(private db: D1Database) {}
  async get(
    id: string,
    orgId?: string,
  ): Promise<{ run: Run; version: number }> {
    const row = await this.db
      .prepare('SELECT snapshot,version FROM runs WHERE id=?')
      .bind(id)
      .first();
    if (!row) throw new Error('Run not found');
    const parsed = rowSchema.parse(row),
      run = runSchema.parse({
        ...JSON.parse(parsed.snapshot),
        revision: parsed.version,
      });
    if (orgId && run.orgId !== orgId) throw new Error('Run not found');
    return { run, version: parsed.version };
  }
  async list(orgId: string) {
    const rows = await this.db
      .prepare(
        'SELECT snapshot,version FROM runs WHERE org_id=? ORDER BY created_at DESC LIMIT 100',
      )
      .bind(orgId)
      .all();
    return rows.results.map((row) =>
      runSchema.parse(JSON.parse(rowSchema.parse(row).snapshot)),
    );
  }
  async create(input: Run) {
    const run = runSchema.parse(input),
      at = new Date().toISOString();
    await this.db
      .prepare(
        'INSERT OR IGNORE INTO runs (id,repo_id,org_id,head_sha,branch,failing_check_name,state,attempts,started_by,snapshot,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)',
      )
      .bind(
        run.id,
        run.repo,
        run.orgId,
        run.headSha,
        run.branch,
        run.failingCheckName,
        run.state,
        run.attempts,
        run.startedBy,
        JSON.stringify(run),
        at,
        at,
      )
      .run();
    return this.get(run.id);
  }
  async save(
    run: Run,
    version: number,
    eventId: string,
    type: string,
    effects: Effect[] = [],
  ) {
    const at = new Date().toISOString();
    runSchema.parse(run);
    const existing = await this.db
      .prepare('SELECT id FROM run_events WHERE id=? AND run_id=?')
      .bind(eventId, run.id)
      .first();
    if (existing) return;
    const result = await this.db.batch([
      this.db
        .prepare(
          'UPDATE runs SET state=?,attempts=?,fix_branch=?,pr_number=?,cause_summary=?,cause_file=?,cause_line=?,confidence=?,trace_id=?,snapshot=?,version=version+1,updated_at=? WHERE id=? AND version=?',
        )
        .bind(
          run.state,
          run.attempts,
          run.fixBranch ?? null,
          run.prNumber ?? null,
          run.diagnosis?.summary ?? null,
          run.diagnosis?.file ?? null,
          run.diagnosis?.line ?? null,
          run.diagnosis?.confidence ?? null,
          run.traceId ?? null,
          JSON.stringify(run),
          at,
          run.id,
          version,
        ),
      this.db
        .prepare(
          'INSERT INTO run_events (id,run_id,type,payload,at,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1',
        )
        .bind(
          eventId,
          run.id,
          type,
          JSON.stringify({ run, effects }),
          at,
          at,
          at,
        ),
    ]);
    if (result[0]?.meta.changes !== 1)
      throw new Error('Run changed concurrently');
  }
  async events(id: string) {
    const result = await this.db
      .prepare(
        'SELECT id,type,payload,at FROM run_events WHERE run_id=? ORDER BY rowid',
      )
      .bind(id)
      .all();
    return result.results
      .map((row) =>
        z
          .object({
            id: z.string(),
            type: z.string(),
            payload: z.string(),
            at: z.string(),
          })
          .parse(row),
      )
      .map((row) => ({
        ...row,
        payload: z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(row.payload)),
      }));
  }
  async rules(repo: string) {
    return this.db
      .prepare('SELECT * FROM repo_rules WHERE repo_id=?')
      .bind(repo)
      .first();
  }
}
