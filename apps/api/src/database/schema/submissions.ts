import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, id, updatedAt } from './_columns';
import { projects } from './projects';
import { users } from './users';

export const submissionFolders = pgTable(
  'submission_folders',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    studentId: uuid('student_id').references(() => users.id), // null jika project shared
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('submission_folders_project_idx').on(t.projectId),
    index('submission_folders_student_idx').on(t.studentId),
  ],
);

export const submissionVersions = pgTable(
  'submission_versions',
  {
    id: id(),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => submissionFolders.id),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    versionNumber: integer('version_number').notNull(),
    note: text('note'),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    storedKey: varchar('stored_key', { length: 512 }).notNull(),
    mimeType: varchar('mime_type', { length: 127 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('submission_versions_folder_version_uq').on(
      t.folderId,
      t.versionNumber,
    ),
  ],
);
