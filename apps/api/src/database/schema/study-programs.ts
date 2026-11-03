import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { createdAt, id } from './_columns';
import { degreeEnum } from './enums';

export const studyPrograms = pgTable('study_programs', {
  id: id(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 150 }).notNull(),
  degree: degreeEnum('degree').notNull(),
  createdAt: createdAt(),
});
