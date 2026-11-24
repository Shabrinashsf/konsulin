import { deadlineStatus, isLate } from './deadline';
import type { FolderRow, VersionRow } from './submission.repository';
import type {
    FolderResponseDto,
    VersionResponseDto,
} from './dto/submission-response.dto';

// change raw database rows to the response form sent to the client
export const toFolderView = (
    { versions, _count, ...f }: FolderRow,
    now: Date,
): FolderResponseDto => ({
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
): VersionResponseDto => ({
    ...v,
    sizeBytes: Number(sizeBytes),
    feedbackCount: _count.feedbacks,
    late: isLate(v.createdAt, deadlineAt),
});
