import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { lockLecturer } from '../../prisma/lock-lecturer';
import { PrismaService } from '../../prisma/prisma.service';
import type { Page } from '../../shared/http/pagination-query.dto';
import { formatDateOnly, parseDateOnly } from '../../shared/time/time';
import {
    CANCEL_REASON,
    cancelConsultations,
    CANCELLED_SELECT,
    type CancelledRow,
} from '../../shared/consultation/cancellation';
import { affectedWhere } from './blackout-impact';

// determine which columns are retrieved from the database each time we load the blackout date
const BLACKOUT_SELECT = {
    id: true,
    date: true,
    reason: true,
    createdAt: true,
} satisfies Prisma.BlackoutDateSelect;

// describing the query result structure for TypeScript (when we use BLACKOUT_SELECT)
export type BlackoutRow = Prisma.BlackoutDateGetPayload<{
    select: typeof BLACKOUT_SELECT;
}>;

export interface CreateRangeInput {
    lecturerId: string;
    from: string;
    to: string;
    dates: string[];
    reason: string | null;
    cancelConsultations: boolean;
    now: Date;
}

export type CreateRangeResult =
    | { conflict: CancelledRow[] }
    | { created: string[]; skipped: string[]; cancelled: CancelledRow[] };

@Injectable()
export class BlackoutDateRepository {
    constructor(private readonly prisma: PrismaService) {}

    // `from`/`to` are inclusive DATE values (UTC midnight)
    findPage(
        lecturerId: string,
        range: { from?: Date; to?: Date },
        page: Page,
    ) {
        const where: Prisma.BlackoutDateWhereInput = {
            lecturerId,
            date: { gte: range.from, lte: range.to },
        };
        return this.prisma.$transaction([
            this.prisma.blackoutDate.findMany({
                where,
                select: BLACKOUT_SELECT,
                orderBy: { date: page.order },
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.blackoutDate.count({ where }),
        ]);
    }

    findDates(lecturerId: string, from: Date, to: Date) {
        return this.prisma.blackoutDate.findMany({
            where: { lecturerId, date: { gte: from, lte: to } },
            select: { date: true },
        });
    }

    // Blacklist a range in one transaction. Affected consultations
    // are returned as a conflict unless `cancelConsultations`, in which case
    // they are cancelled together with the insert. Dates already
    // blacklisted are skipped.
    createRange(input: CreateRangeInput): Promise<CreateRangeResult> {
        const { lecturerId, dates } = input;
        return this.prisma.$transaction(async (tx) => {
            // serialize blackout changes of the same lecturer
            await lockLecturer(tx, lecturerId);

            const where = affectedWhere(
                lecturerId,
                input.from,
                input.to,
                input.now,
            );
            if (!input.cancelConsultations) {
                const conflict = await tx.consultation.findMany({
                    where,
                    select: CANCELLED_SELECT,
                    orderBy: [{ sortAt: 'asc' }, { id: 'asc' }],
                });
                if (conflict.length > 0) return { conflict };
            }
            const affected = await cancelConsultations(
                tx,
                where,
                CANCEL_REASON.blackout,
            );

            const existing = await tx.blackoutDate.findMany({
                where: { lecturerId, date: { in: dates.map(parseDateOnly) } },
                select: { date: true },
            });
            const skipped = existing.map((e) => formatDateOnly(e.date));
            const created = dates.filter((d) => !skipped.includes(d));
            await tx.blackoutDate.createMany({
                data: created.map((d) => ({
                    lecturerId,
                    date: parseDateOnly(d),
                    reason: input.reason,
                })),
            });
            return { created, skipped: skipped.sort(), cancelled: affected };
        });
    }

    // removes a lecturer's blackout dates in [from, to]; returns the dates removed
    deleteRange(lecturerId: string, from: Date, to: Date) {
        return this.prisma.$transaction(async (tx) => {
            const where = { lecturerId, date: { gte: from, lte: to } };
            const rows = await tx.blackoutDate.findMany({
                where,
                select: { date: true },
                orderBy: { date: 'asc' },
            });
            await tx.blackoutDate.deleteMany({ where });
            return rows.map((r) => formatDateOnly(r.date));
        });
    }
}
