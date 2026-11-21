import { INestApplication } from '@nestjs/common';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
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

/** Kosongkan data user (study_programs dipertahankan) + reset rate limit. */
export async function resetState(app: INestApplication<App>) {
    await app.get(PrismaService).$executeRaw`TRUNCATE users CASCADE`;
    const throttle = app.get<ThrottlerStorageService>(getStorageToken());
    throttle.storage.clear();
    (
        throttle as unknown as { hitExpirations: Map<string, unknown> }
    ).hitExpirations.clear();
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
