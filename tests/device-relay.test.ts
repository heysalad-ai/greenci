import { build } from 'esbuild';
import { createHmac, createHash } from 'node:crypto';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { expect, it } from 'vitest';
import gateway from '../apps/device-gateway/src/index.js';

it('keeps operator routes out of the public device gateway', async () => {
  let calls = 0;
  const service = {
    fetch: async () => {
      calls++;
      return new Response(null, { status: 401 });
    },
  } as unknown as Fetcher;
  for (const path of [
    '/operator/status',
    '/operator/command',
    '/device/../operator/status',
    '/device/image/nope',
  ]) {
    expect(
      (
        await gateway.fetch(new Request(`https://gateway${path}`), {
          DEVICE_SERVICE: service,
        })
      ).status,
    ).toBe(404);
  }
  expect(calls).toBe(0);
  expect(
    (
      await gateway.fetch(
        new Request('https://gateway/device/poll', {
          method: 'POST',
          body: '{}',
        }),
        { DEVICE_SERVICE: service },
      )
    ).status,
  ).toBe(401);
});

it('authenticates the real Workers relay, bounds releases and signs expiring commands', async () => {
  const bundle = await build({
    entryPoints: ['apps/device-relay/src/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    external: ['cloudflare:*'],
    write: false,
  });
  const key = 'a'.repeat(64);
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0]!.text,
      compatibilityDate: '2026-11-06',
      durableObjects: { DEVICE: { className: 'GreenPad', useSQLite: true } },
      r2Buckets: ['ARTIFACTS'],
      bindings: { DEVICE_TOKEN: key },
    }),
  );
  const status = {
    firmware: 'greenci-pad-0.3.0',
    slot: 'ota_0',
    ack: 0,
    result: 'boot',
    led1: 0,
    led4: 0,
    healthy: true,
  };
  const poll = (auth = `Bearer ${key}`, body = status) =>
    runtime.dispatchFetch('https://machine/device/poll', {
      method: 'POST',
      headers: { Authorization: auth },
      body: JSON.stringify(body),
    });
  const command = (body: unknown) =>
    runtime.dispatchFetch('https://device.internal/operator/command', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  try {
    expect((await poll('')).status).toBe(401);
    expect((await poll('Bearer wrong')).status).toBe(401);
    expect(
      (await runtime.dispatchFetch('https://public/operator/status')).status,
    ).toBe(404);
    for (const body of [
      { op: 'mic' },
      { op: 'led1', value: 100 },
      { op: 'shell', value: 'rm' },
    ])
      expect((await command(body)).status).toBe(400);
    expect((await command({ op: 'ota', sha: 'b'.repeat(64) })).status).toBe(
      404,
    );
    expect(await (await poll()).json()).toEqual({ idle: true });
    expect((await command({ op: 'led1', value: 1 })).status).toBe(202);
    const signed = (await (await poll()).json()) as {
      seq: number;
      op: string;
      value: number;
      sha: string;
      size: number;
      version: string;
      expires: number;
      mac: string;
    };
    expect(signed.seq).toBe(1);
    expect(signed.expires).toBeGreaterThan(Date.now() / 1000);
    expect(signed.mac).toBe(
      createHmac('sha256', key)
        .update(
          [
            signed.seq,
            signed.op,
            signed.value,
            signed.sha,
            signed.size,
            signed.version,
            signed.expires,
          ].join('\n'),
        )
        .digest('hex'),
    );
    expect(await (await poll(undefined, { ...status, ack: 1 })).json()).toEqual(
      { idle: true },
    );
    const image = new Uint8Array(512);
    image[0] = 0xe9;
    image[12] = 9;
    const upload = (data: Uint8Array) =>
      runtime.dispatchFetch(
        'https://device.internal/operator/release?version=greenci-pad-0.3.1',
        {
          method: 'POST',
          headers: { 'Content-Length': String(data.length) },
          body: data,
        },
      );
    expect((await upload(new Uint8Array(512))).status).toBe(400);
    const release = (await (await upload(image)).json()) as { sha: string };
    expect(release.sha).toBe(createHash('sha256').update(image).digest('hex'));
    expect(
      (
        await runtime.dispatchFetch(
          `https://machine/device/image/${release.sha}`,
        )
      ).status,
    ).toBe(401);
    const download = await runtime.dispatchFetch(
      `https://machine/device/image/${release.sha}`,
      { headers: { Authorization: `Bearer ${key}` } },
    );
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(image);
    expect((await command({ op: 'ota', sha: release.sha })).status).toBe(202);
  } finally {
    await runtime.dispose();
  }
}, 30000);
