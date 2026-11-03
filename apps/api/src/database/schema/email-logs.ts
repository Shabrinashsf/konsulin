import {
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, id } from './_columns';
import { emailStatusEnum } from './enums';
import { users } from './users';

export const emailLogs = pgTable(
  'email_logs',
  {
    id: id(),
    recipientUserId: uuid('recipient_user_id').references(() => users.id),
    recipientEmail: varchar('recipient_email', { length: 255 }).notNull(),
    template: varchar('template', { length: 100 }).notNull(),
    subject: varchar('subject', { length: 255 }).notNull(),
    dedupeKey: varchar('dedupe_key', { length: 255 }).unique(),
    payload: jsonb('payload'),
    status: emailStatusEnum('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('email_logs_status_idx').on(t.status)],
);
