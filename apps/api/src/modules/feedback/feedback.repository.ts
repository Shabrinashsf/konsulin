import { Injectable } from '@nestjs/common';
import type { Prisma, RevisionItemStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Page } from '../../shared/http/pagination-query.dto';
import {
    FOLDER_SELECT,
    LIVE_FOLDER,
} from '../submission/submission.repository';

const ITEM_SELECT = {
    id: true,
    feedbackId: true,
    position: true,
    description: true,
    status: true,
    addressedNote: true,
    addressedInVersion: { select: { id: true, versionNumber: true } },
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.RevisionItemSelect;

const FEEDBACK_SELECT = {
    id: true,
    versionId: true,
    content: true,
    createdAt: true,
    updatedAt: true,
    revisionItems: { select: ITEM_SELECT, orderBy: { position: 'asc' } },
} satisfies Prisma.FeedbackSelect;

// an item with where it came from, for lists and write responses
const ITEM_CONTEXT_SELECT = {
    ...ITEM_SELECT,
    feedback: {
        select: {
            version: {
                select: {
                    id: true,
                    versionNumber: true,
                    folder: {
                        select: { id: true, title: true, studentId: true },
                    },
                },
            },
        },
    },
} satisfies Prisma.RevisionItemSelect;

export type ItemContextRow = Prisma.RevisionItemGetPayload<{
    select: typeof ITEM_CONTEXT_SELECT;
}>;

// the version a feedback hangs on, with its folder for access checks
const VERSION_ACCESS_SELECT = {
    id: true,
    versionNumber: true,
    folder: { select: FOLDER_SELECT },
} satisfies Prisma.SubmissionVersionSelect;

const onLiveFolder = { version: { folder: LIVE_FOLDER } };

export interface ItemFilter {
    projectId: string;
    ownerId?: string; // scope of a student on an individual project
    studentId?: string;
    folderId?: string;
    status?: RevisionItemStatus;
}

// write outcomes decided under the feedback row lock
export type LockedResult<T> = T | 'GONE' | 'STALE';

@Injectable()
export class FeedbackRepository {
    constructor(private readonly prisma: PrismaService) {}

    findVersion(id: string) {
        return this.prisma.submissionVersion.findFirst({
            where: { id, folder: LIVE_FOLDER },
            select: VERSION_ACCESS_SELECT,
        });
    }

    // a version of the same folder, to point a fix at
    findFolderVersion(folderId: string, id: string) {
        return this.prisma.submissionVersion.findFirst({
            where: { id, folderId },
            select: { id: true, versionNumber: true },
        });
    }

    findByVersion(versionId: string) {
        return this.prisma.feedback.findMany({
            where: { versionId },
            select: FEEDBACK_SELECT,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        });
    }

    // feedback + its items in one statement
    create(versionId: string, content: string, items: string[]) {
        return this.prisma.feedback.create({
            data: {
                versionId,
                content,
                revisionItems: {
                    create: items.map((description, position) => ({
                        description,
                        position,
                    })),
                },
            },
            select: FEEDBACK_SELECT,
        });
    }

    findFeedback(id: string) {
        return this.prisma.feedback.findFirst({
            where: { id, ...onLiveFolder },
            select: { id: true, version: { select: VERSION_ACCESS_SELECT } },
        });
    }

    updateContent(id: string, content: string) {
        return this.prisma.feedback.update({
            where: { id },
            data: { content },
            select: FEEDBACK_SELECT,
        });
    }

    // only while nothing was worked on; serialized with address
    delete(id: string): Promise<LockedResult<'DELETED'>> {
        return this.prisma.$transaction(async (tx) => {
            if (!(await lockFeedback(tx, id))) return 'GONE';
            const touched = await tx.revisionItem.count({
                where: { feedbackId: id, status: { not: 'open' } },
            });
            if (touched > 0) return 'STALE';
            await tx.feedback.delete({ where: { id } });
            return 'DELETED';
        });
    }

    findItem(id: string) {
        return this.prisma.revisionItem.findFirst({
            where: { id, feedback: onLiveFolder },
            select: {
                ...ITEM_SELECT,
                feedback: {
                    select: { version: { select: VERSION_ACCESS_SELECT } },
                },
            },
        });
    }

    findItemPage(f: ItemFilter, page: Page) {
        const where: Prisma.RevisionItemWhereInput = {
            status: f.status,
            feedback: {
                version: {
                    folderId: f.folderId,
                    folder: {
                        ...LIVE_FOLDER,
                        projectId: f.projectId,
                        AND: [
                            f.ownerId ? { studentId: f.ownerId } : {},
                            f.studentId ? { studentId: f.studentId } : {},
                        ],
                    },
                },
            },
        };
        return this.prisma.$transaction([
            this.prisma.revisionItem.findMany({
                where,
                select: ITEM_CONTEXT_SELECT,
                orderBy: [
                    { createdAt: page.order },
                    { position: 'asc' },
                    { id: 'asc' },
                ],
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.revisionItem.count({ where }),
        ]);
    }

    // claims the status it was checked against; the lock keeps the feedback from being deleted meanwhile
    address(
        item: { id: string; feedbackId: string; status: RevisionItemStatus },
        versionId: string,
        note: string | null,
    ): Promise<LockedResult<ItemContextRow>> {
        return this.prisma.$transaction(async (tx) => {
            if (!(await lockFeedback(tx, item.feedbackId))) return 'GONE';
            const { count } = await tx.revisionItem.updateMany({
                where: { id: item.id, status: item.status },
                data: {
                    status: 'addressed',
                    addressedInVersionId: versionId,
                    addressedNote: note,
                },
            });
            if (count === 0) return 'STALE';
            return tx.revisionItem.findUniqueOrThrow({
                where: { id: item.id },
                select: ITEM_CONTEXT_SELECT,
            });
        });
    }

    // addressed items already block a delete, so no lock is needed
    async review(
        id: string,
        status: RevisionItemStatus,
    ): Promise<LockedResult<ItemContextRow>> {
        const { count } = await this.prisma.revisionItem.updateMany({
            where: { id, status: 'addressed' },
            data: { status },
        });
        if (count === 0) return 'STALE';
        return this.prisma.revisionItem.findUniqueOrThrow({
            where: { id },
            select: ITEM_CONTEXT_SELECT,
        });
    }
}

// false when the feedback no longer exists
const lockFeedback = async (tx: Prisma.TransactionClient, id: string) =>
    (
        await tx.$queryRaw<
            unknown[]
        >`SELECT id FROM feedbacks WHERE id = ${id}::uuid FOR UPDATE`
    ).length > 0;
