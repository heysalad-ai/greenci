import { expect, it } from 'vitest';
import {
  decide,
  routingQuestions,
  DecisionUnavailable,
} from '../packages/decisions/src/index.js';
it('keeps fake routing deterministic and validates all answer types', async () => {
  const answers = await decide({ log: 'failing' }, routingQuestions.failure, {
    provider: 'fake',
    model: 'fixture',
    repo: 'acme/web',
    fixtures: { infra: 0.8, category: 'infra', flaky: 0.1 },
  });
  expect(answers.map((a) => a.value)).toEqual([0.8, 'infra', 0.1]);
  expect(
    (
      await decide('diff', routingQuestions.risk, {
        provider: 'fake',
        model: 'fixture',
        repo: 'acme/web',
        fixtures: { risk: 3 },
      })
    )[0]?.value,
  ).toBe(3);
  await expect(
    decide('x', routingQuestions.failure, {
      provider: 'fake',
      model: 'fixture',
      repo: 'acme/web',
      fixtures: { category: 'invented' },
    }),
  ).rejects.toThrow();
});
it('sends the documented Decisions schema, redacts tokens and maps probability/choice/zero-indexed scores', async () => {
  let request: Record<string, unknown> = {};
  const answers = await decide(
    'Authorization: Bearer fixture-private-value',
    routingQuestions.failure,
    {
      provider: 'openai',
      apiKey: 'fixture-key',
      model: 'gpt-6-luna',
      repo: 'acme/web',
      transport: async (_url, init) => {
        request = JSON.parse(String(init?.body));
        return Response.json({
          answers: [
            { name: 'infra', type: 'predicate', probability: 0.1 },
            {
              name: 'category',
              type: 'choice',
              choice: 'code',
              confidence: 0.9,
              probabilities: [{ value: 'code', probability: 1 }],
            },
            { name: 'flaky', type: 'predicate', probability: 0.2 },
          ],
        });
      },
    },
  );
  expect(request.prompt_cache_key).toBe('greenci:acme/web');
  expect(JSON.stringify(request)).not.toContain('fixture-private-value');
  expect(answers[0]?.value).toBe(0.1);
});
it('uses strict Responses output with null confidence and handles refusals/malformed/incomplete answers safely', async () => {
  const questions = [routingQuestions.failure[0]!];
  const transport: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      text: { format: { strict: boolean } };
    };
    expect(body.text.format.strict).toBe(true);
    return Response.json({
      id: 'fixture',
      object: 'response',
      created_at: 0,
      status: 'completed',
      model: 'fixture',
      output: [
        {
          type: 'message',
          id: 'm1',
          role: 'assistant',
          status: 'completed',
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                answers: [
                  {
                    name: 'infra',
                    type: 'predicate',
                    value: 0.2,
                    confidence: 0.9,
                    probabilities: null,
                  },
                ],
              }),
              annotations: [],
            },
          ],
        },
      ],
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    });
  };
  const result = await decide('evidence', questions, {
    provider: 'responses',
    model: 'fixture',
    apiKey: 'fixture',
    repo: 'acme/web',
    transport,
  });
  expect(result[0]?.confidence).toBeNull();
  for (const body of [
    { answers: [] },
    { answers: [{ name: 'infra', type: 'refusal' }] },
    { answers: [{ name: 'infra', type: 'predicate', probability: 1.2 }] },
  ])
    await expect(
      decide('x', questions, {
        provider: 'openai',
        model: 'fixture',
        apiKey: 'fixture',
        repo: 'acme/web',
        transport: async () => Response.json(body),
      }),
    ).rejects.toThrow();
  await expect(
    decide('x', questions, {
      provider: 'openai',
      model: 'fixture',
      repo: 'acme/web',
    }),
  ).rejects.toBeInstanceOf(DecisionUnavailable);
  await expect(
    decide('x', questions, {
      provider: 'openai',
      apiKey: 'fixture',
      model: 'fixture',
      repo: 'acme/web',
      transport: async () => new Response('Unavailable', { status: 403 }),
    }),
  ).rejects.toThrow('responses fallback');
});
