import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { expect, it, vi } from 'vitest';
import { verifyBetaAccess } from '../apps/api/src/access.js';
import ingress from '../apps/webhooks/src/index.js';
import { SdkAgentProvider } from '../packages/agent/src/sdk.js';
import { loadConfig, runSchema } from '../packages/core/src/index.js';

const settings = {
  team: 'fixture',
  audience: 'private-web',
  email: 'owner@example.com',
};
const keys = await crypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
);
const jwk = {
  ...(await crypto.subtle.exportKey('jwk', keys.publicKey)),
  kid: 'fixture-signing-key',
};
const sign = async (changes: Record<string, unknown> = {}) => {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', kid: jwk.kid })}.${encode({ iss: 'https://fixture.cloudflareaccess.com', aud: ['private-web'], exp: Date.now() / 1000 + 60, email: settings.email, sub: 'fixture-owner', ...changes })}`;
  return `${unsigned}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(unsigned))).toString('base64url')}`;
};
const fetchKeys = vi.fn(async () => Response.json({ keys: [jwk] }));
it('accepts only a signed Access identity for the configured app and beta owner', async () => {
  expect((await verifyBetaAccess(await sign(), settings, fetchKeys)).sub).toBe(
    'fixture-owner',
  );
  expect(fetchKeys).toHaveBeenCalledWith(
    'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs',
    expect.objectContaining({ redirect: 'manual' }),
  );
});
it('rejects forged signatures, other audiences/users/issuers, expiry and future tokens', async () => {
  for (const changes of [
    { aud: ['another-app'] },
    { email: 'other@example.com' },
    { iss: 'https://evil.example' },
    { exp: 0 },
    { nbf: Date.now() / 1000 + 3600 },
  ]) {
    await expect(
      verifyBetaAccess(await sign(changes), settings, fetchKeys),
    ).rejects.toThrow('not admitted');
  }
  const parts = (await sign()).split('.');
  parts[2] = Buffer.alloc(256).toString('base64url');
  await expect(
    verifyBetaAccess(parts.join('.'), settings, fetchKeys),
  ).rejects.toThrow('signature');
  await expect(
    verifyBetaAccess(
      await sign(),
      { ...settings, team: 'evil.example/' },
      fetchKeys,
    ),
  ).rejects.toThrow('configuration');
});
it('exposes only signed-delivery ingress and never forwards browser/session credentials', async () => {
  const fetch = vi.fn(async (request: Request) => {
    expect(request.url).toBe('https://api/webhooks/github');
    expect(request.headers.get('Cookie')).toBeNull();
    expect(request.headers.get('Authorization')).toBeNull();
    expect(request.headers.get('X-Hub-Signature-256')).toBe(
      'fixture-signature',
    );
    return Response.json({ accepted: true }, { status: 202 });
  });
  const env = { API: { fetch } };
  expect(
    (await ingress.fetch(new Request('https://ingress/v1/runs'), env)).status,
  ).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
  const response = await ingress.fetch(
    new Request('https://ingress/webhooks/github', {
      method: 'POST',
      body: '{}',
      headers: {
        Cookie: 'private-cookie',
        Authorization: 'Bearer private-token',
        'X-Hub-Signature-256': 'fixture-signature',
      },
    }),
    env,
  );
  expect(response.status).toBe(202);
  expect(fetch).toHaveBeenCalledOnce();
});
it('does not call a Cyber model when required access has not been confirmed', async () => {
  const outbound = vi.fn(async () => {
    throw new Error('Unexpected network in offline test');
  });
  vi.stubGlobal('fetch', outbound);
  try {
    const provider = new SdkAgentProvider(
      loadConfig({
        AGENT_PROVIDER: 'openai',
        OPENAI_API_KEY: 'fixture-key',
        OPENAI_AGENT_MODEL: 'gpt-6-cyber',
      }),
    );
    await expect(
      provider.diagnose({
        run: runSchema.parse({
          id: 'fixture',
          repo: 'acme/payments',
          orgId: 'acme',
          headSha: 'fixture',
          branch: 'main',
          failingCheckName: 'test',
        }),
        logs: 'fixture',
        files: {},
      }),
    ).rejects.toThrow('Cyber model access');
    expect(outbound).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('validates a signed session with the default fetch transport in Workers', async () => {
  const entry = fileURLToPath(
    new URL('../apps/api/src/access.ts', import.meta.url),
  );
  const bundle = await build({
    stdin: {
      contents: `import { verifyBetaAccess } from ${JSON.stringify(entry)}; export default {async fetch(request,env){ try { const identity = await verifyBetaAccess(env.FIXTURE_TOKEN, JSON.parse(env.SETTINGS)); return Response.json({sub: identity.sub}); } catch(error) { return Response.json({error:error.message},{status:401}); } }}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    external: ['node:*', 'cloudflare:*'],
    write: false,
  });
  let redirectKeys = false;
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0]!.text,
      compatibilityDate: '2026-11-06',
      compatibilityFlags: ['nodejs_compat'],
      bindings: {
        FIXTURE_TOKEN: await sign(),
        SETTINGS: JSON.stringify(settings),
      },
      outboundService: async (request: Request) => {
        expect(request.url).toBe(
          'https://fixture.cloudflareaccess.com/cdn-cgi/access/certs',
        );
        return redirectKeys
          ? new Response(null, {
              status: 302,
              headers: { Location: 'https://untrusted.invalid/keys' },
            })
          : Response.json({ keys: [jwk] });
      },
    }),
  );
  try {
    const response = await runtime.dispatchFetch('https://worker/');
    expect(await response.json()).toEqual({ sub: 'fixture-owner' });
    expect(response.status).toBe(200);
    redirectKeys = true;
    const rejected = await runtime.dispatchFetch('https://worker/');
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({
      error: 'Access signing keys unavailable',
    });
  } finally {
    await runtime.dispose();
  }
});

it('verifies an invited Access identity without applying the single-owner email filter', async () => {
  const { team, audience } = settings;
  const identity = await verifyBetaAccess(
    await sign({ email: 'outside@example.com' }),
    { team, audience },
    fetchKeys,
  );
  expect(identity.email).toBe('outside@example.com');
  await expect(
    verifyBetaAccess(
      await sign({ aud: ['other'] }),
      { team, audience },
      fetchKeys,
    ),
  ).rejects.toThrow('audience mismatch');
});
