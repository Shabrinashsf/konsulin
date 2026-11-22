import { Injectable } from '@nestjs/common';
import type { Prisma, ProjectType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthUser } from '../../shared/auth/auth.decorators';

// determine which columns are retrieved from the database each time we load the project
const PROJECT_SELECT = {
    id: true,
    title: true,
    description: true,
    type: true,
    startDate: true,
    endDate: true,
    createdAt: true,
    updatedAt: true,
    lecturer: { select: { id: true, name: true } },
    _count: {
        select: { members: { where: { student: { deletedAt: null } } } },
    },
} satisfies Prisma.ProjectSelect;

// describing the query result structure for TypeScript (when we use PROJECT_SELECT)
export type ProjectRow = Prisma.ProjectGetPayload<{
    select: typeof PROJECT_SELECT;
}>;

// determine which columns are retrieved from the database each time we load the list of member
const MEMBER_SELECT = {
    joinedAt: true,
    student: {
        select: {
            id: true,
            name: true,
            nrp: true,
            cohortYear: true,
            studyProgram: { select: { id: true, name: true } },
        },
    },
} satisfies Prisma.ProjectMemberSelect;

// describing the query result structure for TypeScript (when we use MEMBER_SELECT)
export type MemberRow = Prisma.ProjectMemberGetPayload<{
    select: typeof MEMBER_SELECT;
}>;

// valid data form that the service can send to the repository
export interface ProjectData {
    title: string;
    description?: string | null;
    type: ProjectType;
    startDate: Date;
    endDate: Date | null;
}

// valid data form that the service can send to the repository
export interface ProjectFilter {
    q?: string;
    type?: ProjectType;
    types?: ProjectType[];
    startFrom?: Date;
    startTo?: Date;
}

// valid data form that the service can send to the repository
export interface Page {
    skip: number;
    limit: number;
    order: 'asc' | 'desc';
}

// project that can be see by user: owned by Lecturer or asigned to Student
const visibleTo = (user: AuthUser): Prisma.ProjectWhereInput =>
    user.role === 'lecturer'
        ? { lecturerId: user.id }
        : { members: { some: { studentId: user.id } } };

@Injectable()
export class ProjectRepository {
    constructor(private readonly prisma: PrismaService) {}

    findPage(
        user: AuthUser,
        f: ProjectFilter,
        page: Page & { sort?: 'createdAt' | 'title' | 'startDate' },
    ) {
        const where: Prisma.ProjectWhereInput = {
            deletedAt: null,
            AND: [
                visibleTo(user),
                f.q ? { title: { contains: f.q, mode: 'insensitive' } } : {},
                f.type ? { type: f.type } : {},
                f.types ? { type: { in: f.types } } : {},
                f.startFrom || f.startTo
                    ? { startDate: { gte: f.startFrom, lte: f.startTo } }
                    : {},
            ],
        };
        return this.prisma.$transaction([
            this.prisma.project.findMany({
                where,
                select: PROJECT_SELECT,
                orderBy: [
                    { [page.sort ?? 'createdAt']: page.order },
                    { id: 'asc' },
                ],
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.project.count({ where }),
        ]);
    }

    create(lecturerId: string, data: ProjectData) {
        return this.prisma.project.create({
            data: { lecturerId, ...data },
            select: PROJECT_SELECT,
        });
    }

    update(projectId: string, data: Partial<ProjectData>) {
        return this.prisma.project.update({
            where: { id: projectId },
            data,
            select: PROJECT_SELECT,
        });
    }

    async softDelete(projectId: string) {
        await this.prisma.project.update({
            where: { id: projectId },
            data: { deletedAt: new Date() },
        });
    }

    // list of active Student for a project, search by name or nrp
    findMembersPage(projectId: string, q: string | undefined, page: Page) {
        const where: Prisma.ProjectMemberWhereInput = {
            projectId,
            student: {
                deletedAt: null,
                ...(q && {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { nrp: { contains: q, mode: 'insensitive' } },
                    ],
                }),
            },
        };
        return this.prisma.$transaction([
            this.prisma.projectMember.findMany({
                where,
                select: MEMBER_SELECT,
                orderBy: [{ student: { name: 'asc' } }, { studentId: 'asc' }],
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.projectMember.count({ where }),
        ]);
    }

    async removeMember(projectId: string, studentId: string) {
        const { count } = await this.prisma.projectMember.deleteMany({
            where: { projectId, studentId },
        });
        return count > 0;
    }

    findVisible(projectId: string, user: AuthUser) {
        return this.findOne({ id: projectId, ...visibleTo(user) });
    }

    findOwned(projectId: string, lecturerId: string) {
        return this.findOne({ id: projectId, lecturerId });
    }

    private findOne(where: Prisma.ProjectWhereInput) {
        return this.prisma.project.findFirst({
            where: { ...where, deletedAt: null },
            select: PROJECT_SELECT,
        });
    }

    async isMember(projectId: string, studentId: string) {
        const member = await this.prisma.projectMember.findUnique({
            where: { projectId_studentId: { projectId, studentId } },
            select: { projectId: true },
        });
        return member !== null;
    }
}
