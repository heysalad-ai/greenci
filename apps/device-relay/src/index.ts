import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

interface Env {
  DEVICE: DurableObjectNamespace<GreenPad>;
  ARTIFACTS: R2Bucket;
  DEVICE_TOKEN: string;
}
const maxImage = 0x1e0000;
const command = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('led1'),
      value: z.union([z.literal(0), z.literal(1), z.literal(5), z.literal(20)]),
    })
    .strict(),
  z
    .object({
      op: z.literal('led4'),
      value: z.union([z.literal(0), z.literal(1), z.literal(5), z.literal(20)]),
    })
    .strict(),
  z.object({ op: z.enum(['home', 'reboot']) }).strict(),
  z
    .object({ op: z.literal('ota'), sha: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict(),
]);
const telemetry = z
  .object({
    firmware: z.string().regex(/^greenci-pad-\d+\.\d+\.\d+$/),
    slot: z.enum(['ota_0', 'ota_1']),
    ack: z.number().int().nonnegative(),
    result: z.string().max(48),
    led1: z.number().int().min(0).max(20),
    led4: z.number().int().min(0).max(20),
    healthy: z.boolean(),
  })
  .strict();
const hex = (a: ArrayBuffer) =>
  Array.from(new Uint8Array(a), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
export const canonical = (c: Pending) =>
  [c.seq, c.op, c.value, c.sha, c.size, c.version, c.expires].join('\n');
interface Pending {
  seq: number;
  op: string;
  value: number;
  sha: string;
  size: number;
  version: string;
  expires: number;
}
interface Release {
  sha: string;
  size: number;
  version: string;
}
async function authorized(request: Request, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const digest = (s: string) =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([
    digest(request.headers.get('Authorization') ?? ''),
    digest(`Bearer ${token}`),
  ]);
  const av = new Uint8Array(a),
    bv = new Uint8Array(b);
  return av.reduce((diff, v, i) => diff | (v ^ bv[i]!), 0) === 0;
}
export class GreenPad extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/device/')) {
      if (!(await authorized(request, this.env.DEVICE_TOKEN)))
        return new Response(null, { status: 401 });
      if (url.pathname === '/device/poll' && request.method === 'POST') {
        if (Number(request.headers.get('content-length') ?? 0) > 2048)
          return new Response(null, { status: 413 });
        const parsed = telemetry.safeParse(await request.json());
        if (!parsed.success) return new Response(null, { status: 400 });
        await this.ctx.storage.put('status', {
          ...parsed.data,
          seenAt: Date.now(),
        });
        const pending = await this.ctx.storage.get<Pending>('pending');
        if (
          !pending ||
          pending.seq <= parsed.data.ack ||
          pending.expires < Math.floor(Date.now() / 1000)
        )
          return Response.json({ idle: true });
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(this.env.DEVICE_TOKEN),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
        const mac = hex(
          await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(canonical(pending)),
          ),
        );
        return Response.json({ ...pending, mac });
      }
      const match = /^\/device\/image\/([a-f0-9]{64})$/.exec(url.pathname);
      if (match && request.method === 'GET') {
        const image = await this.env.ARTIFACTS.get(
          `devices/ab8224/${match[1]}`,
        );
        return image
          ? new Response(image.body, {
              headers: {
                'Content-Length': String(image.size),
                'Content-Type': 'application/octet-stream',
                'Cache-Control': 'no-store',
              },
            })
          : new Response(null, { status: 404 });
      }
      return new Response(null, { status: 404 });
    }
    // This Worker has neither workers.dev nor public routes. Operator requests
    // can arrive only through the owner-authenticated API service binding.
    if (url.hostname !== 'device.internal')
      return new Response(null, { status: 404 });
    if (url.pathname === '/operator/status' && request.method === 'GET') {
      const pending = await this.ctx.storage.get<Pending>('pending');
      return Response.json({
        device: 'greenci-ab8224',
        status: (await this.ctx.storage.get('status')) ?? null,
        pending:
          pending && pending.expires >= Math.floor(Date.now() / 1000)
            ? pending
            : null,
      });
    }
    if (url.pathname === '/operator/release' && request.method === 'POST') {
      const version = z
        .string()
        .regex(/^greenci-pad-\d+\.\d+\.\d+$/)
        .safeParse(url.searchParams.get('version'));
      const length = Number(request.headers.get('Content-Length'));
      if (!version.success || !length || length > maxImage)
        return new Response(null, { status: 400 });
      const bytes = await request.arrayBuffer();
      const view = new DataView(bytes);
      if (
        bytes.byteLength !== length ||
        length < 256 ||
        view.getUint8(0) !== 0xe9 ||
        view.getUint16(12, true) !== 9
      )
        return new Response(null, { status: 400 });
      const sha = hex(await crypto.subtle.digest('SHA-256', bytes));
      await this.env.ARTIFACTS.put(`devices/ab8224/${sha}`, bytes);
      const release: Release = { sha, size: length, version: version.data };
      await this.ctx.storage.put(`release:${sha}`, release);
      return Response.json(release, { status: 201 });
    }
    if (url.pathname === '/operator/command' && request.method === 'POST') {
      const parsed = command.safeParse(await request.json());
      if (!parsed.success) return new Response(null, { status: 400 });
      const c = parsed.data;
      const release =
        c.op === 'ota'
          ? await this.ctx.storage.get<Release>(`release:${c.sha}`)
          : undefined;
      if (c.op === 'ota' && !release)
        return new Response(null, { status: 404 });
      const next = await this.ctx.storage.transaction(async (tx) => {
        const seq = ((await tx.get<number>('sequence')) ?? 0) + 1;
        const pending: Pending = {
          seq,
          op: c.op,
          value: 'value' in c ? c.value : 0,
          sha: release?.sha ?? '',
          size: release?.size ?? 0,
          version: release?.version ?? '',
          expires: Math.floor(Date.now() / 1000) + 300,
        };
        await tx.put('sequence', seq);
        await tx.put('pending', pending);
        return pending;
      });
      return Response.json(next, { status: 202 });
    }
    return new Response(null, { status: 404 });
  }
}
export default {
  async fetch(request: Request, env: Env) {
    try {
      return await env.DEVICE.getByName('greenci-ab8224').fetch(request);
    } catch {
      return new Response(null, { status: 400 });
    }
  },
};
