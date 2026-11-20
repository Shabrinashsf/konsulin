import { INestApplication } from '@nestjs/common';
import { getStorageToken, ThrottlerStorageService } from '@nestjs/throttler';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';

const PASSWORD = 'Rahasia123';

type Res = request.Response;
const dataOf = (res: Res) => (res.body as { data: unknown }).data;
const codeOf = (res: Res) => (res.body as { code?: string }).code;
const tokenOf = (res: Res) =>
    (res.body as { data: { accessToken: string } }).data.accessToken;

describe('Auth (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let programId: string;
    const http = () => request(app.getHttpServer());

    const registerBody = (over: Record<string, unknown> = {}) => ({
        name: 'Budi Mahasiswa',
        nrp: '5025211001',
        email: 'budi@example.com',
        password: PASSWORD,
        studyProgramId: programId,
        cohortYear: 2021,
        ...over,
    });

    const login = (email: string, password = PASSWORD) =>
        http().post('/api/v1/auth/login').send({ email, password });

    const refreshCookieOf = (res: request.Response) => {
        const raw = res.headers['set-cookie'] as unknown as string[];
        return raw.find((c) => c.startsWith('refresh_token='))!.split(';')[0];
    };

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        const program = await prisma.studyProgram.upsert({
            where: { name: 'S1 Teknik Informatika' },
            update: {},
            create: { name: 'S1 Teknik Informatika' },
        });
        programId = program.id;
    });

    beforeEach(async () => {
        await prisma.$executeRaw`TRUNCATE users CASCADE`;
        const throttle = app.get<ThrottlerStorageService>(getStorageToken());
        throttle.storage.clear();
        (
            throttle as unknown as { hitExpirations: Map<string, unknown> }
        ).hitExpirations.clear();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /auth/register', () => {
        it('201 → profil mahasiswa tanpa password', async () => {
            const res = await http()
                .post('/api/v1/auth/register')
                .send(registerBody({ email: '  Budi@Example.com ' }))
                .expect(201);
            const data = dataOf(res);
            expect(data).toMatchObject({
                email: 'budi@example.com',
                role: 'student',
                studyProgram: { id: programId, degree: 'S1' },
            });
            expect(data).not.toHaveProperty('password');
            const stored = await prisma.user.findFirstOrThrow();
            expect(stored.password).toMatch(/^\$argon2id\$/);
        });

        it('email atau NRP duplikat → 409', async () => {
            await http()
                .post('/api/v1/auth/register')
                .send(registerBody())
                .expect(201);
            const email = await http()
                .post('/api/v1/auth/register')
                .send(registerBody({ nrp: '5025211002' }))
                .expect(409);
            expect(codeOf(email)).toBe('EMAIL_TAKEN');
            const nrp = await http()
                .post('/api/v1/auth/register')
                .send(registerBody({ email: 'lain@example.com' }))
                .expect(409);
            expect(codeOf(nrp)).toBe('NRP_TAKEN');
        });

        it.each([
            ['password lemah', { password: 'lemahsekali' }],
            ['NRP bukan 10 digit', { nrp: '12345' }],
            ['angkatan < 2000', { cohortYear: 1999 }],
            ['angkatan di masa depan', { cohortYear: 9999 }],
            ['field tak dikenal (role)', { role: 'lecturer' }],
        ])('%s → 400', async (_, over) => {
            await http()
                .post('/api/v1/auth/register')
                .send(registerBody(over))
                .expect(400);
        });

        it('prodi tidak ada → 400', async () => {
            const res = await http()
                .post('/api/v1/auth/register')
                .send(
                    registerBody({
                        studyProgramId: '00000000-0000-4000-8000-000000000000',
                    }),
                )
                .expect(400);
            expect(codeOf(res)).toBe('STUDY_PROGRAM_NOT_FOUND');
        });
    });

    describe('login, me, refresh, logout', () => {
        beforeEach(async () => {
            await http()
                .post('/api/v1/auth/register')
                .send(registerBody())
                .expect(201);
        });

        it('login → access token + cookie refresh httpOnly', async () => {
            const res = await login('budi@example.com').expect(200);
            expect(tokenOf(res)).toEqual(expect.any(String));
            const cookie = (
                res.headers['set-cookie'] as unknown as string[]
            ).join();
            expect(cookie).toMatch(/refresh_token=/);
            expect(cookie).toMatch(/HttpOnly/);
            expect(cookie).toMatch(/SameSite=Strict/);
            expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
        });

        it('password salah / email tak terdaftar → 401', async () => {
            await login('budi@example.com', 'Salah1234').expect(401);
            await login('tidakada@example.com').expect(401);
        });

        it('login ke-6 dalam semenit → 429', async () => {
            for (let i = 0; i < 5; i++) {
                await login('budi@example.com', 'Salah1234').expect(401);
            }
            await login('budi@example.com').expect(429);
        });

        it('GET /auth/me dengan token → profil; tanpa token → 401', async () => {
            const token = tokenOf(await login('budi@example.com'));
            const me = await http()
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);
            expect(dataOf(me)).toMatchObject({ nrp: '5025211001' });
            await http().get('/api/v1/auth/me').expect(401);
            await http()
                .get('/api/v1/auth/me')
                .set('Authorization', 'Bearer bukan.token.valid')
                .expect(401);
        });

        it('refresh merotasi token; token lama dipakai ulang → 401 & semua sesi dicabut', async () => {
            const old = refreshCookieOf(await login('budi@example.com'));
            const rotated = await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', old)
                .expect(200);
            const fresh = refreshCookieOf(rotated);
            expect(fresh).not.toBe(old);

            await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', old)
                .expect(401);
            await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', fresh)
                .expect(401);
        });

        it('refresh tanpa cookie → 401', async () => {
            await http().post('/api/v1/auth/refresh').expect(401);
        });

        it('logout → 204, cookie dihapus, refresh token tak bisa dipakai', async () => {
            const res = await login('budi@example.com');
            const cookie = refreshCookieOf(res);
            const out = await http()
                .post('/api/v1/auth/logout')
                .set('Authorization', `Bearer ${tokenOf(res)}`)
                .set('Cookie', cookie)
                .expect(204);
            expect(
                (out.headers['set-cookie'] as unknown as string[]).join(),
            ).toMatch(/refresh_token=;/);
            await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', cookie)
                .expect(401);
        });
    });

    describe('GET /students (role)', () => {
        it('mahasiswa → 403, dosen → 200', async () => {
            await http()
                .post('/api/v1/auth/register')
                .send(registerBody())
                .expect(201);
            await prisma.user.create({
                data: {
                    name: 'Dosen Satu',
                    email: 'dosen@example.com',
                    role: 'lecturer',
                    password: await argon2.hash(PASSWORD),
                },
            });
            const student = await login('budi@example.com');
            const lecturer = await login('dosen@example.com');

            await http()
                .get('/api/v1/students')
                .set('Authorization', `Bearer ${tokenOf(student)}`)
                .expect(403);
            const res = await http()
                .get('/api/v1/students?degree=S1')
                .set('Authorization', `Bearer ${tokenOf(lecturer)}`)
                .expect(200);
            expect((res.body as { meta: { total: number } }).meta.total).toBe(
                1,
            );
            expect((dataOf(res) as unknown[])[0]).toMatchObject({
                nrp: '5025211001',
                studyProgram: { degree: 'S1' },
            });
        });
    });
});
