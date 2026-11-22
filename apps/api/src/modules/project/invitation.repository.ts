import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { InvitationView } from './invitation-state';
import type { Page } from './project.repository';

// determine which columns are retrieved from the database each time we load the student
const STUDENT_SELECT = {
    id: true,
    name: true,
    nrp: true,
    cohortYear: true,
    studyProgram: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

// determine which columns are retrieved from the database each time we load the invitation
const INVITATION_SELECT = {
    id: true,
    status: true,
    expiresAt: true,
    respondedAt: true,
    createdAt: true,
    student: { select: STUDENT_SELECT },
    project: {
        select: {
            id: true,
            title: true,
            type: true,
            lecturer: { select: { id: true, name: true } },
        },
    },
} satisfies Prisma.ProjectInvitationSelect;

// describing the query result structure for TypeScript (when we use INVITATION_SELECT)
export type InvitationRow = Prisma.ProjectInvitationGetPayload<{
    select: typeof INVITATION_SELECT;
}>;

type Scope = { projectId: string } | { studentId: string };

function statusWhere(
    status: InvitationView | undefined,
    now: Date,
): Prisma.ProjectInvitationWhereInput {
    if (status === 'pending') return { status, expiresAt: { gt: now } };
    if (status === 'expired') {
        return { status: 'pending', expiresAt: { lte: now } };
    }
    return status ? { status } : {};
}

@Injectable()
export class InvitationRepository {
    constructor(private readonly prisma: PrismaService) {}

    findPage(
        scope: Scope,
        status: InvitationView | undefined,
        now: Date,
        page: Page,
    ) {
        const where: Prisma.ProjectInvitationWhereInput = {
            ...scope,
            ...statusWhere(status, now),
            project: { deletedAt: null },
        };
        return this.prisma.$transaction([
            this.prisma.projectInvitation.findMany({
                where,
                select: INVITATION_SELECT,
                orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.projectInvitation.count({ where }),
        ]);
    }

    findOne(id: string, scope: Scope) {
        return this.prisma.projectInvitation.findFirst({
            where: { id, ...scope, project: { deletedAt: null } },
            select: INVITATION_SELECT,
        });
    }

    // active Student that can be invited + email notification
    findStudent(studentId: string) {
        return this.prisma.user.findFirst({
            where: { id: studentId, role: 'student', deletedAt: null },
            select: { ...STUDENT_SELECT, email: true },
        });
    }

    // non expired pending invitations
    countActivePending(
        where: { projectId: string; studentId?: string },
        now = new Date(),
    ) {
        return this.prisma.projectInvitation.count({
            where: { ...where, status: 'pending', expiresAt: { gt: now } },
        });
    }

    create(projectId: string, studentId: string, now: Date, expiresAt: Date) {
        return this.prisma.$transaction(async (tx) => {
            // long pending invitations that have expired are closed to
            // prevent conflicts with the partial unique index `invitation_pending_uq`
            await tx.projectInvitation.updateMany({
                where: {
                    projectId,
                    studentId,
                    status: 'pending',
                    expiresAt: { lte: now },
                },
                data: { status: 'revoked' },
            });
            return tx.projectInvitation.create({
                data: { projectId, studentId, expiresAt },
                select: INVITATION_SELECT,
            });
        });
    }

    // atomic claim: only non expired pending that can change status
    // accept + make a membership in sam etransaction
    transition(
        invitation: InvitationRow,
        status: 'accepted' | 'declined' | 'revoked',
        now: Date,
    ) {
        return this.prisma.$transaction(async (tx) => {
            const { count } = await tx.projectInvitation.updateMany({
                where: {
                    id: invitation.id,
                    status: 'pending',
                    expiresAt: { gt: now },
                },
                data: {
                    status,
                    respondedAt: status === 'revoked' ? null : now,
                },
            });
            if (count === 0) return null;
            if (status === 'accepted') {
                await tx.projectMember.createMany({
                    data: [
                        {
                            projectId: invitation.project.id,
                            studentId: invitation.student.id,
                        },
                    ],
                    skipDuplicates: true,
                });
            }
            return tx.projectInvitation.findUniqueOrThrow({
                where: { id: invitation.id },
                select: INVITATION_SELECT,
            });
        });
    }
}
