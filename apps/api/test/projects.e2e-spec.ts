import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import {
    addMember,
    codeOf,
    createInvitation,
    createProject,
    dataOf,
    metaOf,
    resetState,
    seedPeople,
} from './utils/fixtures';

type People = Awaited<ReturnType<typeof seedPeople>>;
type ProjectView = {
    id: string;
    title: string;
    type: string;
    startDate: string;
    endDate: string | null;
    memberCount: number;
};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Projects (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let p: People;
    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({
        get: (url: string) => http().get(url).auth(token, { type: 'bearer' }),
        post: (url: string) => http().post(url).auth(token, { type: 'bearer' }),
        patch: (url: string) =>
            http().patch(url).auth(token, { type: 'bearer' }),
        delete: (url: string) =>
            http().delete(url).auth(token, { type: 'bearer' }),
    });
    const titlesOf = (res: request.Response) =>
        dataOf<ProjectView[]>(res).map((x) => x.title);

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await resetState(app);
        p = await seedPeople(app);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /projects', () => {
        const body = (over: Record<string, unknown> = {}) => ({
            title: 'Tesis Sistem Rekomendasi',
            description: 'Bimbingan tesis',
            type: 's2_thesis',
            startDate: '2026-02-01',
            endDate: '2026-12-31',
            ...over,
        });

        it('dosen → 201 dengan aturan tipe turunan & tanggal YYYY-MM-DD', async () => {
            const res = await as(p.tokens.owner)
                .post('/api/v1/projects')
                .send(body({ title: '  Tesis Sistem Rekomendasi ' }))
                .expect(201);
            expect(dataOf(res)).toEqual({
                id: expect.any(String) as string,
                title: 'Tesis Sistem Rekomendasi',
                description: 'Bimbingan tesis',
                type: 's2_thesis',
                label: 'Tesis',
                requiredDegree: 'S2',
                trackMode: 'individual',
                startDate: '2026-02-01',
                endDate: '2026-12-31',
                lecturer: { id: p.owner.id, name: 'Dosen Pemilik' },
                memberCount: 0,
                createdAt: expect.any(String) as string,
                updatedAt: expect.any(String) as string,
            });
        });

        it('tipe umum → shared tanpa jenjang; endDate opsional', async () => {
            const res = await as(p.tokens.owner)
                .post('/api/v1/projects')
                .send(body({ type: 'competition', endDate: undefined }))
                .expect(201);
            expect(dataOf(res)).toMatchObject({
                trackMode: 'shared',
                requiredDegree: null,
                endDate: null,
            });
        });

        it('mahasiswa → 403, tanpa token → 401', async () => {
            await as(p.tokens.s1)
                .post('/api/v1/projects')
                .send(body())
                .expect(403);
            await http().post('/api/v1/projects').send(body()).expect(401);
        });

        it.each([
            ['judul kosong', { title: '' }],
            ['judul > 200 karakter', { title: 'a'.repeat(201) }],
            ['tipe tidak dikenal', { type: 'skripsi' }],
            ['startDate wajib', { startDate: undefined }],
            ['format tanggal salah', { startDate: '01-02-2026' }],
            ['tanggal tidak ada', { startDate: '2026-02-30' }],
            ['field tak dikenal', { lecturerId: MISSING_ID }],
            ['judul hanya spasi', { title: '   ' }],
            ['judul < 3 karakter', { title: 'ab' }],
            ['deskripsi > 5000 karakter', { description: 'a'.repeat(5001) }],
            ['endDate format salah', { endDate: '31/12/2026' }],
        ])('%s → 400', async (_, over) => {
            await as(p.tokens.owner)
                .post('/api/v1/projects')
                .send(body(over))
                .expect(400);
        });

        it('endDate sama dengan startDate → 201 (project satu hari)', async () => {
            await as(p.tokens.owner)
                .post('/api/v1/projects')
                .send(body({ startDate: '2026-05-01', endDate: '2026-05-01' }))
                .expect(201);
        });

        it('description & endDate boleh null eksplisit → 201', async () => {
            const res = await as(p.tokens.owner)
                .post('/api/v1/projects')
                .send(body({ description: null, endDate: null }))
                .expect(201);
            expect(dataOf(res)).toMatchObject({
                description: null,
                endDate: null,
            });
        });

        it('endDate sebelum startDate → 400 INVALID_DATE_RANGE', async () => {
            const res = await as(p.tokens.owner)
                .post('/api/v1/projects')
                .send(body({ startDate: '2026-05-01', endDate: '2026-04-30' }))
                .expect(400);
            expect(codeOf(res)).toBe('INVALID_DATE_RANGE');
        });
    });

    describe('GET /projects', () => {
        beforeEach(async () => {
            const own = [
                ['Alpha Riset', 'research', '2026-01-10'],
                ['Beta Tesis', 's2_thesis', '2026-03-01'],
                ['Gamma TA', 's1_thesis', '2026-06-15'],
            ] as const;
            for (const [title, type, start] of own) {
                await createProject(prisma, p.owner.id, {
                    title,
                    type,
                    startDate: new Date(`${start}T00:00:00Z`),
                });
            }
            await createProject(prisma, p.owner.id, {
                title: 'Delta Terhapus',
                deletedAt: new Date(),
            });
            await createProject(prisma, p.otherLecturer.id, {
                title: 'Milik Dosen Lain',
            });
        });

        const list = (qs = '', token = p.tokens.owner) =>
            as(token).get(`/api/v1/projects${qs ? `?${qs}` : ''}`);

        it('dosen hanya melihat project miliknya yang belum dihapus', async () => {
            const res = await list('sort=title&order=asc').expect(200);
            expect(titlesOf(res)).toEqual([
                'Alpha Riset',
                'Beta Tesis',
                'Gamma TA',
            ]);
            expect(metaOf(res)).toEqual({
                page: 1,
                limit: 10,
                total: 3,
                totalPages: 1,
            });
        });

        it('default urut createdAt terbaru dulu; lecturerId tidak bocor', async () => {
            const old = new Date('2025-01-01T00:00:00Z');
            await prisma.project.updateMany({
                where: { title: 'Gamma TA' },
                data: { createdAt: old },
            });
            const res = await list().expect(200);
            expect(titlesOf(res).at(-1)).toBe('Gamma TA');
            for (const item of dataOf<object[]>(res)) {
                expect(item).not.toHaveProperty('lecturerId');
            }
        });

        it('tanpa token → 401', async () => {
            await http().get('/api/v1/projects').expect(401);
        });

        it('halaman di luar jangkauan → items kosong, total tetap', async () => {
            const res = await list('page=5').expect(200);
            expect(dataOf<unknown[]>(res)).toEqual([]);
            expect(metaOf(res)).toMatchObject({ total: 3, totalPages: 1 });
        });

        it('mahasiswa hanya melihat project yang diikuti', async () => {
            const beta = await prisma.project.findFirstOrThrow({
                where: { title: 'Beta Tesis' },
            });
            await addMember(prisma, beta.id, p.studentS2.id);
            expect(titlesOf(await list('', p.tokens.s2).expect(200))).toEqual([
                'Beta Tesis',
            ]);
            expect(titlesOf(await list('', p.tokens.s1).expect(200))).toEqual(
                [],
            );
        });

        it.each([
            ['q judul (case-insensitive)', 'q=TESIS', ['Beta Tesis']],
            ['type', 'type=s1_thesis', ['Gamma TA']],
            ['degree=S2 → hanya tipe s2_*', 'degree=S2', ['Beta Tesis']],
            ['degree=S3 → kosong', 'degree=S3', []],
            [
                'periode startFrom..startTo',
                'startFrom=2026-02-01&startTo=2026-06-15',
                ['Beta Tesis', 'Gamma TA'],
            ],
            [
                'sort startDate desc',
                'sort=startDate&order=desc',
                ['Gamma TA', 'Beta Tesis', 'Alpha Riset'],
            ],
            ['pagination', 'sort=title&order=asc&limit=2&page=2', ['Gamma TA']],
            ['type + degree digabung (AND)', 'type=research&degree=S2', []],
            [
                'startFrom saja',
                'startFrom=2026-03-01',
                ['Beta Tesis', 'Gamma TA'],
            ],
            ['startTo saja', 'startTo=2026-01-10', ['Alpha Riset']],
            ['q tanpa hasil', 'q=tidakada', []],
        ])('%s', async (_, qs, expected) => {
            const res = await list(qs).expect(200);
            expect(titlesOf(res)).toEqual(
                qs.includes('sort')
                    ? expected
                    : expect.arrayContaining(expected),
            );
            expect(dataOf<unknown[]>(res)).toHaveLength(expected.length);
        });

        it.each([
            ['sort tidak dikenal', 'sort=password'],
            ['tipe tidak dikenal', 'type=skripsi'],
            ['degree tidak dikenal', 'degree=S4'],
            ['tanggal salah', 'startFrom=2026-13-01'],
            ['limit > 100', 'limit=101'],
            ['page 0', 'page=0'],
            ['order tidak dikenal', 'order=sideways'],
            ['field tak dikenal', 'lecturerId=x'],
        ])('%s → 400', async (_, qs) => {
            await list(qs).expect(400);
        });
    });

    describe('GET /projects/:projectId', () => {
        let projectId: string;

        beforeEach(async () => {
            projectId = (
                await createProject(prisma, p.owner.id, { title: 'Riset A' })
            ).id;
            await addMember(prisma, projectId, p.studentS1.id);
            await createInvitation(prisma, projectId, p.studentS2.id);
        });

        it('pemilik → detail + ringkasan termasuk undangan pending', async () => {
            const res = await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}`)
                .expect(200);
            expect(dataOf(res)).toMatchObject({
                id: projectId,
                memberCount: 1,
                summary: { memberCount: 1, pendingInvitationCount: 1 },
            });
        });

        it('pendingInvitationCount hanya menghitung pending yang belum kedaluwarsa', async () => {
            await createInvitation(prisma, projectId, p.studentS3.id, {
                expiresAt: new Date(Date.now() - 1000),
            });
            for (const status of ['declined', 'revoked'] as const) {
                await createInvitation(prisma, projectId, p.studentS1.id, {
                    status,
                });
            }
            const res = await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}`)
                .expect(200);
            expect(dataOf(res)).toMatchObject({
                summary: { pendingInvitationCount: 1 },
            });
        });

        it('anggota → 200 tanpa info undangan', async () => {
            const res = await as(p.tokens.s1)
                .get(`/api/v1/projects/${projectId}`)
                .expect(200);
            expect(dataOf(res)).toMatchObject({
                summary: { memberCount: 1, pendingInvitationCount: null },
            });
        });

        it('dosen lain / mahasiswa bukan anggota / id tak ada → 404', async () => {
            for (const token of [p.tokens.other, p.tokens.s2]) {
                const res = await as(token)
                    .get(`/api/v1/projects/${projectId}`)
                    .expect(404);
                expect(codeOf(res)).toBe('PROJECT_NOT_FOUND');
            }
            await as(p.tokens.owner)
                .get(`/api/v1/projects/${MISSING_ID}`)
                .expect(404);
        });

        it('id bukan UUID → 400', async () => {
            await as(p.tokens.owner).get('/api/v1/projects/abc').expect(400);
        });
    });

    describe('PATCH /projects/:projectId', () => {
        let projectId: string;
        const patch = (body: object, token = p.tokens.owner) =>
            as(token).patch(`/api/v1/projects/${projectId}`).send(body);

        beforeEach(async () => {
            projectId = (
                await createProject(prisma, p.owner.id, {
                    title: 'Riset Awal',
                    type: 'research',
                })
            ).id;
        });

        it('pemilik mengubah sebagian field; null mengosongkan endDate', async () => {
            await patch({ endDate: '2026-12-31' }).expect(200);
            const res = await patch({
                title: 'Riset Baru',
                endDate: null,
            }).expect(200);
            expect(dataOf(res)).toMatchObject({
                title: 'Riset Baru',
                type: 'research',
                startDate: '2026-01-01',
                endDate: null,
            });
        });

        it('description null → dikosongkan; body kosong → tidak berubah', async () => {
            await patch({ description: 'Ada isi' }).expect(200);
            const cleared = await patch({ description: null }).expect(200);
            expect(dataOf(cleared)).toMatchObject({ description: null });
            const same = await patch({}).expect(200);
            expect(dataOf(same)).toMatchObject({
                title: 'Riset Awal',
                description: null,
            });
        });

        it('judul di-trim; startDate & endDate diubah bersamaan', async () => {
            const res = await patch({
                title: '  Riset Rapi  ',
                startDate: '2026-03-01',
                endDate: '2026-09-30',
            }).expect(200);
            expect(dataOf(res)).toMatchObject({
                title: 'Riset Rapi',
                startDate: '2026-03-01',
                endDate: '2026-09-30',
            });
        });

        it('ganti tipe saat belum ada anggota/undangan → 200', async () => {
            const res = await patch({ type: 's1_thesis' }).expect(200);
            expect(dataOf(res)).toMatchObject({
                type: 's1_thesis',
                trackMode: 'individual',
            });
        });

        it('ganti tipe saat sudah ada anggota → 409 PROJECT_TYPE_LOCKED', async () => {
            await addMember(prisma, projectId, p.studentS1.id);
            const res = await patch({ type: 's1_thesis' }).expect(409);
            expect(codeOf(res)).toBe('PROJECT_TYPE_LOCKED');
            // Field lain tetap boleh diubah.
            await patch({ title: 'Masih Bisa' }).expect(200);
        });

        it('tipe sama dengan sekarang saat sudah ada anggota → 200 (bukan perubahan)', async () => {
            await addMember(prisma, projectId, p.studentS1.id);
            await patch({ type: 'research', title: 'Judul Valid' }).expect(200);
        });

        it('undangan declined/revoked/accepted tidak mengunci tipe', async () => {
            for (const status of ['declined', 'revoked', 'accepted'] as const) {
                await createInvitation(prisma, projectId, p.studentS1.id, {
                    status,
                });
            }
            await patch({ type: 's1_thesis' }).expect(200);
        });

        it('ganti tipe saat ada undangan pending → 409; undangan expired tidak mengunci', async () => {
            const inv = await createInvitation(
                prisma,
                projectId,
                p.studentS1.id,
            );
            await patch({ type: 's1_thesis' }).expect(409);
            await prisma.projectInvitation.update({
                where: { id: inv.id },
                data: { expiresAt: new Date(Date.now() - 1000) },
            });
            await patch({ type: 's1_thesis' }).expect(200);
        });

        it('rentang tanggal dicek terhadap nilai gabungan → 400', async () => {
            const res = await patch({ endDate: '2025-12-31' }).expect(400);
            expect(codeOf(res)).toBe('INVALID_DATE_RANGE');
        });

        it('startDate baru setelah endDate tersimpan → 400', async () => {
            await patch({ endDate: '2026-06-30' }).expect(200);
            const res = await patch({ startDate: '2026-07-01' }).expect(400);
            expect(codeOf(res)).toBe('INVALID_DATE_RANGE');
        });

        it.each([
            ['startDate null', { startDate: null }],
            ['title null', { title: null }],
            ['type null', { type: null }],
            ['field tak dikenal', { lecturerId: MISSING_ID }],
            ['format tanggal salah', { endDate: '2026/12/31' }],
        ])('%s → 400', async (_, body) => {
            await patch(body).expect(400);
        });

        it('dosen lain → 404, mahasiswa anggota → 403', async () => {
            await addMember(prisma, projectId, p.studentS1.id);
            await patch({ title: 'Judul Valid' }, p.tokens.s2).expect(403);
            await patch({ title: 'Judul Valid' }, p.tokens.other).expect(404);
            await patch({ title: 'Judul Valid' }, p.tokens.s1).expect(403);
        });
    });

    describe('PATCH /projects/:projectId (project terhapus / id salah)', () => {
        it('project terhapus → 404; id bukan UUID → 400', async () => {
            const gone = await createProject(prisma, p.owner.id, {
                deletedAt: new Date(),
            });
            await as(p.tokens.owner)
                .patch(`/api/v1/projects/${gone.id}`)
                .send({ title: 'Judul Valid' })
                .expect(404);
            await as(p.tokens.owner)
                .patch('/api/v1/projects/abc')
                .send({ title: 'Judul Valid' })
                .expect(400);
        });
    });

    describe('DELETE /projects/:projectId', () => {
        let projectId: string;

        beforeEach(async () => {
            projectId = (await createProject(prisma, p.owner.id)).id;
            await addMember(prisma, projectId, p.studentS1.id);
        });

        it('soft delete → 204, project & turunannya tidak tampil lagi', async () => {
            await as(p.tokens.owner)
                .delete(`/api/v1/projects/${projectId}`)
                .expect(204);
            const row = await prisma.project.findUniqueOrThrow({
                where: { id: projectId },
            });
            expect(row.deletedAt).not.toBeNull();
            // Soft delete: data keanggotaan tidak ikut dihapus.
            expect(
                await prisma.projectMember.count({ where: { projectId } }),
            ).toBe(1);

            await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}`)
                .expect(404);
            await as(p.tokens.s1)
                .get(`/api/v1/projects/${projectId}/members`)
                .expect(404);
            const list = await as(p.tokens.s1)
                .get('/api/v1/projects')
                .expect(200);
            expect(metaOf(list).total).toBe(0);
            await as(p.tokens.owner)
                .delete(`/api/v1/projects/${projectId}`)
                .expect(404);
        });

        it('dosen lain → 404, mahasiswa → 403', async () => {
            await as(p.tokens.other)
                .delete(`/api/v1/projects/${projectId}`)
                .expect(404);
            await as(p.tokens.owner).delete('/api/v1/projects/abc').expect(400);
            await as(p.tokens.s1)
                .delete(`/api/v1/projects/${projectId}`)
                .expect(403);
        });
    });

    describe('members', () => {
        let projectId: string;

        beforeEach(async () => {
            projectId = (
                await createProject(prisma, p.owner.id, {
                    type: 'competition',
                })
            ).id;
            for (const s of [p.studentS1, p.studentS2, p.studentS3]) {
                await addMember(prisma, projectId, s.id);
            }
        });

        it('GET members: pemilik & anggota → daftar urut nama + jenjang', async () => {
            for (const token of [p.tokens.owner, p.tokens.s2]) {
                const res = await as(token)
                    .get(`/api/v1/projects/${projectId}/members`)
                    .expect(200);
                const data = dataOf<{ name: string }[]>(res);
                expect(data.map((m) => m.name)).toEqual([
                    'Andi S1',
                    'Budi S2',
                    'Citra S3',
                ]);
                expect(data[0]).toEqual({
                    id: p.studentS1.id,
                    name: 'Andi S1',
                    nrp: '5025211001',
                    cohortYear: 2021,
                    studyProgram: expect.objectContaining({
                        degree: 'S1',
                    }) as object,
                    joinedAt: expect.any(String) as string,
                });
            }
        });

        it('GET members: q nama/NRP + pagination', async () => {
            const res = await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}/members?q=702521&limit=1`)
                .expect(200);
            expect(dataOf<{ name: string }[]>(res).map((m) => m.name)).toEqual([
                'Citra S3',
            ]);
            expect(metaOf(res)).toMatchObject({ total: 1, limit: 1 });
        });

        it('GET members: q nama case-insensitive', async () => {
            const res = await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}/members?q=budi`)
                .expect(200);
            expect(dataOf<{ name: string }[]>(res).map((m) => m.name)).toEqual([
                'Budi S2',
            ]);
        });

        it('GET members: akun mahasiswa terhapus tidak tampil & tidak dihitung', async () => {
            await prisma.user.update({
                where: { id: p.studentS3.id },
                data: { deletedAt: new Date() },
            });
            const res = await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}/members`)
                .expect(200);
            expect(metaOf(res).total).toBe(2);
            const detail = await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}`)
                .expect(200);
            expect(dataOf(detail)).toMatchObject({
                memberCount: 2,
                summary: { memberCount: 2 },
            });
        });

        it('GET members: data sensitif mahasiswa tidak bocor', async () => {
            const res = await as(p.tokens.s1)
                .get(`/api/v1/projects/${projectId}/members`)
                .expect(200);
            for (const m of dataOf<object[]>(res)) {
                expect(m).not.toHaveProperty('email');
                expect(m).not.toHaveProperty('password');
            }
        });

        it.each([
            ['limit 0', 'limit=0'],
            ['limit > 100', 'limit=101'],
            ['field tak dikenal', 'role=student'],
        ])('GET members: %s → 400', async (_, qs) => {
            await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}/members?${qs}`)
                .expect(400);
        });

        it('GET members: bukan anggota → 404', async () => {
            await as(p.tokens.other)
                .get(`/api/v1/projects/${projectId}/members`)
                .expect(404);
        });

        it('DELETE member → 204, mahasiswa kehilangan akses ke project', async () => {
            await as(p.tokens.owner)
                .delete(
                    `/api/v1/projects/${projectId}/members/${p.studentS1.id}`,
                )
                .expect(204);
            await as(p.tokens.s1)
                .get(`/api/v1/projects/${projectId}`)
                .expect(404);
            const res = await as(p.tokens.owner)
                .get(`/api/v1/projects/${projectId}/members`)
                .expect(200);
            expect(metaOf(res).total).toBe(2);
        });

        it('DELETE member bukan anggota → 404 MEMBER_NOT_FOUND', async () => {
            const res = await as(p.tokens.owner)
                .delete(`/api/v1/projects/${projectId}/members/${MISSING_ID}`)
                .expect(404);
            expect(codeOf(res)).toBe('MEMBER_NOT_FOUND');
        });

        it('DELETE member: project terhapus → 404; studentId bukan UUID → 400', async () => {
            await as(p.tokens.owner)
                .delete(`/api/v1/projects/${projectId}/members/abc`)
                .expect(400);
            await prisma.project.update({
                where: { id: projectId },
                data: { deletedAt: new Date() },
            });
            await as(p.tokens.owner)
                .delete(
                    `/api/v1/projects/${projectId}/members/${p.studentS1.id}`,
                )
                .expect(404);
        });

        it('DELETE member dua kali → 204 lalu 404', async () => {
            const url = `/api/v1/projects/${projectId}/members/${p.studentS1.id}`;
            await as(p.tokens.owner).delete(url).expect(204);
            await as(p.tokens.owner).delete(url).expect(404);
        });

        it('DELETE member: mahasiswa → 403, dosen lain → 404', async () => {
            const url = `/api/v1/projects/${projectId}/members/${p.studentS2.id}`;
            await as(p.tokens.s1).delete(url).expect(403);
            await as(p.tokens.other).delete(url).expect(404);
        });
    });
});
