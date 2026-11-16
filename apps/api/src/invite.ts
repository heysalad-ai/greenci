import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { copy, loadConfig } from '@greenci/core';
import {
  GitHubInviteClient,
  GitHubOAuthError,
  identitySchema,
} from '@greenci/github';
import { verifyBetaAccess } from './access.js';
import { session } from './session.js';
import {
  digest,
  freshInvite,
  inviteSchema,
  invitedIdentity,
} from './invite-auth.js';
import type { ApiEnv } from './env.js';
import { beginAuthorization } from './oauth-start.js';
import { publicAdmission } from './public-admission.js';
const authSchema = z.object({ token: z.string(), expires: z.number() });
const stateSchema = z.object({
  invite_id: z.string(),
  access_sub: z.string(),
  email: z.string(),
  verifier: z.string(),
  admission: z.enum(['invite', 'public']),
});
const cpy = copy.inviteBeta;
export function inviteRoutes(
  options: {
    transport?: typeof fetch;
    verifyAccess?: typeof verifyBetaAccess;
  } = {},
) {
  const app = new OpenAPIHono<{ Bindings: ApiEnv }>();
  app.use('/v1/invite/*', async (c, next) => {
    const cfg = loadConfig(c.env);
    if (
      !['local', 'dev'].includes(cfg.APP_ENV) ||
      cfg.INVITE_BETA_ENABLED !== 'true'
    )
      return c.notFound();
    c.header('Cache-Control', 'private, no-store');
    c.header('Referrer-Policy', 'no-referrer');
    await next();
  });
  app.use(
    '/v1/invite/*',
    bodyLimit({
      maxSize: 2048,
      onError: (c) => c.json({ error: cpy.failed }, 413),
    }),
  );
  const client = (env: ApiEnv) =>
    new GitHubInviteClient(loadConfig(env), options.transport);
  app.post('/v1/invite/start', async (c) => {
    const cfg = loadConfig(c.env);
    if (c.req.header('Origin') !== new URL(cfg.WEB_URL).origin)
      return c.json({ error: cpy.failed }, 403);
    if (!cfg.GITHUB_CLIENT_ID || !cfg.GITHUB_CLIENT_SECRET)
      return c.json({ error: cpy.unavailable }, 503);
    try {
      const access = await (options.verifyAccess ?? verifyBetaAccess)(
        c.req.header('Cf-Access-Jwt-Assertion') ??
          getCookie(c, 'CF_Authorization') ??
          '',
        { team: cfg.BETA_ACCESS_TEAM, audience: cfg.BETA_ACCESS_AUD },
      );
      const body = z
        .object({ code: z.string().min(32).max(128) })
        .strict()
        .parse(await c.req.json());
      const raw = await c.env.DB.prepare(
        'SELECT * FROM beta_invites WHERE token_hash=?',
      )
        .bind(await digest(body.code))
        .first();
      const invite = inviteSchema.parse(raw);
      if (
        !freshInvite(invite) ||
        invite.email.toLowerCase() !== access.email.toLowerCase()
      )
        throw new Error('Not invited');
      return await beginAuthorization(
        c,
        invite.id,
        access,
        'invite',
        cfg.WEB_URL,
      );
    } catch {
      return c.json({ error: cpy.failed }, 403);
    }
  });
  app.post('/v1/invite/public/start', async (c) => {
    const cfg = loadConfig(c.env);
    if (cfg.PUBLIC_BETA_ENABLED !== 'true') return c.notFound();
    if (c.req.header('Origin') !== cfg.PUBLIC_BETA_URL)
      return c.json({ error: cpy.failed }, 403);
    if (!cfg.GITHUB_CLIENT_ID || !cfg.GITHUB_CLIENT_SECRET)
      return c.json({ error: cpy.unavailable }, 503);
    try {
      z.object({})
        .strict()
        .parse(await c.req.json());
      return await beginAuthorization(
        c,
        'public',
        { sub: 'public', email: 'public@greenci.invalid' },
        'public',
        cfg.PUBLIC_BETA_URL,
      );
    } catch (error) {
      return c.json(
        { error: cpy.failed },
        error instanceof z.ZodError ? 400 : 429,
      );
    }
  });
  app.get('/v1/invite/callback', async (c) => {
    const cfg = loadConfig(c.env);
    let flowOrigin = cfg.WEB_URL;
    let stage:
      'request' | 'state' | 'exchange' | 'identity' | 'binding' | 'session' =
      'request';
    try {
      const query = z
        .object({ state: z.uuid(), code: z.string().min(1).max(512) })
        .parse(c.req.query());
      const browser = getCookie(c, 'greenci_oauth') ?? '';
      const marker = await c.env.DB.prepare(
        'SELECT admission FROM beta_oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? AND used=0',
      )
        .bind(
          await digest(query.state),
          await digest(browser),
          new Date().toISOString(),
        )
        .first<{ admission: string }>();
      if (!marker) throw new Error('Invalid browser state');
      const publicFlow = marker.admission === 'public';
      if (publicFlow) {
        flowOrigin = cfg.PUBLIC_BETA_URL || cfg.WEB_URL;
        if (cfg.PUBLIC_BETA_ENABLED !== 'true')
          throw new Error('Public beta disabled');
      }
      let access: { sub: string; email: string } = publicFlow
        ? { sub: 'public', email: 'public@greenci.invalid' }
        : await (options.verifyAccess ?? verifyBetaAccess)(
            c.req.header('Cf-Access-Jwt-Assertion') ??
              getCookie(c, 'CF_Authorization') ??
              '',
            { team: cfg.BETA_ACCESS_TEAM, audience: cfg.BETA_ACCESS_AUD },
          );
      const raw = await c.env.DB.prepare(
        'UPDATE beta_oauth_states SET used=1 WHERE state_hash=? AND browser_hash=? AND access_sub=? AND email=? AND expires_at>? AND used=0 RETURNING invite_id,access_sub,email,verifier,admission',
      )
        .bind(
          await digest(query.state),
          await digest(browser),
          access.sub,
          access.email.toLowerCase(),
          new Date().toISOString(),
        )
        .first();
      stage = 'state';
      const state = stateSchema.parse(raw);
      let invite = publicFlow
        ? null
        : inviteSchema.parse(
            await c.env.DB.prepare('SELECT * FROM beta_invites WHERE id=?')
              .bind(state.invite_id)
              .first(),
          );
      if (invite && !freshInvite(invite)) throw new Error('Not invited');
      stage = 'exchange';
      const gh = new GitHubInviteClient(
        { ...cfg, WEB_URL: flowOrigin },
        options.transport,
      );
      const result = await gh.exchange(query.code, state.verifier);
      stage = 'identity';
      const identity = identitySchema.parse(
        await gh.get('/user', result.access_token),
      );
      if (publicFlow) {
        const admission = await publicAdmission(c.env, identity);
        invite = admission.invite;
        access = admission.access;
      }
      if (!invite) throw new Error('Admission unavailable');
      if (
        identity.login.toLowerCase() !== invite.login.toLowerCase() ||
        (invite.github_id && invite.github_id !== String(identity.id))
      )
        throw new Error('Wrong GitHub account');
      stage = 'binding';
      const userId = `github:${identity.id}`,
        orgId = `invite-${identity.id}`,
        at = new Date().toISOString();
      // A claimed invitation cannot be rebound to another GitHub or Access identity.
      const existing = await c.env.DB.prepare(
        'SELECT access_sub,invite_id FROM beta_identities WHERE user_id=?',
      )
        .bind(userId)
        .first<{ access_sub: string; invite_id: string }>();
      if (
        existing &&
        (existing.access_sub !== access.sub || existing.invite_id !== invite.id)
      )
        throw new Error('Identity already bound');
      await c.env.DB.batch([
        c.env.DB.prepare(
          'UPDATE beta_invites SET github_id=? WHERE id=? AND revoked=0 AND (github_id IS NULL OR github_id=?)',
        ).bind(String(identity.id), invite.id, String(identity.id)),
        c.env.DB.prepare(
          'INSERT INTO users (id,github_id,login,name,avatar_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,updated_at=excluded.updated_at',
        ).bind(
          userId,
          String(identity.id),
          identity.login,
          identity.login,
          '',
          at,
          at,
        ),
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO orgs (id,login,created_at,updated_at) VALUES (?,?,?,?)',
        ).bind(orgId, identity.login, at, at),
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO memberships (id,user_id,org_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)',
        ).bind(`${userId}:${orgId}`, userId, orgId, 'owner', at, at),
        c.env.DB.prepare(
          'INSERT OR IGNORE INTO beta_identities (user_id,invite_id,github_id,login,access_sub,email,admission) VALUES (?,?,?,?,?,?,?)',
        ).bind(
          userId,
          invite.id,
          String(identity.id),
          identity.login,
          access.sub,
          access.email,
          state.admission,
        ),
      ]);
      const bound = await invitedIdentity(c.env, userId);
      if (bound.access_sub !== access.sub || bound.invite_id !== invite.id)
        throw new Error('Identity binding conflict');
      stage = 'session';
      const token = crypto.randomUUID(),
        csrf = crypto.randomUUID();
      await c.env.SESSIONS.put(
        `session:${token}`,
        JSON.stringify({ userId, orgId, csrf }),
        { expirationTtl: 3600 },
      );
      await c.env.SESSIONS.put(
        `github-user:${userId}`,
        JSON.stringify({
          token: result.access_token,
          expires:
            Date.now() + Math.min(3600, result.expires_in ?? 3600) * 1000,
        }),
        { expirationTtl: 3600 },
      );
      setCookie(c, 'greenci_session', token, {
        httpOnly: true,
        secure: cfg.APP_ENV !== 'local',
        sameSite: 'Lax',
        path: '/',
        maxAge: 3600,
      });
      deleteCookie(c, 'greenci_oauth', { path: '/' });
      return c.redirect(`${flowOrigin}/beta?connected=1`);
    } catch (error) {
      console.warn('Beta OAuth rejected', {
        stage,
        reason: error instanceof GitHubOAuthError ? error.reason : 'rejected',
      });
      deleteCookie(c, 'greenci_oauth', { path: '/' });
      return c.redirect(`${flowOrigin}/beta?error=signin`);
    }
  });
  app.use('/v1/invite/*', async (c, next) => {
    const user = await session(c.req.raw, c.env);
    if (!user) return c.json({ error: copy.api.signIn }, 401);
    await next();
  });
  async function githubToken(env: ApiEnv, userId: string) {
    await invitedIdentity(env, userId);
    const raw = await env.SESSIONS.get(`github-user:${userId}`),
      data = authSchema.parse(JSON.parse(raw ?? 'null'));
    if (data.expires <= Date.now()) throw new Error('Reauthorize GitHub');
    return data.token;
  }
  app.get('/v1/invite/me', async (c) => {
    const user = (await session(c.req.raw, c.env))!,
      cfg = loadConfig(c.env);
    const identity = await c.env.DB.prepare(
      'SELECT login FROM users WHERE id=?',
    )
      .bind(user.userId)
      .first<{ login: string }>();
    return c.json({
      csrf: user.csrf,
      orgId: user.orgId,
      login: identity?.login ?? '',
      admin:
        user.userId.startsWith('access:') &&
        identity?.login === cfg.BETA_OWNER_LOGIN,
      installUrl: cfg.GITHUB_APP_SLUG
        ? `https://github.com/apps/${cfg.GITHUB_APP_SLUG}/installations/new`
        : null,
    });
  });
  app.get('/v1/invite/repositories', async (c) => {
    try {
      const user = (await session(c.req.raw, c.env))!,
        token = await githubToken(c.env, user.userId),
        gh = client(c.env),
        cfg = loadConfig(c.env),
        rows = [];
      for (const i of await gh.installations(token, cfg.GITHUB_APP_ID))
        for (const repo of await gh.repos(token, i.id))
          rows.push({ ...repo, installationId: i.id });
      return c.json({ repos: rows });
    } catch {
      return c.json({ error: cpy.failed }, 403);
    }
  });
  app.post('/v1/invite/connect', async (c) => {
    try {
      const user = (await session(c.req.raw, c.env))!,
        token = await githubToken(c.env, user.userId),
        gh = client(c.env),
        cfg = loadConfig(c.env);
      const body = z
        .object({
          repo: z.string(),
          installationId: z.number().int().positive(),
        })
        .strict()
        .parse(await c.req.json());
      const installations = await gh.installations(token, cfg.GITHUB_APP_ID);
      const installation = installations.find(
        (x) => x.id === body.installationId,
      );
      if (!installation) throw new Error('Installation not authorized');
      const repo = (await gh.repos(token, body.installationId)).find(
        (x) => x.full_name === body.repo,
      );
      if (
        !repo ||
        repo.full_name.split('/')[0]!.toLowerCase() !==
          installation.account.login.toLowerCase()
      )
        throw new Error('Repository not authorized');
      const other = await c.env.DB.prepare(
        'SELECT org_id FROM repos WHERE full_name=?',
      )
        .bind(repo.full_name)
        .first<{ org_id: string }>();
      if (other && other.org_id !== user.orgId)
        throw new Error('Already connected');
      const count = await c.env.DB.prepare(
        'SELECT COUNT(*) AS n FROM beta_connections WHERE org_id=?',
      )
        .bind(user.orgId)
        .first<{ n: number }>();
      const connected = await c.env.DB.prepare(
        'SELECT repo FROM beta_connections WHERE org_id=? AND repo=?',
      )
        .bind(user.orgId, repo.full_name)
        .first();
      if (!connected && (count?.n ?? 0) >= 5)
        throw new Error('Connection limit');
      const at = new Date().toISOString();
      await c.env.DB.batch([
        c.env.DB.prepare(
          'INSERT INTO beta_connections (repo,org_id,user_id,installation_id,default_branch,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(repo) DO UPDATE SET installation_id=excluded.installation_id,default_branch=excluded.default_branch WHERE beta_connections.org_id=excluded.org_id',
        ).bind(
          repo.full_name,
          user.orgId,
          user.userId,
          String(body.installationId),
          repo.default_branch,
          at,
        ),
        c.env.DB.prepare(
          "INSERT INTO repos (id,org_id,full_name,default_branch,watched,test_command,created_at,updated_at) VALUES (?,?,?,?,0,'node --test test.mjs',?,?) ON CONFLICT(id) DO UPDATE SET default_branch=excluded.default_branch WHERE repos.org_id=excluded.org_id",
        ).bind(
          repo.full_name,
          user.orgId,
          repo.full_name,
          repo.default_branch,
          at,
          at,
        ),
      ]);
      const saved = await c.env.DB.prepare(
        'SELECT org_id FROM beta_connections WHERE repo=?',
      )
        .bind(repo.full_name)
        .first<{ org_id: string }>();
      if (saved?.org_id !== user.orgId) throw new Error('Connection conflict');
      return c.json({ repo: repo.full_name });
    } catch {
      return c.json({ error: cpy.failed }, 409);
    }
  });
  app.post('/v1/invite/logout', async (c) => {
    const user = (await session(c.req.raw, c.env))!;
    await c.env.SESSIONS.delete(`github-user:${user.userId}`);
    const token = getCookie(c, 'greenci_session');
    if (token) await c.env.SESSIONS.delete(`session:${token}`);
    deleteCookie(c, 'greenci_session', { path: '/' });
    return c.json({ ok: true });
  });
  app.use('/v1/invite/admin/*', async (c, next) => {
    const user = (await session(c.req.raw, c.env))!,
      cfg = loadConfig(c.env);
    const u = await c.env.DB.prepare('SELECT login FROM users WHERE id=?')
      .bind(user.userId)
      .first<{ login: string }>();
    if (!user.userId.startsWith('access:') || u?.login !== cfg.BETA_OWNER_LOGIN)
      return c.json({ error: copy.api.signIn }, 403);
    await next();
  });
  app.get('/v1/invite/admin/invites', async (c) =>
    c.json({
      invites: (
        await c.env.DB.prepare(
          'SELECT id,email,login,expires_at,revoked FROM beta_invites ORDER BY created_at DESC LIMIT 50',
        ).all()
      ).results,
    }),
  );
  app.post('/v1/invite/admin/invites', async (c) => {
    const body = z
        .object({
          email: z.email(),
          login: z.string().regex(/^[a-z\d-]{1,39}$/i),
        })
        .strict()
        .parse(await c.req.json()),
      code = crypto.randomUUID() + crypto.randomUUID(),
      id = crypto.randomUUID(),
      expires = new Date(Date.now() + 7 * 86400000).toISOString();
    await c.env.DB.prepare(
      'INSERT INTO beta_invites (id,token_hash,email,login,expires_at,created_at) VALUES (?,?,?,?,?,?)',
    )
      .bind(
        id,
        await digest(code),
        body.email.toLowerCase(),
        body.login.toLowerCase(),
        expires,
        new Date().toISOString(),
      )
      .run();
    return c.json({ id, code, expires }, 201);
  });
  app.post('/v1/invite/admin/revoke', async (c) => {
    const body = z
      .object({ id: z.uuid() })
      .strict()
      .parse(await c.req.json());
    await c.env.DB.prepare('UPDATE beta_invites SET revoked=1 WHERE id=?')
      .bind(body.id)
      .run();
    return c.json({ ok: true });
  });
  return app;
}
export default inviteRoutes();
