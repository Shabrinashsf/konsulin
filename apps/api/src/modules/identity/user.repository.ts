import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { containsText } from '../../prisma/contains-text';
import { PrismaService } from '../../prisma/prisma.service';
import type { Page } from '../../shared/http/pagination-query.dto';
import { type Degree, degreeNameFilter } from './degree';

// columns retrieved for the logged-in user's profile
const PROFILE_SELECT = {
    id: true,
    name: true,
    email: true,
    role: true,
    nrp: true,
    cohortYear: true,
    studyProgram: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export type ProfileRow = Prisma.UserGetPayload<{
    select: typeof PROFILE_SELECT;
}>;

// columns retrieved for student search results
const STUDENT_SELECT = {
    id: true,
    name: true,
    nrp: true,
    cohortYear: true,
    studyProgram: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export type StudentRow = Prisma.UserGetPayload<{
    select: typeof STUDENT_SELECT;
}>;

export interface StudentData {
    name: string;
    email: string;
    nrp: string;
    cohortYear: number;
    studyProgramId: string;
    password: string;
}

export interface StudentFilter {
    q?: string;
    studyProgramId?: string;
    cohortYear?: number;
    degrees: Degree[];
    notMemberOf?: string;
}

@Injectable()
export class UserRepository {
    constructor(private readonly prisma: PrismaService) {}

    findProfile(userId: string) {
        return this.prisma.user.findFirst({
            where: { id: userId, deletedAt: null },
            select: PROFILE_SELECT,
        });
    }

    findByEmailForLogin(email: string) {
        return this.prisma.user.findFirst({
            where: { email, deletedAt: null },
            select: { id: true, role: true, password: true },
        });
    }

    findByEmailOrNrp(email: string, nrp: string) {
        return this.prisma.user.findFirst({
            where: { deletedAt: null, OR: [{ email }, { nrp }] },
            select: { email: true },
        });
    }

    createStudent(data: StudentData) {
        return this.prisma.user.create({
            data: { ...data, role: 'student' },
            select: PROFILE_SELECT,
        });
    }

    findStudentsPage(f: StudentFilter, page: Page) {
        const where: Prisma.UserWhereInput = {
            role: 'student',
            deletedAt: null,
            studyProgramId: f.studyProgramId,
            cohortYear: f.cohortYear,
            ...(f.q && {
                OR: [{ name: containsText(f.q) }, { nrp: containsText(f.q) }],
            }),
            AND: [
                ...f.degrees.map((d) => ({
                    studyProgram: { name: degreeNameFilter(d) },
                })),
                f.notMemberOf
                    ? { memberships: { none: { projectId: f.notMemberOf } } }
                    : {},
            ],
        };
        return this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                select: STUDENT_SELECT,
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
                skip: page.skip,
                take: page.limit,
            }),
            this.prisma.user.count({ where }),
        ]);
    }
}
