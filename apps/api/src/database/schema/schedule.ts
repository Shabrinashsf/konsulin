import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  pgTable,
  smallint,
  time,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, id } from './_columns';
import { users } from './users';

export const officeHours = pgTable(
  'office_hours',
  {
    id: id(),
    lecturerId: uuid('lecturer_id')
      .notNull()
      .references(() => users.id),
    dayOfWeek: smallint('day_of_week').notNull(), // 1=Senin ... 7=Minggu
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    slotMinutes: smallint('slot_minutes').notNull(),
    defaultLocation: varchar('default_location', { length: 255 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('office_hours_lecturer_idx').on(t.lecturerId),
    check(
      'office_hours_valid',
      sql`${t.endTime} > ${t.startTime} and ${t.dayOfWeek} between 1 and 7 and ${t.slotMinutes} in (15, 30, 45, 60)`,
    ),
  ],
);

export const blackoutDates = pgTable(
  'blackout_dates',
  {
    id: id(),
    lecturerId: uuid('lecturer_id')
      .notNull()
      .references(() => users.id),
    date: date('date').notNull(),
    reason: varchar('reason', { length: 255 }),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex('blackout_dates_uq')
      .on(t.lecturerId, t.date)
      .where(sql`${t.deletedAt} is null`),
  ],
);
