import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import {
    codeOf,
    dataOf,
    login as loginWith,
    createLecturer,
    PASSWORD,
    refreshCookieOf,
    resetState,
    tokenOf,
    upsertProgram,
} from './utils/fixtures';

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
    const register = (over: Record<string, unknown> = {}) =>
        http().post('/api/v1/auth/register').send(registerBody(over));
    const login = (email: string, password = PASSWORD) =>
        loginWith(app, email, password);
    const softDelete = (email: string) =>
        prisma.user.updateMany({
            where: { email },
            data: { deletedAt: new Date() },
        });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        programId = (await upsertProgram(prisma, 'S1 Teknik Informatika')).id;
    });

    beforeEach(() => resetState(app));

    afterAll(async () => {
        await app.close();
    });

    describe('POST /auth/register', () => {
        it('201 → profil mahasiswa tanpa password, nama & email dinormalisasi', async () => {
            const res = await register({
                name: '  Budi Mahasiswa ',
                email: '  Budi@Example.com ',
            }).expect(201);
            const data = dataOf(res);
            expect(data).toEqual({
                id: expect.any(String) as string,
                name: 'Budi Mahasiswa',
                email: 'budi@example.com',
                role: 'student',
                nrp: '5025211001',
                cohortYear: 2021,
                studyProgram: {
                    id: programId,
                    name: 'S1 Teknik Informatika',
                    degree: 'S1',
                },
            });
            const stored = await prisma.user.findFirstOrThrow();
            expect(stored.password).toMatch(/^\$argon2id\$/);
        });

        it('tidak memerlukan token (publik)', async () => {
            await register().expect(201);
        });

        it('endpoint publik tetap jalan walau header token rusak', async () => {
            await register()
                .set('Authorization', 'Bearer token-basi')
                .expect(201);
        });

        it('email atau NRP duplikat → 409', async () => {
            await register().expect(201);
            const email = await register({
                nrp: '5025211002',
                email: 'BUDI@example.com',
            }).expect(409);
            expect(codeOf(email)).toBe('EMAIL_TAKEN');
            const nrp = await register({ email: 'lain@example.com' }).expect(
                409,
            );
            expect(codeOf(nrp)).toBe('NRP_TAKEN');
        });

        it('email & NRP milik akun yang sudah dihapus boleh dipakai lagi', async () => {
            await register().expect(201);
            await softDelete('budi@example.com');
            await register().expect(201);
        });

        it.each([
            ['nama < 3 karakter', { name: 'Bu' }],
            ['nama > 100 karakter', { name: 'a'.repeat(101) }],
            ['NRP bukan 10 digit', { nrp: '12345' }],
            ['NRP mengandung huruf', { nrp: '50252110ab' }],
            ['email tidak valid', { email: 'bukan-email' }],
            ['password < 8 karakter', { password: 'Ab1' }],
            ['password tanpa huruf besar', { password: 'rahasia123' }],
            ['password tanpa huruf kecil', { password: 'RAHASIA123' }],
            ['password tanpa angka', { password: 'RahasiaSekali' }],
            ['prodi bukan UUID', { studyProgramId: 'abc' }],
            ['angkatan < 2000', { cohortYear: 1999 }],
            ['angkatan di masa depan', { cohortYear: 9999 }],
            ['angkatan bukan bilangan bulat', { cohortYear: 2021.5 }],
            ['field tak dikenal (role)', { role: 'lecturer' }],
            ['nama hanya spasi', { name: '    ' }],
            ['password > 128 karakter', { password: `Aa1${'a'.repeat(126)}` }],
            [
                'email > 255 karakter',
                { email: `${'a'.repeat(250)}@example.com` },
            ],
            ['angkatan berupa string', { cohortYear: '2021' }],
        ])('%s → 400', async (_, over) => {
            await register(over).expect(400);
            await resetState(app);
        });

        it('field wajib kosong → 400', async () => {
            await http().post('/api/v1/auth/register').send({}).expect(400);
        });

        it('angkatan tahun berjalan (Asia/Jakarta) → 201', async () => {
            const year = Number(
                new Date()
                    .toLocaleDateString('sv-SE', {
                        timeZone: 'Asia/Jakarta',
                    })
                    .slice(0, 4),
            );
            await register({ cohortYear: year }).expect(201);
        });

        it('prodi tidak ada → 400 STUDY_PROGRAM_NOT_FOUND', async () => {
            const res = await register({
                studyProgramId: '00000000-0000-4000-8000-000000000000',
            }).expect(400);
            expect(codeOf(res)).toBe('STUDY_PROGRAM_NOT_FOUND');
        });

        it('register ke-6 dalam semenit → 429', async () => {
            for (let i = 0; i < 5; i++) {
                await register({ nrp: '12345' }).expect(400);
            }
            await register().expect(429);
        });
    });

    describe('POST /auth/login', () => {
        beforeEach(async () => {
            await register().expect(201);
        });

        it('200 → access token + cookie refresh httpOnly 7 hari', async () => {
            const res = await login('budi@example.com').expect(200);
            expect(dataOf(res)).toEqual({
                accessToken: expect.any(String) as string,
            });
            const cookie = (
                res.headers['set-cookie'] as unknown as string[]
            ).join();
            expect(cookie).toMatch(/refresh_token=/);
            expect(cookie).toMatch(/HttpOnly/);
            expect(cookie).toMatch(/Secure/);
            expect(cookie).toMatch(/SameSite=Strict/);
            expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

            const row = await prisma.refreshToken.findFirstOrThrow();
            const days = (row.expiresAt.getTime() - Date.now()) / 86_400_000;
            expect(days).toBeGreaterThan(6.99);
            expect(days).toBeLessThanOrEqual(7);
            expect(cookie).not.toContain(row.tokenHash);
        });

        it('email tidak case-sensitive', async () => {
            await login('BUDI@Example.com').expect(200);
        });

        it('password salah / email tak terdaftar → 401 dengan pesan sama', async () => {
            const wrong = await login('budi@example.com', 'Salah1234').expect(
                401,
            );
            const unknown = await login('tidakada@example.com').expect(401);
            expect(wrong.body).toEqual(unknown.body);
        });

        it('body tidak valid → 400', async () => {
            await http()
                .post('/api/v1/auth/login')
                .send({ email: 'bukan-email', password: '' })
                .expect(400);
        });

        it('akun ber-deleted_at → 401', async () => {
            await softDelete('budi@example.com');
            await login('budi@example.com').expect(401);
        });

        it('login ke-6 dalam semenit → 429', async () => {
            for (let i = 0; i < 5; i++) {
                await login('budi@example.com', 'Salah1234').expect(401);
            }
            await login('budi@example.com').expect(429);
        });
    });

    describe('POST /auth/refresh', () => {
        beforeEach(async () => {
            await register().expect(201);
        });

        it('merotasi token → access token & cookie baru, token lama dicabut', async () => {
            const old = refreshCookieOf(await login('budi@example.com'))!;
            const res = await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', old)
                .expect(200);
            expect(tokenOf(res)).toEqual(expect.any(String));
            const fresh = refreshCookieOf(res);
            expect(fresh).toBeDefined();
            expect(fresh).not.toBe(old);
            expect(
                await prisma.refreshToken.count({ where: { revokedAt: null } }),
            ).toBe(1);
        });

        it('token lama dipakai ulang → 401 & semua sesi user dicabut', async () => {
            const old = refreshCookieOf(await login('budi@example.com'))!;
            const other = refreshCookieOf(await login('budi@example.com'))!;
            const rotated = await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', old)
                .expect(200);
            const fresh = refreshCookieOf(rotated)!;

            await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', old)
                .expect(401);
            for (const c of [fresh, other]) {
                await http()
                    .post('/api/v1/auth/refresh')
                    .set('Cookie', c)
                    .expect(401);
            }
        });

        it('dua refresh bersamaan dengan token sama → satu 200, satu 401', async () => {
            const cookie = refreshCookieOf(await login('budi@example.com'))!;
            const results = await Promise.all(
                [1, 2].map(() =>
                    http().post('/api/v1/auth/refresh').set('Cookie', cookie),
                ),
            );
            expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
        });

        it('access token hasil refresh bisa dipakai', async () => {
            const cookie = refreshCookieOf(await login('budi@example.com'))!;
            const res = await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', cookie)
                .expect(200);
            await http()
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${tokenOf(res)}`)
                .expect(200);
        });

        it('refresh token disimpan sebagai hash, bukan nilai asli', async () => {
            const cookie = refreshCookieOf(await login('budi@example.com'))!;
            const raw = cookie.split('=')[1];
            expect(
                await prisma.refreshToken.count({ where: { tokenHash: raw } }),
            ).toBe(0);
        });

        it('tanpa cookie / token asal → 401', async () => {
            await http().post('/api/v1/auth/refresh').expect(401);
            await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', 'refresh_token=ngawur')
                .expect(401);
        });

        it('token kedaluwarsa → 401', async () => {
            const cookie = refreshCookieOf(await login('budi@example.com'))!;
            await prisma.refreshToken.updateMany({
                data: { expiresAt: new Date(Date.now() - 1000) },
            });
            await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', cookie)
                .expect(401);
        });

        it('akun ber-deleted_at → 401', async () => {
            const cookie = refreshCookieOf(await login('budi@example.com'))!;
            await softDelete('budi@example.com');
            await http()
                .post('/api/v1/auth/refresh')
                .set('Cookie', cookie)
                .expect(401);
        });
    });

    describe('POST /auth/logout', () => {
        beforeEach(async () => {
            await register().expect(201);
        });

        it('204 → cookie dihapus, refresh token tak bisa dipakai', async () => {
            const res = await login('budi@example.com');
            const cookie = refreshCookieOf(res)!;
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

        it('tanpa cookie tetap 204', async () => {
            const token = tokenOf(await login('budi@example.com'));
            await http()
                .post('/api/v1/auth/logout')
                .set('Authorization', `Bearer ${token}`)
                .expect(204);
        });

        it('tanpa access token → 401', async () => {
            await http().post('/api/v1/auth/logout').expect(401);
        });
    });

    describe('GET /auth/me', () => {
        beforeEach(async () => {
            await register().expect(201);
        });

        it('200 → profil user login tanpa password', async () => {
            const token = tokenOf(await login('budi@example.com'));
            const res = await http()
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);
            expect(dataOf(res)).toMatchObject({
                email: 'budi@example.com',
                nrp: '5025211001',
                studyProgram: { degree: 'S1' },
            });
            expect(dataOf(res)).not.toHaveProperty('password');
        });

        it('tanpa token / token tidak valid / skema bukan Bearer → 401', async () => {
            const token = tokenOf(await login('budi@example.com'));
            await http().get('/api/v1/auth/me').expect(401);
            await http()
                .get('/api/v1/auth/me')
                .set('Authorization', 'Bearer bukan.token.valid')
                .expect(401);
            await http()
                .get('/api/v1/auth/me')
                .set('Authorization', `Basic ${token}`)
                .expect(401);
        });

        it('access token kedaluwarsa → 401', async () => {
            const user = await prisma.user.findFirstOrThrow();
            const expired = await app
                .get(JwtService)
                .signAsync(
                    { sub: user.id, role: user.role },
                    { expiresIn: -10 },
                );
            await http()
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${expired}`)
                .expect(401);
        });

        it('token palsu (secret lain, role diubah) → 401', async () => {
            const user = await prisma.user.findFirstOrThrow();
            const forged = await new JwtService({
                secret: 'secret-palsu-yang-panjangnya-32-karakter',
            }).signAsync({ sub: user.id, role: 'lecturer' });
            await http()
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${forged}`)
                .expect(401);
        });

        it('dosen → profil tanpa nrp, angkatan, prodi', async () => {
            await createLecturer(prisma, {
                name: 'Dosen Satu',
                email: 'dosen@example.com',
            });
            const token = tokenOf(await login('dosen@example.com'));
            const res = await http()
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);
            expect(dataOf(res)).toMatchObject({
                role: 'lecturer',
                nrp: null,
                cohortYear: null,
                studyProgram: null,
            });
        });

        it('akun ber-deleted_at → 401 walau access token masih berlaku', async () => {
            const token = tokenOf(await login('budi@example.com'));
            await softDelete('budi@example.com');
            await http()
                .get('/api/v1/auth/me')
                .set('Authorization', `Bearer ${token}`)
                .expect(401);
        });
    });
});
