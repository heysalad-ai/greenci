import { OpenAPIHono } from '@hono/zod-openapi';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { loadConfig, copy } from '@greenci/core';
import { GitHubAppClient } from '@greenci/github';
import type { ApiEnv } from './env.js';
import { verifyBetaAccess } from './access.js';

const app = new OpenAPIHono<{ Bindings: ApiEnv }>();
app.post('/__beta/session', async (c) => {
  const config = loadConfig(c.env);
  if (
    config.APP_ENV !== 'dev' ||
    config.BETA_ENABLED !== 'true' ||
    config.SCAFFOLD_ONLY === 'true' ||
    config.GITHUB_MODE !== 'app' ||
    config.AGENT_PROVIDER !== 'openai' ||
    config.SANDBOX_CLIENT !== 'cloudflare'
  )
    return c.notFound();
  let identity;
  try {
    identity = await verifyBetaAccess(
      c.req.header('Cf-Access-Jwt-Assertion') ??
        getCookie(c, 'CF_Authorization') ??
        '',
      {
        team: config.BETA_ACCESS_TEAM,
        audience: config.BETA_ACCESS_AUD,
        email: config.BETA_OWNER_EMAIL,
      },
    );
  } catch (error) {
    const reason =
      error instanceof Error &&
      [
        'Access identity not admitted: Access issuer mismatch',
        'Access identity not admitted: Access audience mismatch',
        'Access identity not admitted: Access assertion expired or not yet valid',
        'Access identity not admitted: Access owner mismatch',
        'Invalid Access assertion',
        'Access signing keys unavailable',
        'Unknown Access signing key',
        'Invalid Access signature',
      ].includes(error.message)
        ? error.message
        : 'Invalid Access assertion structure';
    console.warn(
      'Beta authentication rejected:',
      error instanceof Error ? error.name : 'unknown',
      reason,
      error instanceof z.ZodError
        ? error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
          }))
        : [],
    );
    return c.json({ error: copy.api.signIn }, 401);
  }
  const login = z
    .string()
    .regex(/^[\w-]{1,39}$/)
    .parse(config.BETA_OWNER_LOGIN);
  const github = new GitHubAppClient(config),
    repos = await github.repos();
  const metadata = await Promise.all(
    repos.map(async (repo) => {
      if (!['admin', 'write'].includes(await github.permission(repo, login)))
        throw new Error('Beta owner needs repository write permission');
      return github.metadata(repo);
    }),
  );
  const owner = repos[0]!.split('/')[0]!,
    userId = `access:${identity.sub}`,
    at = new Date().toISOString();
  const db = c.env.DB;
  await db.batch([
    db
      .prepare(
        'INSERT INTO users (id,github_id,login,name,avatar_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,updated_at=excluded.updated_at',
      )
      .bind(userId, login, login, login, '', at, at),
    db
      .prepare(
        'INSERT OR IGNORE INTO orgs (id,login,created_at,updated_at) VALUES (?,?,?,?)',
      )
      .bind(owner, owner, at, at),
    db
      .prepare(
        'INSERT OR IGNORE INTO memberships (id,user_id,org_id,role,created_at,updated_at) VALUES (?,?,?,?,?,?)',
      )
      .bind(`${userId}:${owner}`, userId, owner, 'owner', at, at),
    db
      .prepare(
        'INSERT OR REPLACE INTO installations (id,github_installation_id,org_id,created_at,updated_at) VALUES (?,?,?,?,?)',
      )
      .bind(owner, Number(config.GITHUB_INSTALLATION_ID), owner, at, at),
    ...metadata.flatMap((repo) => [
      db
        .prepare(
          'INSERT INTO repos (id,org_id,full_name,default_branch,watched,test_command,created_at,updated_at) VALUES (?,?,?,?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET default_branch=excluded.default_branch,updated_at=excluded.updated_at',
        )
        .bind(
          repo.full_name,
          owner,
          repo.full_name,
          repo.default_branch,
          'node --test',
          at,
          at,
        ),
      db
        .prepare(
          'INSERT OR IGNORE INTO repo_rules (id,repo_id,protected_paths,page_me_branches,max_diff_lines,auto_open_pr,allow_workflows,auto_mode,auto_repair,created_at,updated_at) VALUES (?,?,?,?,200,1,0,0,0,?,?)',
        )
        .bind(
          repo.full_name,
          repo.full_name,
          '["migrations/**"]',
          '[]',
          at,
          at,
        ),
    ]),
  ]);
  const token = crypto.randomUUID(),
    csrf = crypto.randomUUID();
  await c.env.SESSIONS.put(
    `session:${token}`,
    JSON.stringify({ userId, orgId: owner, csrf }),
    { expirationTtl: 3600 },
  );
  setCookie(c, 'greenci_session', token, {
    secure: true,
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: 3600,
  });
  return c.json({ csrf, orgId: owner, mode: 'beta', repo: repos[0] });
});
export default app;
