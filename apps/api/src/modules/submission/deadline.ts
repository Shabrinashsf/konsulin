// derived on read, so extending a deadline relabels the folder
export function deadlineStatus(
    deadlineAt: Date | null,
    firstUploadAt: Date | null,
    now: Date,
) {
    if (!deadlineAt) return 'none';
    if (firstUploadAt)
        return firstUploadAt <= deadlineAt ? 'submitted' : 'late';
    return deadlineAt < now ? 'overdue' : 'upcoming';
}

export const isLate = (uploadedAt: Date, deadlineAt: Date | null) =>
    deadlineAt !== null && uploadedAt > deadlineAt;
