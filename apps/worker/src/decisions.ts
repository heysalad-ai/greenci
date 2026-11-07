import { decide, routingQuestions, type Answer } from '@greenci/decisions';
import { loadConfig, type Run } from '@greenci/core';
import type { RunEnv } from './domain.js';
export async function routeDecision(
  env: RunEnv,
  run: Run,
  kind: keyof typeof routingQuestions,
  input: unknown,
  fixtures: Record<string, string | number | boolean>,
): Promise<Answer[]> {
  const config = loadConfig(env),
    questions = routingQuestions[kind],
    at = new Date().toISOString();
  let answers: Answer[];
  try {
    answers = await decide(input, questions, {
      provider: config.DECISIONS_PROVIDER,
      model: config.DECISIONS_MODEL,
      apiKey: config.OPENAI_API_KEY,
      repo: run.repo,
      fixtures,
    });
  } catch (error) {
    await env.DB.prepare(
      'INSERT INTO decisions (id,run_id,question,answer,model,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
      .bind(
        crypto.randomUUID(),
        run.id,
        JSON.stringify(questions),
        JSON.stringify({ unavailable: true }),
        config.DECISIONS_PROVIDER === 'fake' ? 'fake' : config.DECISIONS_MODEL,
        at,
        at,
      )
      .run();
    throw error;
  }
  for (const answer of answers)
    await env.DB.prepare(
      'INSERT INTO decisions (id,run_id,question,answer,probabilities,model,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    )
      .bind(
        crypto.randomUUID(),
        run.id,
        JSON.stringify(questions.find((q) => q.name === answer.name)),
        JSON.stringify(answer),
        JSON.stringify(answer.probabilities),
        config.DECISIONS_PROVIDER === 'fake' ? 'fake' : config.DECISIONS_MODEL,
        at,
        at,
      )
      .run();
  return answers;
}
export const answerValue = (answers: Answer[], name: string) => {
  const answer = answers.find((a) => a.name === name);
  if (!answer) throw new Error('Missing routing answer');
  return answer.value;
};
