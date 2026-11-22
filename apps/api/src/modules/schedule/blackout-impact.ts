import type { Prisma } from '../../generated/prisma/client';
import { cancellableWhere } from '../../shared/consultation/cancellation';
import {
    addDays,
    jakartaDateTime,
    parseDateOnly,
} from '../../shared/time/time';

// still-cancellable consultations a blackout of [from, to] (WIB dates) would cancel:
// - approved with its time in the range (not started: cancellableWhere)
// - requested with a proposed time in the range
// - requested without a proposed time, requested for a date in the range
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
        AND: [
            cancellableWhere(now),
            {
                OR: [
                    { status: 'approved', startAt: inRange },
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
            },
        ],
    };
}
