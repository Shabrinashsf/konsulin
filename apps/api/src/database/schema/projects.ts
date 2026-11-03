import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, id, updatedAt } from './_columns';
import {
  degreeEnum,
  invitationStatusEnum,
  projectTypeEnum,
  trackModeEnum,
} from './enums';
import { users } from './users';

export const projects = pgTable(
  'projects',
  {
    id: id(),
    lecturerId: uuid('lecturer_id')
      .notNull()
      .references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    type: projectTypeEnum('type').notNull(),
    trackMode: trackModeEnum('track_mode').notNull(),
    requiredDegree: degreeEnum('required_degree'), // null = tipe umum
    startDate: date('start_date'),
    endDate: date('end_date'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('projects_lecturer_idx').on(t.lecturerId),
    check('projects_dates_valid', sql`${t.endDate} >= ${t.startDate}`),
  ],
);

export const projectMembers = pgTable(
  'project_members',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('project_members_uq')
      .on(t.projectId, t.studentId)
      .where(sql`${t.deletedAt} is null`),
    index('project_members_student_idx').on(t.studentId),
  ],
);

export const projectInvitations = pgTable(
  'project_invitations',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    status: invitationStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('project_invitations_pending_uq')
      .on(t.projectId, t.studentId)
      .where(sql`${t.status} = 'pending'`),
    index('project_invitations_student_idx').on(t.studentId),
  ],
);
