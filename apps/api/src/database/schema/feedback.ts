import {
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, id, updatedAt } from './_columns';
import { revisionStatusEnum } from './enums';
import { submissionVersions } from './submissions';
import { users } from './users';

export const feedbacks = pgTable(
  'feedbacks',
  {
    id: id(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => submissionVersions.id),
    lecturerId: uuid('lecturer_id')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('feedbacks_version_idx').on(t.versionId)],
);

export const revisionItems = pgTable(
  'revision_items',
  {
    id: id(),
    feedbackId: uuid('feedback_id')
      .notNull()
      .references(() => feedbacks.id),
    position: smallint('position').notNull(),
    description: text('description').notNull(),
    status: revisionStatusEnum('status').notNull().default('open'),
    addressedInVersionId: uuid('addressed_in_version_id').references(
      () => submissionVersions.id,
    ),
    addressedNote: text('addressed_note'),
    addressedAt: timestamp('addressed_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('revision_items_feedback_idx').on(t.feedbackId)],
);
