import { Injectable } from '@nestjs/common';
import type { Prisma, StorageDriver } from '../../generated/prisma/client';
import { containsText } from '../../prisma/contains-text';
import { PrismaService } from '../../prisma/prisma.service';
import type { Page } from '../../shared/http/pagination-query.dto';

// folders of deleted projects, and deleted folders, do not exist
const LIVE_FOLDER = {
    deletedAt: null,
    project: { deletedAt: null },
} satisfies Prisma.SubmissionFolderWhereInput;

// determine which columns are retrieved each time we load a folder
const FOLDER_SELECT = {
    id: true,
    projectId: true,
    studentId: true,
    createdBy: true,
    title: true,
    description: true,
    deadlineAt: true,
    createdAt: true,
    updatedAt: true,
    project: {
        select: {
            title: true,
            type: true,
            lecturer: { select: { id: true, name: true, email: true } },
        },
    },
    student: { select: { id: true, name: true, nrp: true } },
    creator: { select: { id: true, name: true, role: true } },
    // the first upload decides submitted/late
    versions: {
        select: { createdAt: true },
        orderBy: { versionNumber: 'asc' },
        take: 1,
    },
    _count: { select: { versions: true } },
} satisfies Prisma.SubmissionFolderSelect;

export type FolderRow = Prisma.SubmissionFolderGetPayload<{
    select: typeof FOLDER_SELECT;
}>;

// storage columns are left out: they never reach the client
const VERSION_SELECT = {
    id: true,
    folderId: true,
    versionNumber: true,
    note: true,
    originalName: true,
    mimeType: true,
    sizeBytes: true,
    createdAt: true,
    uploader: { select: { id: true, name: true } },
    _count: { select: { feedbacks: true } },
} satisfies Prisma.SubmissionVersionSelect;

export type VersionRow = Prisma.SubmissionVersionGetPayload<{
    select: typeof VERSION_SELECT;
}> & { openRevisions: number };

export interface FolderFilter {
    projectId: string;
    ownerId?: string; // scope of a student on an individual project
    studentId?: string;
    q?: string;
    hasDeadline?: boolean;
    overdue?: boolean;
}

export interface FolderData {
    projectId: string;
    studentId: string | null;
    createdBy: string;
    title: string;
    description: string | null;
    deadlineAt: Date | null;
}

export interface VersionData {
    folderId: string;
    uploadedBy: string;
    note: string | null;
    originalName: string;
    storageDriver: StorageDriver;
    storedKey: string;
    mimeType: string;
    sizeBytes: number;
}

// overdue = deadline passed and nothing uploaded; the negation is written out because NOT over a NULL deadline drops the row in SQL
const overdueWhere = (overdue: boolean, now: Date) =>
    overdue
        ? { deadlineAt: { lt: now }, versions: { none: {} } }
        : {
              OR: [
                  { deadlineAt: null },
                  { deadlineAt: { gte: now } },
                  { versions: { some: {} } },
              ],
          };

@Injectable()
export class SubmissionRepository {
    constructor(private readonly prisma: PrismaService) {}

    findFolder(id: string) {
        return this.prisma.submissionFolder.findFirst({
            where: { id, ...LIVE_FOLDER },
            select: FOLDER_SELECT,
        });
    }

    // current member with an active account
    async isMember(projectId: string, studentId: string) {
        const member = await this.prisma.projectMember.findFirst({
            where: { projectId, studentId, student: { deletedAt: null } },
            select: { projectId: true },
        });
        return member !== null;
    }

    findFolderPage(
        f: FolderFilter,
        page: Page & { sort?: 'createdAt' | 'deadline' },
        now: Date,
    ) {
        const where: Prisma.SubmissionFolderWhereInput = {
            projectId: f.projectId,
            ...LIVE_FOLDER,
            AND: [
                f.ownerId ? { studentId: f.ownerId } : {},
                f.studentId ? { studentId: f.studentId } : {},
                f.q ? { title: containsText(f.q) } : {},
                f.hasDeadline === undefined
                    ? {}
                    : { deadlineAt: f.hasDeadline ? { not: null } : null },
                f.overdue === undefined ? {} : overdueWhere(f.overdue, now),
            ],
        };
        const orderBy: Prisma.SubmissionFolderOrderByWithRelationInput =
            page.sort === 'deadline'
                ? { deadlineAt: { sort: page.order, nulls: 'last' } }
                : { createdAt: page.order };
        return this.prisma.$transaction([
            this.prisma.submissionFolder.findMany({
                where,
                select: FOLDER_SELECT,
                orderBy: [orderBy, { id: 'asc' }],
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.submissionFolder.count({ where }),
        ]);
    }

    createFolder(data: FolderData) {
        return this.prisma.submissionFolder.create({
            data,
            select: FOLDER_SELECT,
        });
    }

    updateFolder(
        id: string,
        data: Partial<Pick<FolderData, 'title' | 'description' | 'deadlineAt'>>,
    ) {
        return this.prisma.submissionFolder.update({
            where: { id },
            data,
            select: FOLDER_SELECT,
        });
    }

    // serialized with uploads by the folder row lock
    softDeleteFolder(id: string, onlyIfEmpty: boolean, now: Date) {
        return this.prisma.$transaction(async (tx) => {
            await lockFolder(tx, id);
            const folder = await tx.submissionFolder.findFirst({
                where: { id, ...LIVE_FOLDER },
                select: { _count: { select: { versions: true } } },
            });
            if (!folder) return 'GONE';
            if (onlyIfEmpty && folder._count.versions > 0) {
                return 'HAS_VERSIONS';
            }
            await tx.submissionFolder.update({
                where: { id },
                data: { deletedAt: now },
            });
            return 'DELETED';
        });
    }

    // number = max + 1 under the folder lock; null when the folder was deleted meanwhile
    createVersion(data: VersionData) {
        return this.prisma.$transaction(async (tx) => {
            await lockFolder(tx, data.folderId);
            const live = await tx.submissionFolder.count({
                where: { id: data.folderId, ...LIVE_FOLDER },
            });
            if (live === 0) return null;
            const { _max } = await tx.submissionVersion.aggregate({
                where: { folderId: data.folderId },
                _max: { versionNumber: true },
            });
            const row = await tx.submissionVersion.create({
                data: { ...data, versionNumber: (_max.versionNumber ?? 0) + 1 },
                select: VERSION_SELECT,
            });
            return { ...row, openRevisions: 0 };
        });
    }

    // with the storage location and what access control needs
    findVersion(id: string) {
        return this.prisma.submissionVersion.findFirst({
            where: { id, folder: LIVE_FOLDER },
            select: {
                originalName: true,
                mimeType: true,
                sizeBytes: true,
                storageDriver: true,
                storedKey: true,
                folder: { select: FOLDER_SELECT },
            },
        });
    }

    async findVersionPage(folderId: string, page: Page) {
        const [rows, total] = await this.prisma.$transaction([
            this.prisma.submissionVersion.findMany({
                where: { folderId },
                select: VERSION_SELECT,
                orderBy: { versionNumber: page.order },
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.submissionVersion.count({ where: { folderId } }),
        ]);
        return [await this.withOpenRevisions(rows), total] as const;
    }

    // open + reopened revision items per version, in one query
    private async withOpenRevisions(
        rows: Omit<VersionRow, 'openRevisions'>[],
    ): Promise<VersionRow[]> {
        const items = await this.prisma.revisionItem.findMany({
            where: {
                status: { in: ['open', 'reopened'] },
                feedback: { versionId: { in: rows.map((r) => r.id) } },
            },
            select: { feedback: { select: { versionId: true } } },
        });
        return rows.map((r) => ({
            ...r,
            openRevisions: items.filter((i) => i.feedback.versionId === r.id)
                .length,
        }));
    }
}

const lockFolder = (tx: Prisma.TransactionClient, id: string) =>
    tx.$queryRaw`SELECT id FROM submission_folders WHERE id = ${id}::uuid FOR UPDATE`;
