import { expect, it } from 'vitest';
import { GitHubInviteClient } from '../packages/github/src/invite.js';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { fileURLToPath } from 'node:url';

it('exchanges and reads identity with the default transport in Workers', async () => {
  const entry = fileURLToPath(
    new URL('../packages/github/src/invite.ts', import.meta.url),
  );
  const bundle = await build({
    stdin: {
      contents: `import {GitHubInviteClient} from ${JSON.stringify(entry)};
        export default {async fetch() {
          const client = new GitHubInviteClient({GITHUB_CLIENT_ID:'fixture',GITHUB_CLIENT_SECRET:'fixture',WEB_URL:'https://app.example'});
          const result = await client.exchange('fixture-code','fixture-verifier');
          const identity = await client.get('/user',result.access_token);
          return Response.json({login:identity.login});
        }}`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
  });
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-11-06',
      script: bundle.outputFiles[0]!.text,
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (
          url.hostname === 'github.com' &&
          url.pathname === '/login/oauth/access_token'
        )
          return Response.json({ access_token: 'fixture-only' });
        if (url.hostname === 'api.github.com' && url.pathname === '/user')
          return Response.json({ login: 'fixture-user' });
        throw new Error('Unexpected outbound request');
      },
    }),
  );
  try {
    const response = await runtime.dispatchFetch('https://worker/');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ login: 'fixture-user' });
  } finally {
    await runtime.dispose();
  }
});

it.each([
  ['incorrect_client_credentials', 'incorrect_client_credentials'],
  ['bad_verification_code', 'bad_verification_code'],
  ['redirect_uri_mismatch', 'redirect_uri_mismatch'],
  ['provider-controlled-sensitive-string', 'invalid_response'],
])(
  'classifies token exchange error %s without retaining raw data',
  async (error, reason) => {
    const client = new GitHubInviteClient(
      {
        GITHUB_CLIENT_ID: 'fixture',
        GITHUB_CLIENT_SECRET: 'fixture',
        WEB_URL: 'https://app.example',
      },
      async () =>
        Response.json({
          error,
          error_description: 'fixture-sensitive-description',
          access_token: 'fixture-sensitive-token',
        }),
    );
    const rejected = await client
      .exchange('fixture-code', 'fixture-verifier')
      .catch((failure: unknown) => failure);
    expect(rejected).toMatchObject({ reason });
    expect(String(rejected)).not.toContain('fixture-sensitive');
    expect(JSON.stringify(rejected)).not.toContain('fixture-sensitive');
  },
);
