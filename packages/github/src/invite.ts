import { z } from 'zod';
import type { Config } from '@greenci/core';
export const identitySchema = z.object({
  id: z.number().int().positive(),
  login: z.string().regex(/^[a-z\d-]{1,39}$/i),
});
export const installationSchema = z.object({
  id: z.number().int().positive(),
  app_id: z.number().int().positive(),
  account: z.object({ login: z.string() }),
  suspended_at: z.string().nullable(),
});
export const connectedRepoSchema = z.object({
  full_name: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  default_branch: z.string().min(1),
  permissions: z.object({ push: z.boolean(), admin: z.boolean().optional() }),
  archived: z.boolean().optional(),
  disabled: z.boolean().optional(),
});
/** User authorization is ephemeral. Never return a token to a browser or a model. */
export class GitHubInviteClient {
  constructor(
    private config: Pick<
      Config,
      'GITHUB_CLIENT_ID' | 'GITHUB_CLIENT_SECRET' | 'WEB_URL'
    >,
    private transport: typeof fetch = fetch,
  ) {}
  async exchange(code: string, verifier: string) {
    const response = await this.transport(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.config.GITHUB_CLIENT_ID,
          client_secret: this.config.GITHUB_CLIENT_SECRET,
          code,
          code_verifier: verifier,
          redirect_uri: `${this.config.WEB_URL}/api/client/invite/callback`,
        }),
      },
    );
    if (!response.ok) throw new Error('GitHub authorization unavailable');
    return z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive().optional(),
      })
      .parse(await response.json());
  }
  async get(path: string, token: string) {
    if (
      !/^\/(user|user\/installations(?:\/\d+\/repositories)?)(?:\?per_page=100&page=\d+)?$/.test(
        path,
      )
    )
      throw new Error('Unsupported GitHub identity request');
    const response = await this.transport(`https://api.github.com${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'GreenCI-Dev',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error('GitHub authorization unavailable');
    return response.json() as Promise<unknown>;
  }
  async installations(token: string, appId: string) {
    const result = [];
    for (let page = 1; page <= 5; page++) {
      const body = z
        .object({
          installations: z.array(installationSchema),
          total_count: z.number(),
        })
        .parse(
          await this.get(
            `/user/installations?per_page=100&page=${page}`,
            token,
          ),
        );
      result.push(
        ...body.installations.filter(
          (x) => String(x.app_id) === appId && !x.suspended_at,
        ),
      );
      if (body.total_count <= page * 100) return result;
    }
    throw new Error('Too many installations for this beta');
  }
  async repos(token: string, installation: number) {
    const result = [];
    for (let page = 1; page <= 5; page++) {
      const body = z
        .object({
          repositories: z.array(connectedRepoSchema),
          total_count: z.number(),
        })
        .parse(
          await this.get(
            `/user/installations/${installation}/repositories?per_page=100&page=${page}`,
            token,
          ),
        );
      result.push(
        ...body.repositories.filter(
          (x) => x.permissions.push && !x.archived && !x.disabled,
        ),
      );
      if (body.total_count <= page * 100) return result;
    }
    throw new Error('Too many repositories for this beta');
  }
}
