import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { copy, loadConfig } from '@greenci/core';
import { sendLocalEmail } from '@greenci/email';
import type { ApiEnv } from './env.js';
import { digest } from './invite-auth.js';
import { admitPublicSignIn } from './public-admission.js';
import { session } from './session.js';
import { beginAuthorization } from './oauth-start.js';
const cpy = copy.emailAuth;
const emailSchema = z
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());
const cookieOptions = (local: boolean) => ({
  httpOnly: true,
  secure: !local,
  sameSite: 'Lax' as const,
  path: '/',
});
export async function deliverSignInCode(
  env: ApiEnv,
  email: string,
  code: string,
) {
  const cfg = loadConfig(env);
  const message = {
    subject: cpy.subject,
    body: `${cpy.emailIntro}\n\n${code}\n\n${cpy.emailExpiry}`,
  };
  if (cfg.APP_ENV === 'local') {
    await sendLocalEmail(env.DB, message);
    return;
  }
  if (!env.AUTH_EMAIL) throw new Error('Email delivery unavailable');
  await env.AUTH_EMAIL.send({
    from: { email: cfg.EMAIL_AUTH_FROM, name: copy.name },
    to: email,
    subject: message.subject,
    text: message.body,
  });
}
export function emailRoutes(
  options: { deliver?: typeof deliverSignInCode } = {},
) {
  const app = new OpenAPIHono<{ Bindings: ApiEnv }>();
  app.use('/v1/email/*', async (c, next) => {
    const cfg = loadConfig(c.env);
    if (cfg.EMAIL_AUTH_ENABLED !== 'true') return c.notFound();
    c.header('Cache-Control', 'private, no-store');
    c.header('Referrer-Policy', 'no-referrer');
    if (c.req.header('Origin') !== cfg.PUBLIC_BETA_URL)
      return c.json({ error: cpy.failed }, 403);
    await next();
  });
  app.use(
    '/v1/email/*',
    bodyLimit({
      maxSize: 2048,
      onError: (c) => c.json({ error: cpy.failed }, 413),
    }),
  );
  app.post('/v1/email/start', async (c) => {
    const body = z
      .object({ email: emailSchema })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: cpy.invalidEmail }, 400);
    const cfg = loadConfig(c.env),
      email = body.data.email;
    try {
      await admitPublicSignIn(
        c.env,
        c.req.header('X-GreenCI-Client-IP') ??
          (cfg.APP_ENV === 'local' ? 'local' : 'unknown'),
      );
      const rateKey = await digest(
        `email:${Math.floor(Date.now() / 900000)}:${email}`,
      );
      const rate = await c.env.DB.prepare(
        'INSERT INTO public_auth_rate VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts',
      )
        .bind(rateKey, new Date(Date.now() + 3600000).toISOString())
        .first<{ attempts: number }>();
      if (!rate || rate.attempts > 3) return c.json({ error: cpy.rate }, 429);
    } catch {
      return c.json({ error: cpy.rate }, 429);
    }
    const id = crypto.randomUUID(),
      browser = crypto.randomUUID();
    // Rejection sampling keeps every eight-digit code equally likely.
    const random = new Uint32Array(1);
    do {
      crypto.getRandomValues(random);
    } while (random[0]! >= 4200000000);
    const code = String(random[0]! % 100000000).padStart(8, '0');
    await c.env.DB.prepare('DELETE FROM email_challenges WHERE expires_at<?')
      .bind(new Date().toISOString())
      .run();
    await c.env.DB.prepare(
      'INSERT INTO email_challenges (id,email,browser_hash,code_hash,expires_at) VALUES (?,?,?,?,?)',
    )
      .bind(
        id,
        email,
        await digest(browser),
        await digest(`${id}:${code}`),
        new Date(Date.now() + 600000).toISOString(),
      )
      .run();
    try {
      await (options.deliver ?? deliverSignInCode)(c.env, email, code);
    } catch {
      await c.env.DB.prepare('UPDATE email_challenges SET used=1 WHERE id=?')
        .bind(id)
        .run();
      return c.json({ error: cpy.unavailable }, 503);
    }
    setCookie(c, 'greenci_email', browser, {
      ...cookieOptions(cfg.APP_ENV === 'local'),
      maxAge: 600,
    });
    // Same response for registration and returning accounts; never disclose the code.
    return c.json({ challenge: id });
  });
  app.post('/v1/email/verify', async (c) => {
    const body = z
      .object({ challenge: z.uuid(), code: z.string().regex(/^\d{8}$/) })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: cpy.failed }, 401);
    const { challenge, code } = body.data;
    const row = await c.env.DB.prepare(
      'UPDATE email_challenges SET attempts=attempts+1 WHERE id=? AND browser_hash=? AND used=0 AND attempts<5 AND expires_at>? RETURNING email',
    )
      .bind(
        challenge,
        await digest(getCookie(c, 'greenci_email') ?? ''),
        new Date().toISOString(),
      )
      .first<{ email: string }>();
    if (!row) return c.json({ error: cpy.failed }, 401);
    const consumed = await c.env.DB.prepare(
      'UPDATE email_challenges SET used=1 WHERE id=? AND used=0 AND attempts<=5 AND code_hash=? AND expires_at>? RETURNING id',
    )
      .bind(
        challenge,
        await digest(`${challenge}:${code}`),
        new Date().toISOString(),
      )
      .first();
    if (!consumed) return c.json({ error: cpy.failed }, 401);
    const at = new Date().toISOString();
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO email_accounts (id,email,created_at) VALUES (?,?,?)',
    )
      .bind(crypto.randomUUID(), row.email, at)
      .run();
    const account = await c.env.DB.prepare(
      'SELECT id,github_user_id,revoked FROM email_accounts WHERE email=?',
    )
      .bind(row.email)
      .first<{ id: string; github_user_id: string | null; revoked: number }>();
    if (!account || account.revoked) return c.json({ error: cpy.failed }, 401);
    const userId = account.github_user_id ?? `email:${account.id}`;
    let orgId = `invite-email-${account.id}`;
    if (account.github_user_id) {
      const member = await c.env.DB.prepare(
        'SELECT org_id FROM memberships WHERE user_id=? AND role=?',
      )
        .bind(userId, 'owner')
        .first<{ org_id: string }>();
      if (!member) return c.json({ error: cpy.failed }, 401);
      orgId = member.org_id;
    } else {
      await c.env.DB.batch([
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO users (id,login,name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ).bind(userId, '', copy.name, at, at),
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO orgs (id,login,created_at,updated_at) VALUES (?,?,?,?)',
        ).bind(orgId, copy.name, at, at),
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO memberships (id,user_id,org_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)',
        ).bind(`${userId}:${orgId}`, userId, orgId, 'owner', at, at),
      ]);
    }
    const token = crypto.randomUUID(),
      csrf = crypto.randomUUID();
    await c.env.SESSIONS.put(
      `session:${token}`,
      JSON.stringify({ userId, orgId, csrf, emailAccountId: account.id }),
      { expirationTtl: 3600 },
    );
    setCookie(c, 'greenci_session', token, {
      ...cookieOptions(loadConfig(c.env).APP_ENV === 'local'),
      maxAge: 3600,
    });
    deleteCookie(c, 'greenci_email', { path: '/' });
    return c.json({ ok: true });
  });
  app.post('/v1/email/github', async (c) => {
    const user = await session(c.req.raw, c.env),
      cfg = loadConfig(c.env);
    if (!user?.emailAccountId || !user.userId.startsWith('email:'))
      return c.json({ error: cpy.failed }, 403);
    if (!cfg.GITHUB_CLIENT_ID || !cfg.GITHUB_CLIENT_SECRET)
      return c.json({ error: cpy.unavailable }, 503);
    return beginAuthorization(
      c,
      'public',
      { sub: 'public', email: 'public@greenci.invalid' },
      'public',
      cfg.PUBLIC_BETA_URL,
      user.emailAccountId,
    );
  });
  return app;
}
export default emailRoutes();
