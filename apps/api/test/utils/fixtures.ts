import { INestApplication } from '@nestjs/common';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
    InvitationStatus,
    ProjectType,
} from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

export const PASSWORD = 'Rahasia123';

type Res = request.Response;
export const dataOf = <T = unknown>(res: Res) => (res.body as { data: T }).data;
export const metaOf = (res: Res) =>
    (
        res.body as {
            meta: {
                page: number;
                limit: number;
                total: number;
                totalPages: number;
            };
        }
    ).meta;
export const codeOf = (res: Res) => (res.body as { code?: string }).code;
export const tokenOf = (res: Res) =>
    dataOf<{ accessToken: string }>(res).accessToken;
export const refreshCookieOf = (res: Res) => {
    const raw = (res.headers['set-cookie'] ?? []) as unknown as string[];
    return raw.find((c) => c.startsWith('refresh_token='))?.split(';')[0];
};

export function resetThrottle(app: INestApplication<App>) {
    const throttle = app.get<ThrottlerStorageService>(getStorageToken());
    throttle.storage.clear();
    (
        throttle as unknown as { hitExpirations: Map<string, unknown> }
    ).hitExpirations.clear();
}

export async function resetState(app: INestApplication<App>) {
    await app.get(PrismaService).$executeRaw`TRUNCATE users CASCADE`;
    resetThrottle(app);
}

export async function upsertProgram(prisma: PrismaService, name: string) {
    return prisma.studyProgram.upsert({
        where: { name },
        update: {},
        create: { name },
    });
}

export async function createStudent(
    prisma: PrismaService,
    data: {
        name: string;
        nrp: string;
        email: string;
        studyProgramId: string;
        cohortYear: number;
        deletedAt?: Date;
    },
) {
    return prisma.user.create({
        data: {
            ...data,
            role: 'student',
            password: await argon2.hash(PASSWORD),
        },
    });
}

export async function createLecturer(
    prisma: PrismaService,
    data: { name: string; email: string },
) {
    return prisma.user.create({
        data: {
            ...data,
            role: 'lecturer',
            password: await argon2.hash(PASSWORD),
        },
    });
}

export const login = (
    app: INestApplication<App>,
    email: string,
    password = PASSWORD,
) =>
    request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password });

export async function createProject(
    prisma: PrismaService,
    lecturerId: string,
    data: Partial<{
        title: string;
        type: ProjectType;
        startDate: Date;
        createdAt: Date;
        deletedAt: Date;
    }> = {},
) {
    return prisma.project.create({
        data: {
            lecturerId,
            title: 'Project Uji',
            type: 'research',
            startDate: new Date('2026-01-01T00:00:00Z'),
            ...data,
        },
    });
}

export const addMember = (
    prisma: PrismaService,
    projectId: string,
    studentId: string,
) => prisma.projectMember.create({ data: { projectId, studentId } });

export const createInvitation = (
    prisma: PrismaService,
    projectId: string,
    studentId: string,
    data: Partial<{ status: InvitationStatus; expiresAt: Date }> = {},
) =>
    prisma.projectInvitation.create({
        data: {
            projectId,
            studentId,
            expiresAt: new Date(Date.now() + 7 * 86_400_000),
            ...data,
        },
    });

export async function seedPeople(app: INestApplication<App>) {
    const prisma = app.get(PrismaService);
    const s1 = await upsertProgram(prisma, 'S1 Teknik Informatika');
    const s2 = await upsertProgram(prisma, 'S2 Magister Teknik Informatika');
    const s3 = await upsertProgram(prisma, 'S3 Doktor Ilmu Komputer');
    const [owner, otherLecturer] = await Promise.all([
        createLecturer(prisma, {
            name: 'Dosen Pemilik',
            email: 'owner@example.com',
        }),
        createLecturer(prisma, {
            name: 'Dosen Lain',
            email: 'other@example.com',
        }),
    ]);
    const [studentS1, studentS2, studentS3] = await Promise.all(
        [
            ['Andi S1', '5025211001', s1.id],
            ['Budi S2', '6025211002', s2.id],
            ['Citra S3', '7025211003', s3.id],
        ].map(([name, nrp, studyProgramId]) =>
            createStudent(prisma, {
                name,
                nrp,
                email: `${nrp}@example.com`,
                studyProgramId,
                cohortYear: 2021,
            }),
        ),
    );
    const tokens = Object.fromEntries(
        await Promise.all(
            [
                ['owner', owner.email],
                ['other', otherLecturer.email],
                ['s1', studentS1.email],
                ['s2', studentS2.email],
                ['s3', studentS3.email],
            ].map(async ([key, email]) => [
                key,
                tokenOf(await login(app, email)),
            ]),
        ),
    ) as Record<'owner' | 'other' | 's1' | 's2' | 's3', string>;
    resetThrottle(app);
    return { owner, otherLecturer, studentS1, studentS2, studentS3, tokens };
}
