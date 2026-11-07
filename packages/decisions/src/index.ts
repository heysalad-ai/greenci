import { z } from 'zod';
import OpenAI from 'openai';
import { redact } from '@greenci/core';
const base = {
  name: z.string().regex(/^[a-z_]+$/),
  instructions: z.string().min(1),
};
export const questionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('predicate') }),
  z.object({
    ...base,
    type: z.literal('choice'),
    choices: z
      .array(z.object({ value: z.string(), description: z.string() }))
      .min(2),
  }),
  z.object({
    ...base,
    type: z.literal('score'),
    levels: z
      .array(z.object({ label: z.string(), description: z.string() }))
      .min(2),
  }),
]);
export type Question = z.infer<typeof questionSchema>;
const probabilitySchema = z.object({
  value: z.union([z.string(), z.number()]),
  probability: z.number().min(0).max(1),
});
export const answerSchema = z.object({
  name: z.string(),
  type: z.enum(['predicate', 'choice', 'score']),
  value: z.union([z.boolean(), z.string(), z.number()]),
  confidence: z.number().min(0).max(1).nullable(),
  probabilities: z.array(probabilitySchema).nullable(),
});
export type Answer = z.infer<typeof answerSchema>;
export type DecisionOptions = {
  provider: 'fake' | 'openai' | 'responses';
  model: string;
  apiKey?: string;
  repo: string;
  transport?: typeof fetch;
  fixtures?: Record<string, string | number | boolean>;
};
export class DecisionUnavailable extends Error {}
export async function decide(
  input: unknown,
  questionsInput: Question[],
  options: DecisionOptions,
): Promise<Answer[]> {
  const questions = z
    .array(questionSchema)
    .min(1)
    .max(400)
    .parse(questionsInput);
  if (new Set(questions.map((q) => q.name)).size !== questions.length)
    throw new Error('Question names must be unique');
  const text = redact(
    z
      .string()
      .max(100_000)
      .parse(typeof input === 'string' ? input : JSON.stringify(input)),
  );
  let answers: Answer[];
  if (options.provider === 'fake') {
    answers = questions.map((q) => {
      const value =
        options.fixtures?.[q.name] ??
        (q.type === 'predicate'
          ? 0.01
          : q.type === 'choice'
            ? q.choices[0]!.value
            : 0);
      return {
        name: q.name,
        type: q.type,
        value,
        confidence: 1,
        probabilities:
          q.type === 'predicate'
            ? [
                { value: 1, probability: Number(value) },
                { value: 0, probability: 1 - Number(value) },
              ]
            : null,
      };
    });
  } else {
    if (!options.apiKey)
      throw new DecisionUnavailable('OPENAI_API_KEY is required');
    if (options.provider === 'openai') {
      const transport =
        options.transport ?? ((input, init) => fetch(input, init));
      const response = await transport('https://api.openai.com/v1/decisions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          input: text,
          questions,
          prompt_cache_key: `greenci:${options.repo}`,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new DecisionUnavailable(
          `Decisions unavailable (${response.status}); use responses fallback`,
        );
      const data = z
        .object({
          answers: z.array(
            z.object({
              name: z.string(),
              type: z.string(),
              probability: z.number().optional(),
              choice: z.string().optional(),
              score: z.number().optional(),
              confidence: z.number().optional(),
              probabilities: z.array(probabilitySchema).optional(),
            }),
          ),
        })
        .parse(await response.json());
      if (data.answers.some((answer) => answer.type === 'refusal'))
        throw new DecisionUnavailable(
          'Decision refused; human review required',
        );
      answers = data.answers.map((answer) =>
        answerSchema.parse({
          name: answer.name,
          type: answer.type,
          value:
            answer.type === 'predicate'
              ? answer.probability
              : answer.type === 'choice'
                ? answer.choice
                : answer.score,
          confidence: answer.confidence ?? null,
          probabilities: answer.probabilities ?? null,
        }),
      );
    } else {
      const client = new OpenAI({
        apiKey: options.apiKey,
        ...(options.transport ? { fetch: options.transport } : {}),
        maxRetries: 0,
      });
      const schema = z.object({ answers: z.array(answerSchema) });
      const response = await client.responses.create({
        model: options.model,
        input: [
          {
            role: 'developer',
            content:
              'Answer each question from the supplied evidence. Predicate value is probability 0..1. Score values use zero-based level indices. Set confidence and probabilities to null. Never invent probabilities.',
          },
          { role: 'user', content: JSON.stringify({ input: text, questions }) },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'routing_answers',
            strict: true,
            schema: z.toJSONSchema(schema),
          },
        },
        prompt_cache_key: `greenci:${options.repo}`,
      });
      if (!response.output_text)
        throw new DecisionUnavailable(
          'Responses refused; human review required',
        );
      answers = schema
        .parse(JSON.parse(response.output_text))
        .answers.map((answer) => ({
          ...answer,
          confidence: null,
          probabilities: null,
        }));
    }
  }
  if (
    answers.length !== questions.length ||
    new Set(answers.map((answer) => answer.name)).size !== questions.length
  )
    throw new DecisionUnavailable('Missing or duplicate decision answers');
  for (const question of questions) {
    const answer = answers.find((answer) => answer.name === question.name);
    if (!answer || answer.type !== question.type)
      throw new DecisionUnavailable('Decision type mismatch');
    if (question.type === 'predicate')
      z.number().min(0).max(1).parse(answer.value);
    if (
      question.type === 'choice' &&
      !question.choices.some((choice) => choice.value === answer.value)
    )
      throw new DecisionUnavailable('Invalid choice');
    if (question.type === 'score')
      z.number()
        .min(0)
        .max(question.levels.length - 1)
        .parse(answer.value);
    if (
      answer.probabilities &&
      Math.abs(
        answer.probabilities.reduce((sum, p) => sum + p.probability, 0) - 1,
      ) > 0.02
    )
      throw new DecisionUnavailable('Invalid probability distribution');
  }
  return answers;
}
export const routingQuestions = {
  failure: [
    {
      type: 'predicate',
      name: 'infra',
      instructions:
        'Is this failure caused by CI config, secrets or infrastructure, not code?',
    },
    {
      type: 'choice',
      name: 'category',
      instructions: 'Classify the failure.',
      choices: ['code', 'test', 'dependency', 'config', 'flaky', 'infra'].map(
        (value) => ({ value, description: value }),
      ),
    },
    {
      type: 'predicate',
      name: 'flaky',
      instructions:
        'Did this exact check fail the same way on the default branch in the last 7 days? Use the supplied history only.',
    },
  ],
  risk: [
    {
      type: 'score',
      name: 'risk',
      instructions: 'Risk of this diff, 1–5.',
      levels: [1, 2, 3, 4, 5].map((value) => ({
        label: String(value),
        description: `Risk ${value} of 5`,
      })),
    },
  ],
  remaining: [
    {
      type: 'predicate',
      name: 'unrelated',
      instructions:
        'Is the remaining failure unrelated to this fix? Compare original, verify and default branch evidence.',
    },
  ],
  urgency: [
    {
      type: 'choice',
      name: 'urgency',
      instructions: 'Choose notification urgency.',
      choices: ['page now', 'toast', 'digest'].map((value) => ({
        value,
        description: value,
      })),
    },
  ],
} satisfies Record<string, Question[]>;
