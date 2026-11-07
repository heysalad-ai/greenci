import { z } from 'zod';
import { runSchema, actionSchema, type Action } from '@greenci/core';
export function createActionClient(options: {
  baseUrl: string;
  token?: string;
  csrf?: () => string;
  transport?: typeof fetch;
}) {
  const transport = options.transport ?? ((input, init) => fetch(input, init));
  async function request(path: string, body?: unknown) {
    const response = await transport(options.baseUrl + path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token
          ? { Authorization: `Bearer ${options.token}` }
          : { 'X-CSRF-Token': options.csrf?.() ?? '' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response;
  }
  return {
    async runs() {
      return z.array(runSchema).parse(await (await request('/runs')).json());
    },
    async run(id: string) {
      return runSchema.parse(
        await (await request(`/runs/${encodeURIComponent(id)}`)).json(),
      );
    },
    async action(id: string, action: Action, revision?: number) {
      await request(`/runs/${encodeURIComponent(id)}/actions`, {
        action: actionSchema.parse(action),
        ...(revision === undefined ? {} : { revision }),
      });
    },
    async decisions(id: string) {
      return z
        .array(
          z.object({
            id: z.string(),
            question: z.unknown(),
            answer: z.unknown(),
            probabilities: z.unknown().optional(),
            model: z.string(),
          }),
        )
        .parse(
          await (
            await request(`/runs/${encodeURIComponent(id)}/decisions`)
          ).json(),
        );
    },
    async events(id: string) {
      return z
        .array(
          z.object({
            id: z.string(),
            type: z.string(),
            at: z.string(),
            payload: z.unknown().optional(),
          }),
        )
        .parse(
          await (
            await request(`/runs/${encodeURIComponent(id)}/events`)
          ).json(),
        );
    },
  };
}
export const sessionResponseSchema = z.object({
  csrf: z.string().uuid(),
  orgId: z.string(),
});
