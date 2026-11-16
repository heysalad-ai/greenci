/* global Response */
export function phaseFor(run, snapshot) {
  if (run.state === 'pr_open')
    return snapshot.verified === true && Number(run.pr_number) > 0 ? 4 : 5;
  if (['failing', 'diagnosing', 'diagnosed'].includes(run.state)) return 1;
  if (['repairing', 'repaired'].includes(run.state)) return 2;
  if (run.state === 'verifying') return 3;
  return 5;
}
const org = 'invite-7957943',
  repo = 'heysalad-ai/greenci-starter';
const runPattern = /^dashboard-invite-7957943-[a-f0-9-]{36}$/;
let mirrored = { id: '', phase: 0, at: 0 };
async function relay(env, path, init) {
  return env.DEVICE_SERVICE.fetch(
    'https://device.internal/operator/' + path,
    init,
  );
}
const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
async function loadRun(env, id) {
  if (!runPattern.test(id)) return null;
  return env.DB.prepare(
    'SELECT id,state,snapshot,pr_number,trace_id FROM runs WHERE id=? AND org_id=? AND repo_id=?',
  )
    .bind(id, org, repo)
    .first();
}
export default {
  async fetch(request, env) {
    try {
      const u = new URL(request.url);
      if (u.pathname === '/status' && request.method === 'GET') {
        return Response.json({
          openaiConfigured: !!env.OPENAI_API_KEY,
          device: await (await relay(env, 'status')).json(),
        });
      }
      if (u.pathname === '/latest' && request.method === 'GET') {
        return Response.json(
          await env.DB.prepare(
            'SELECT id,state,pr_number,trace_id FROM runs WHERE org_id=? AND repo_id=? ORDER BY rowid DESC LIMIT 1',
          )
            .bind(org, repo)
            .first(),
        );
      }
      if (u.pathname === '/mirror' && request.method === 'POST') {
        const body = await request.json();
        const row = await loadRun(env, body.runId);
        if (!row) return new Response(null, { status: 404 });
        const phase = phaseFor(row, JSON.parse(row.snapshot));
        let queued = null;
        if (
          mirrored.id !== row.id ||
          mirrored.phase !== phase ||
          Date.now() - mirrored.at > 12000
        ) {
          const r = await relay(
            env,
            'command',
            json({ op: 'run', value: phase }),
          );
          if (!r.ok)
            return new Response('Device mirror rejected', { status: 502 });
          queued = await r.json();
          mirrored = { id: row.id, phase, at: Date.now() };
        }
        return Response.json({
          id: row.id,
          state: row.state,
          phase,
          pr: row.pr_number,
          trace: row.trace_id,
          queued,
        });
      }
      if (u.pathname === '/idle' && request.method === 'POST')
        return relay(env, 'command', json({ op: 'run', value: 0 }));
      if (u.pathname === '/release' && request.method === 'POST') {
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength < 256 || bytes.byteLength > 0x1e0000)
          return new Response(null, { status: 400 });
        return relay(env, 'release?version=greenci-pad-0.5.0', {
          method: 'POST',
          headers: { 'Content-Length': String(bytes.byteLength) },
          body: bytes,
        });
      }
      if (u.pathname === '/install' && request.method === 'POST') {
        const body = await request.json();
        if (!/^[a-f0-9]{64}$/.test(body.sha))
          return new Response(null, { status: 400 });
        return relay(env, 'command', json({ op: 'ota', sha: body.sha }));
      }
      if (u.pathname === '/speech' && request.method === 'POST') {
        const { text } = await request.json();
        if (typeof text !== 'string' || text.length < 20 || text.length > 1800)
          return new Response(null, { status: 400 });
        const r = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + env.OPENAI_API_KEY,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice: 'coral',
            input: text,
            instructions:
              'A clear, warm, confident product-demo walkthrough. Conversational British English. Say GreenCI as Green C I. Brisk but easy to follow, without hype. Natural pauses between steps.',
            response_format: 'mp3',
          }),
        });
        if (!r.ok)
          return Response.json({ speechStatus: r.status }, { status: 502 });
        return new Response(r.body, {
          headers: { 'Content-Type': 'audio/mpeg' },
        });
      }
      return new Response(null, { status: 404 });
    } catch {
      return new Response('Dev helper request failed', { status: 500 });
    }
  },
};
