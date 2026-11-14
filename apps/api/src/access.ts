import { Buffer } from 'node:buffer';
import { z } from 'zod';

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number().finite(),
  nbf: z.number().finite().optional(),
  email: z.email(),
  sub: z.string().min(1),
});
/** Verify the signed assertion, never a caller-supplied email header. */
export async function verifyBetaAccess(
  token: string,
  settings: { team: string; audience: string; email: string },
  transport: typeof fetch = (input, init) => globalThis.fetch(input, init),
) {
  if (
    !/^[a-z0-9-]+$/.test(settings.team) ||
    !settings.audience ||
    !settings.email ||
    token.length > 16_000
  )
    throw new Error('Private beta Access configuration is incomplete');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid Access assertion');
  const decode = (part: string) =>
    JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown;
  const header = z
    .object({ alg: z.literal('RS256'), kid: z.string().min(1) })
    .parse(decode(parts[0]!));
  const claims = claimsSchema.parse(decode(parts[1]!));
  const issuer = `https://${settings.team}.cloudflareaccess.com`,
    now = Date.now() / 1000;
  if (claims.iss !== issuer)
    throw new Error('Access identity not admitted: Access issuer mismatch');
  if (![claims.aud].flat().includes(settings.audience))
    throw new Error('Access identity not admitted: Access audience mismatch');
  if (claims.exp <= now || (claims.nbf !== undefined && claims.nbf > now + 30))
    throw new Error(
      'Access identity not admitted: Access assertion expired or not yet valid',
    );
  if (claims.email.toLowerCase() !== settings.email.toLowerCase())
    throw new Error('Access identity not admitted: Access owner mismatch');
  const response = await transport(`${issuer}/cdn-cgi/access/certs`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Access signing keys unavailable');
  const keys = z
    .object({
      keys: z.array(
        z.object({
          kid: z.string(),
          kty: z.literal('RSA'),
          n: z.string(),
          e: z.string(),
          alg: z.string().optional(),
          use: z.string().optional(),
        }),
      ),
    })
    .parse(await response.json());
  const jwk = keys.keys.find((key) => key.kid === header.kid);
  if (
    !jwk ||
    (jwk.alg && jwk.alg !== 'RS256') ||
    (jwk.use && jwk.use !== 'sig')
  )
    throw new Error('Unknown Access signing key');
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    Buffer.from(parts[2]!, 'base64url'),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new Error('Invalid Access signature');
  return claims;
}
