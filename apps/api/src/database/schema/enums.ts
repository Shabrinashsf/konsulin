import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['student', 'lecturer']);
export const degreeEnum = pgEnum('degree', ['S1', 'S2', 'S3']);
export const projectTypeEnum = pgEnum('project_type', [
  's1_thesis_proposal',
  's1_thesis',
  's2_thesis_proposal',
  's2_thesis',
  's3_dissertation_proposal',
  's3_dissertation',
  'research',
  'publication',
  'competition',
  'external_project',
]);
export const trackModeEnum = pgEnum('track_mode', ['individual', 'shared']);
export const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'declined',
  'revoked',
]);
export const consultationOriginEnum = pgEnum('consultation_origin', [
  'student_request',
  'lecturer_scheduled',
]);
export const consultationStatusEnum = pgEnum('consultation_status', [
  'requested',
  'approved',
  'rejected',
  'completed',
  'cancelled',
]);
export const consultationModeEnum = pgEnum('consultation_mode', [
  'offline',
  'online',
]);
export const revisionStatusEnum = pgEnum('revision_status', [
  'open',
  'addressed',
  'verified',
  'reopened',
]);
export const emailStatusEnum = pgEnum('email_status', [
  'pending',
  'sent',
  'failed',
]);
