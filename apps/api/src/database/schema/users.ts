import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, id, updatedAt } from './_columns';
import { userRoleEnum } from './enums';
import { studyPrograms } from './study-programs';

export const users = pgTable(
  'users',
  {
    id: id(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    fullName: varchar('full_name', { length: 100 }).notNull(),
    role: userRoleEnum('role').notNull(),
    nrp: varchar('nrp', { length: 10 }),
    nip: varchar('nip', { length: 30 }),
    studyProgramId: uuid('study_program_id').references(() => studyPrograms.id),
    cohortYear: smallint('cohort_year'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('users_email_uq')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null`),
    uniqueIndex('users_nrp_uq')
      .on(t.nrp)
      .where(sql`${t.nrp} is not null and ${t.deletedAt} is null`),
    uniqueIndex('users_nip_uq')
      .on(t.nip)
      .where(sql`${t.nip} is not null and ${t.deletedAt} is null`),
    check(
      'users_profile_by_role',
      sql`(${t.role} = 'student' and ${t.studyProgramId} is not null and ${t.cohortYear} is not null and ${t.nrp} is not null)
          or (${t.role} = 'lecturer' and ${t.studyProgramId} is null and ${t.cohortYear} is null)`,
    ),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: varchar('user_agent', { length: 512 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: createdAt(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId)],
);
