import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';
export const localEmailSchema = z.object({
  id: z.string(),
  subject: z.string(),
  body: z.string(),
  created_at: z.string(),
});
export const localEmails = sqliteTable('local_emails', {
  id: text('id').primaryKey(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const platformEvents = sqliteTable('platform_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  payload: text('payload', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const workflowProbes = sqliteTable('workflow_probes', {
  id: text('id').primaryKey(),
  phase: text('phase').notNull(),
  sequence: integer('sequence').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const eventSchema = z.object({
  id: z.string(),
  type: z.string().max(64),
  payload: z.record(z.string(), z.unknown()),
  at: z.string(),
});
