import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, id, updatedAt } from './_columns';
import {
  consultationModeEnum,
  consultationOriginEnum,
  consultationStatusEnum,
} from './enums';
import { projects } from './projects';
import { users } from './users';

export const consultations = pgTable(
  'consultations',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    lecturerId: uuid('lecturer_id')
      .notNull()
      .references(() => users.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    origin: consultationOriginEnum('origin').notNull(),
    status: consultationStatusEnum('status').notNull(),
    mode: consultationModeEnum('mode').notNull(),
    topic: varchar('topic', { length: 255 }).notNull(),
    agenda: text('agenda'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    location: varchar('location', { length: 255 }),
    rejectionReason: text('rejection_reason'),
    cancellationReason: text('cancellation_reason'),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    summary: text('summary'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    icsUid: varchar('ics_uid', { length: 255 }).unique(),
    icsSequence: integer('ics_sequence').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('consultations_lecturer_start_idx').on(t.lecturerId, t.startAt),
    index('consultations_student_start_idx').on(t.studentId, t.startAt),
    index('consultations_project_idx').on(t.projectId),
    check('consultations_time_valid', sql`${t.endAt} > ${t.startAt}`),
  ],
);
