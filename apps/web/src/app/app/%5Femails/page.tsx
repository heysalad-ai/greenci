import { getCloudflareContext } from '@opennextjs/cloudflare';
import { notFound } from 'next/navigation';
import { copy } from '@greenci/core';
import { localEmailSchema } from '@greenci/db';
export const dynamic = 'force-dynamic';
export default async function Emails() {
  const { env } = getCloudflareContext();
  if (env.APP_ENV !== 'local') notFound();
  const response = await env.API.fetch('https://api/__local/emails');
  const emails = response.ok
    ? localEmailSchema.array().parse(await response.json())
    : null;
  return (
    <main>
      <h1>{copy.emails}</h1>
      {emails === null ? (
        <p>{copy.unavailable}</p>
      ) : emails.length === 0 ? (
        <p>{copy.noEmails}</p>
      ) : (
        emails.map((email) => (
          <article key={email.id}>
            <h2>{email.subject}</h2>
            <pre>{email.body}</pre>
          </article>
        ))
      )}
    </main>
  );
}
