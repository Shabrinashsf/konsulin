import type { Prisma } from '../../generated/prisma/client';
import { formatDateOnly, parseDateOnly, toJakartaDate } from '../time/time';
import { PROJECT_TYPE_RULES } from '../../modules/project/project-type-rules';
import { ConsultationCancelledEvent } from './consultation-cancelled.event';

export const CANCEL_REASON = {
    blackout: 'Dosen berhalangan pada tanggal tersebut',
    memberRemoved: 'Mahasiswa tidak lagi menjadi anggota project',
    projectDeleted: 'Project telah dihapus oleh dosen',
} as const;

export const CANCELLED_SELECT = {
    id: true,
    status: true,
    topic: true,
    requestedDate: true,
    startAt: true,
    endAt: true,
    location: true,
    icsSequence: true,
    project: { select: { id: true, title: true, type: true } },
    lecturer: { select: { id: true, name: true, email: true } },
    student: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ConsultationSelect;

export type CancelledRow = Prisma.ConsultationGetPayload<{
    select: typeof CANCELLED_SELECT;
}>;

// consultations that can still be cancelled: requested and not expired, or approved and not started yet
export const cancellableWhere = (now: Date): Prisma.ConsultationWhereInput => ({
    OR: [
        {
            status: 'requested',
            OR: [
                { requestedDate: { gte: parseDateOnly(toJakartaDate(now)) } },
                { startAt: { gte: now } },
            ],
        },
        { status: 'approved', startAt: { gt: now } },
    ],
});

// cancel every consultation matching `where` inside `tx`; returns them
export async function cancelConsultations(
    tx: Prisma.TransactionClient,
    where: Prisma.ConsultationWhereInput,
    reason: string | null,
) {
    const rows = await tx.consultation.findMany({
        where,
        select: CANCELLED_SELECT,
        orderBy: [{ sortAt: 'asc' }, { id: 'asc' }],
    });
    if (rows.length > 0) {
        await tx.consultation.updateMany({
            where: { id: { in: rows.map((r) => r.id) } },
            data: { status: 'cancelled', statusReason: reason },
        });
    }
    return rows;
}

export const toCancelledEvent = (
    c: CancelledRow,
    reason: string | null,
    cancelledBy: 'lecturer' | 'student',
) =>
    new ConsultationCancelledEvent(
        c.id,
        {
            id: c.project.id,
            title: c.project.title,
            trackMode: PROJECT_TYPE_RULES[c.project.type].trackMode,
        },
        c.lecturer,
        c.student,
        c.topic,
        formatDateOnly(c.requestedDate),
        c.startAt,
        c.endAt,
        c.location,
        // only an approved consultation reached the calendars
        c.status === 'approved',
        c.icsSequence,
        reason,
        cancelledBy,
    );
