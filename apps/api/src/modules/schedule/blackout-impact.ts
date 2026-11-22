import type { Prisma } from '../../generated/prisma/client';
import {
    addDays,
    jakartaDateTime,
    parseDateOnly,
} from '../../shared/time/time';

export const BLACKOUT_CANCEL_REASON = 'Dosen berhalangan pada tanggal tersebut';

export const AFFECTED_SELECT = {
    id: true,
    status: true,
    topic: true,
    requestedDate: true,
    startAt: true,
    endAt: true,
    project: { select: { id: true, title: true } },
    lecturer: { select: { id: true, name: true } },
    student: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ConsultationSelect;

export type AffectedRow = Prisma.ConsultationGetPayload<{
    select: typeof AFFECTED_SELECT;
}>;

// consultations a blackout of [from, to] (WIB dates) would cancel:
// approved, not started yet, with its time in the range
// requested with a proposed time in the range
// requested without a proposed time, requested for a date in the range
export function affectedWhere(
    lecturerId: string,
    from: string,
    to: string,
    now: Date,
): Prisma.ConsultationWhereInput {
    const inRange = {
        gte: jakartaDateTime(from, '00:00'),
        lt: jakartaDateTime(addDays(to, 1), '00:00'),
    };
    return {
        lecturerId,
        project: { deletedAt: null },
        OR: [
            { status: 'approved', startAt: { ...inRange, gt: now } },
            { status: 'requested', startAt: inRange },
            {
                status: 'requested',
                startAt: null,
                requestedDate: {
                    gte: parseDateOnly(from),
                    lte: parseDateOnly(to),
                },
            },
        ],
    };
}
