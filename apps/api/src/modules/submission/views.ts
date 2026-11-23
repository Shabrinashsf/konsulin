import { deadlineStatus, isLate } from './deadline';
import type { FolderRow, VersionRow } from './submission.repository';

// change raw database rows to the response form sent to the client
export const toFolderView = (
    { versions, _count, ...f }: FolderRow,
    now: Date,
) => ({
    ...f,
    versionCount: _count.versions,
    deadlineStatus: deadlineStatus(
        f.deadlineAt,
        versions[0]?.createdAt ?? null,
        now,
    ),
});

// change raw database rows to the response form sent to the client
export const toVersionView = (
    { _count, sizeBytes, ...v }: VersionRow,
    deadlineAt: Date | null,
) => ({
    ...v,
    sizeBytes: Number(sizeBytes),
    feedbackCount: _count.feedbacks,
    late: isLate(v.createdAt, deadlineAt),
});
