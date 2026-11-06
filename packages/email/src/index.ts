import { drizzle, localEmails, localEmailSchema } from '@greenci/db';
/** Local-only outbox transport. Templates and delivery policy follow in M8. */
export async function sendLocalEmail(
  db: D1Database,
  input: { subject: string; body: string },
) {
  const email = localEmailSchema.parse({
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  });
  await drizzle(db).insert(localEmails).values({
    id: email.id,
    subject: email.subject,
    body: email.body,
    createdAt: email.created_at,
    updatedAt: email.created_at,
  });
  return email;
}
