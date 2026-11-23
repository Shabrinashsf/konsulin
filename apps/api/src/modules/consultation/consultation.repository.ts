import { Injectable } from '@nestjs/common';
import { type ConsultationMode, Prisma } from '../../generated/prisma/client';
import { containsText } from '../../prisma/contains-text';
import { lockLecturer } from '../../prisma/lock-lecturer';
import { PrismaService } from '../../prisma/prisma.service';
import {
    cancelConsultations,
    cancellableWhere,
} from '../../shared/consultation/cancellation';
import type { Page } from '../../shared/http/pagination-query.dto';
import {
    addDays,
    jakartaDateTime,
    parseDateOnly,
    toJakartaDate,
} from '../../shared/time/time';
import type { ConsultationView, Party } from './consultation-state';

// determine which columns are retrieved from the database each time we load the consultation
const CONSULTATION_SELECT = {
    id: true,
    projectId: true,
    lecturerId: true,
    studentId: true,
    status: true,
    mode: true,
    topic: true,
    agenda: true,
    note: true,
    requestedDate: true,
    proposedBy: true,
    startAt: true,
    endAt: true,
    location: true,
    statusReason: true,
    summary: true,
    icsSequence: true,
    createdAt: true,
    updatedAt: true,
    project: { select: { id: true, title: true, type: true } },
    lecturer: { select: { id: true, name: true, email: true } },
    student: { select: { id: true, name: true, nrp: true, email: true } },
} satisfies Prisma.ConsultationSelect;

// describing the query result structure for TypeScript (when we use CONSULTATION_SELECT)
export type ConsultationRow = Prisma.ConsultationGetPayload<{
    select: typeof CONSULTATION_SELECT;
}>;

// a write that may fail on a business rule checked under the lecturer lock
export type WriteResult =
    | ConsultationRow
    | 'DATE_BLACKLISTED'
    | 'OVERLAP'
    | 'PENDING_EXISTS'
    | 'STALE';

export interface ListFilter {
    status?: ConsultationView;
    from?: string; // WIB dates on sort_at, inclusive
    to?: string;
    topic?: string;
    topicOrSummary?: string;
}

// `expired` is derived, so it is filtered on the raw columns
function statusWhere(
    status: ConsultationView | undefined,
    now: Date,
): Prisma.ConsultationWhereInput {
    const today = parseDateOnly(toJakartaDate(now));
    const live: Prisma.ConsultationWhereInput[] = [
        { requestedDate: { gte: today } },
        { startAt: { gte: now } },
    ];
    if (status === 'requested') return { status, OR: live };
    // written without NOT: start_at is NULL when nothing was proposed
    if (status === 'expired') {
        return {
            status: 'requested',
            requestedDate: { lt: today },
            OR: [{ startAt: null }, { startAt: { lt: now } }],
        };
    }
    return status ? { status } : {};
}

export function filterWhere(
    f: ListFilter,
    now: Date,
): Prisma.ConsultationWhereInput[] {
    return [
        statusWhere(f.status, now),
        f.from ? { sortAt: { gte: jakartaDateTime(f.from, '00:00') } } : {},
        f.to
            ? { sortAt: { lt: jakartaDateTime(addDays(f.to, 1), '00:00') } }
            : {},
        f.topic ? { topic: containsText(f.topic) } : {},
        f.topicOrSummary
            ? {
                  OR: [
                      { topic: containsText(f.topicOrSummary) },
                      { summary: containsText(f.topicOrSummary) },
                  ],
              }
            : {},
    ];
}

// SQLSTATE 23P01 (consultations_no_overlap) surfaces as P2039 via the pg adapter
function isOverlapViolation(e: unknown) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return false;
    const meta = e.meta as
        | { driverAdapterError?: { cause?: { originalCode?: string } } }
        | undefined;
    return meta?.driverAdapterError?.cause?.originalCode === '23P01';
}

// `date` is a WIB 'YYYY-MM-DD'
const isBlacklisted = async (
    tx: Prisma.TransactionClient,
    lecturerId: string,
    date: string,
) =>
    (await tx.blackoutDate.count({
        where: { lecturerId, date: parseDateOnly(date) },
    })) > 0;

// another approved consultation of the lecturer overlapping [start, end)
const hasOverlap = async (
    tx: Prisma.TransactionClient,
    lecturerId: string,
    start: Date,
    end: Date,
    excludeId?: string,
) =>
    (await tx.consultation.count({
        where: {
            lecturerId,
            status: 'approved',
            id: excludeId ? { not: excludeId } : undefined,
            startAt: { lt: end },
            endAt: { gt: start },
        },
    })) > 0;

export interface TimeData {
    startAt: Date;
    endAt: Date;
    location?: string;
    mode?: ConsultationMode;
}

@Injectable()
export class ConsultationRepository {
    constructor(private readonly prisma: PrismaService) {}

    // consultations of deleted projects do not exist
    findById(id: string) {
        return this.prisma.consultation.findFirst({
            where: { id, project: { deletedAt: null } },
            select: CONSULTATION_SELECT,
        });
    }

    findPage(
        where: Prisma.ConsultationWhereInput,
        orderBy: Prisma.ConsultationOrderByWithRelationInput,
        page: Page,
    ) {
        const scoped = { AND: [where, { project: { deletedAt: null } }] };
        return this.prisma.$transaction([
            this.prisma.consultation.findMany({
                where: scoped,
                select: CONSULTATION_SELECT,
                orderBy: [orderBy, { id: 'asc' }],
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.consultation.count({ where: scoped }),
        ]);
    }

    // Student request
    create(
        data: {
            projectId: string;
            lecturerId: string;
            studentId: string;
            requestedDate: string;
            topic: string;
            agenda: string;
            mode: ConsultationMode;
            note: string | null;
        },
        now: Date,
    ): Promise<WriteResult> {
        return this.prisma.$transaction(async (tx) => {
            await lockLecturer(tx, data.lecturerId);
            const pending = await tx.consultation.count({
                where: {
                    projectId: data.projectId,
                    studentId: data.studentId,
                    status: 'requested',
                    AND: [cancellableWhere(now)],
                },
            });
            if (pending > 0) return 'PENDING_EXISTS';
            if (await isBlacklisted(tx, data.lecturerId, data.requestedDate)) {
                return 'DATE_BLACKLISTED';
            }
            return tx.consultation.create({
                data: {
                    ...data,
                    requestedDate: parseDateOnly(data.requestedDate),
                },
                select: CONSULTATION_SELECT,
            });
        });
    }

    // Lecturer schedules directly → approved
    schedule(data: {
        projectId: string;
        lecturerId: string;
        studentId: string;
        topic: string;
        agenda: string;
        mode: ConsultationMode;
        location: string;
        startAt: Date;
        endAt: Date;
    }): Promise<WriteResult> {
        return this.write(async (tx) => {
            await lockLecturer(tx, data.lecturerId);
            if (
                await isBlacklisted(
                    tx,
                    data.lecturerId,
                    toJakartaDate(data.startAt),
                )
            ) {
                return 'DATE_BLACKLISTED';
            }
            if (
                await hasOverlap(tx, data.lecturerId, data.startAt, data.endAt)
            ) {
                return 'OVERLAP';
            }
            return tx.consultation.create({
                data: {
                    ...data,
                    status: 'approved',
                    proposedBy: 'lecturer',
                    requestedDate: parseDateOnly(toJakartaDate(data.startAt)),
                },
                select: CONSULTATION_SELECT,
            });
        });
    }

    // new time proposal; claims the turn it was checked against
    propose(
        c: ConsultationRow,
        by: Party,
        data: TimeData,
    ): Promise<WriteResult> {
        return this.write(async (tx) => {
            await lockLecturer(tx, c.lecturerId);
            if (
                await isBlacklisted(
                    tx,
                    c.lecturerId,
                    toJakartaDate(data.startAt),
                )
            ) {
                return 'DATE_BLACKLISTED';
            }
            if (await hasOverlap(tx, c.lecturerId, data.startAt, data.endAt)) {
                return 'OVERLAP';
            }
            const { count } = await tx.consultation.updateMany({
                where: {
                    id: c.id,
                    status: 'requested',
                    proposedBy: c.proposedBy,
                },
                data: { ...data, proposedBy: by },
            });
            if (count === 0) return 'STALE';
            return this.reload(tx, c.id);
        });
    }

    // accept the other party's proposal → approved
    accept(c: ConsultationRow, location: string): Promise<WriteResult> {
        return this.write(async (tx) => {
            await lockLecturer(tx, c.lecturerId);
            if (await hasOverlap(tx, c.lecturerId, c.startAt!, c.endAt!)) {
                return 'OVERLAP';
            }
            const { count } = await tx.consultation.updateMany({
                where: {
                    id: c.id,
                    status: 'requested',
                    proposedBy: c.proposedBy,
                    startAt: c.startAt,
                },
                data: { status: 'approved', location },
            });
            if (count === 0) return 'STALE';
            return this.reload(tx, c.id);
        });
    }

    async reject(c: ConsultationRow, reason: string): Promise<WriteResult> {
        const { count } = await this.prisma.consultation.updateMany({
            where: {
                id: c.id,
                status: 'requested',
                proposedBy: c.proposedBy,
            },
            data: { status: 'rejected', statusReason: reason },
        });
        return count === 0 ? 'STALE' : (await this.findById(c.id))!;
    }

    // new time for an approved consultation
    reschedule(c: ConsultationRow, data: TimeData): Promise<WriteResult> {
        return this.write(async (tx) => {
            await lockLecturer(tx, c.lecturerId);
            if (
                await isBlacklisted(
                    tx,
                    c.lecturerId,
                    toJakartaDate(data.startAt),
                )
            ) {
                return 'DATE_BLACKLISTED';
            }
            if (
                await hasOverlap(
                    tx,
                    c.lecturerId,
                    data.startAt,
                    data.endAt,
                    c.id,
                )
            ) {
                return 'OVERLAP';
            }
            const { count } = await tx.consultation.updateMany({
                where: { id: c.id, status: 'approved' },
                data: {
                    ...data,
                    icsSequence: { increment: 1 },
                    // the H-1 reminder must go out again for the new time
                    reminderSentAt: null,
                },
            });
            if (count === 0) return 'STALE';
            return this.reload(tx, c.id);
        });
    }

    // null when it is no longer cancellable (changed meanwhile)
    async cancel(id: string, reason: string | null, now: Date) {
        const [row] = await this.prisma.$transaction((tx) =>
            cancelConsultations(
                tx,
                { id, AND: [cancellableWhere(now)] },
                reason,
            ),
        );
        return row ?? null;
    }

    async complete(
        c: ConsultationRow,
        summary: string,
        now: Date,
    ): Promise<WriteResult> {
        const { count } = await this.prisma.consultation.updateMany({
            where: { id: c.id, status: 'approved', startAt: { lte: now } },
            data: { status: 'completed', summary },
        });
        return count === 0 ? 'STALE' : (await this.findById(c.id))!;
    }

    private reload(tx: Prisma.TransactionClient, id: string) {
        return tx.consultation.findUniqueOrThrow({
            where: { id },
            select: CONSULTATION_SELECT,
        });
    }

    // the exclusion constraint is the last guard
    private async write(
        fn: (tx: Prisma.TransactionClient) => Promise<WriteResult>,
    ): Promise<WriteResult> {
        try {
            return await this.prisma.$transaction(fn);
        } catch (e) {
            if (isOverlapViolation(e)) return 'OVERLAP';
            throw e;
        }
    }
}
