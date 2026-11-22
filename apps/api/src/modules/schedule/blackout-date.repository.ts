import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Page } from '../../shared/http/pagination-query.dto';
import { formatDateOnly, parseDateOnly } from '../../shared/time/time';
import {
    AFFECTED_SELECT,
    type AffectedRow,
    affectedWhere,
    BLACKOUT_CANCEL_REASON,
} from './blackout-impact';

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
    | { conflict: AffectedRow[] }
    | { created: string[]; skipped: string[]; cancelled: AffectedRow[] };

const isPrismaError = (e: unknown, code: string) =>
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

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
            await tx.$queryRaw`SELECT id FROM users WHERE id = ${lecturerId}::uuid FOR UPDATE`;

            const affected = await tx.consultation.findMany({
                where: affectedWhere(
                    lecturerId,
                    input.from,
                    input.to,
                    input.now,
                ),
                select: AFFECTED_SELECT,
                orderBy: [{ requestedDate: 'asc' }, { startAt: 'asc' }],
            });
            if (affected.length > 0 && !input.cancelConsultations) {
                return { conflict: affected };
            }
            if (affected.length > 0) {
                await tx.consultation.updateMany({
                    where: { id: { in: affected.map((c) => c.id) } },
                    data: {
                        status: 'cancelled',
                        statusReason: BLACKOUT_CANCEL_REASON,
                    },
                });
            }

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

    // null when it does not exist or belongs to another lecturer
    async delete(id: string, lecturerId: string) {
        try {
            return await this.prisma.blackoutDate.delete({
                where: { id, lecturerId },
                select: BLACKOUT_SELECT,
            });
        } catch (e) {
            if (isPrismaError(e, 'P2025')) return null;
            throw e;
        }
    }
}
