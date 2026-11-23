import type { RevisionItemStatus } from '../../generated/prisma/client';

export const REVIEW_DECISIONS = ['verify', 'reopen'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

// open/reopened -> addressed (student); addressed -> verified/reopened (lecturer)
export const canAddress = (status: RevisionItemStatus) =>
    status === 'open' || status === 'reopened';
export const canReview = (status: RevisionItemStatus) => status === 'addressed';

export const reviewedStatus = (decision: ReviewDecision): RevisionItemStatus =>
    decision === 'verify' ? 'verified' : 'reopened';

// the fix must be newer than the feedback's version and, after a reopen, newer than the version claimed last time
export const isNewerFix = (
    item: { addressedInVersion: { versionNumber: number } | null },
    feedbackVersion: number,
    chosenVersion: number,
) =>
    chosenVersion > (item.addressedInVersion?.versionNumber ?? feedbackVersion);
