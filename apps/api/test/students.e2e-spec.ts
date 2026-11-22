import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import {
    addMember,
    createLecturer,
    createProject,
    createStudent,
    dataOf,
    login,
    metaOf,
    resetState,
    tokenOf,
    upsertProgram,
} from './utils/fixtures';

type Student = {
    id: string;
    name: string;
    nrp: string;
    cohortYear: number;
    studyProgram: { id: string; name: string; degree: string };
};

describe('GET /students (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let s1Id: string;
    let s2Id: string;
    let lecturerToken: string;
    let lecturerId: string;
    const http = () => request(app.getHttpServer());

    const search = (qs = '') =>
        http()
            .get(`/api/v1/students${qs ? `?${qs}` : ''}`)
            .set('Authorization', `Bearer ${lecturerToken}`);
    const nrpsOf = (res: request.Response) =>
        dataOf<Student[]>(res).map((s) => s.nrp);

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
        s1Id = (await upsertProgram(prisma, 'S1 Teknik Informatika')).id;
        s2Id = (await upsertProgram(prisma, 'S2 Magister Teknik Informatika'))
            .id;
    });

    beforeEach(async () => {
        await resetState(app);
        await createLecturer(prisma, {
            name: 'Dosen Satu',
            email: 'dosen@example.com',
        });
        const students = [
            ['Andi Pratama', '5025211001', s1Id, 2021],
            ['Budi Santoso', '5025221002', s1Id, 2022],
            ['Citra Lestari', '6025221003', s2Id, 2022],
            ['Dewi Anggraini', '6025231004', s2Id, 2023],
        ] as const;
        for (const [name, nrp, studyProgramId, cohortYear] of students) {
            await createStudent(prisma, {
                name,
                nrp,
                email: `${nrp}@example.com`,
                studyProgramId,
                cohortYear,
            });
        }
        await createStudent(prisma, {
            name: 'Eka Terhapus',
            nrp: '5025211999',
            email: 'terhapus@example.com',
            studyProgramId: s1Id,
            cohortYear: 2021,
            deletedAt: new Date(),
        });
        lecturerId = (
            await prisma.user.findFirstOrThrow({
                where: { email: 'dosen@example.com' },
            })
        ).id;
        lecturerToken = tokenOf(await login(app, 'dosen@example.com'));
    });

    afterAll(async () => {
        await app.close();
    });

    describe('otorisasi', () => {
        it('tanpa token → 401', async () => {
            await http().get('/api/v1/students').expect(401);
        });

        it('mahasiswa → 403', async () => {
            const token = tokenOf(await login(app, '5025211001@example.com'));
            await http()
                .get('/api/v1/students')
                .set('Authorization', `Bearer ${token}`)
                .expect(403);
        });
    });

    describe('hasil default', () => {
        it('hanya mahasiswa aktif (tanpa dosen & akun terhapus), urut nama', async () => {
            const res = await search().expect(200);
            expect(dataOf<Student[]>(res).map((s) => s.name)).toEqual([
                'Andi Pratama',
                'Budi Santoso',
                'Citra Lestari',
                'Dewi Anggraini',
            ]);
            expect(metaOf(res)).toEqual({
                page: 1,
                limit: 10,
                total: 4,
                totalPages: 1,
            });
        });

        it('bentuk respons tanpa email & password', async () => {
            const res = await search('q=Andi').expect(200);
            expect(dataOf<Student[]>(res)[0]).toEqual({
                id: expect.any(String) as string,
                name: 'Andi Pratama',
                nrp: '5025211001',
                cohortYear: 2021,
                studyProgram: {
                    id: s1Id,
                    name: 'S1 Teknik Informatika',
                    degree: 'S1',
                },
            });
        });
    });

    describe('filter', () => {
        it.each([
            ['q nama (case-insensitive)', 'q=citra', ['6025221003']],
            ['q sebagian nama', 'q=san', ['5025221002']],
            ['q NRP sebagian', 'q=60252', ['6025221003', '6025231004']],
            ['q tanpa hasil', 'q=zzz', []],
            ['degree=S1', 'degree=S1', ['5025211001', '5025221002']],
            ['degree=S2', 'degree=S2', ['6025221003', '6025231004']],
            ['degree=S3', 'degree=S3', []],
            ['cohortYear', 'cohortYear=2022', ['5025221002', '6025221003']],
            [
                'kombinasi degree + cohortYear',
                'degree=S2&cohortYear=2022',
                ['6025221003'],
            ],
        ])('%s', async (_, qs, expected) => {
            const res = await search(qs).expect(200);
            expect(nrpsOf(res)).toEqual(expected);
            expect(metaOf(res).total).toBe(expected.length);
        });

        it('studyProgramId', async () => {
            const res = await search(`studyProgramId=${s2Id}`).expect(200);
            expect(nrpsOf(res)).toEqual(['6025221003', '6025231004']);
        });

        it('q wildcard SQL (% _) dicari apa adanya → kosong', async () => {
            for (const q of ['%25', '_']) {
                expect(nrpsOf(await search(`q=${q}`).expect(200))).toEqual([]);
            }
        });

        it('q tidak menemukan akun terhapus', async () => {
            const res = await search('q=Terhapus').expect(200);
            expect(nrpsOf(res)).toEqual([]);
        });
    });

    describe('pagination', () => {
        it('limit=3 page=2 → sisa 1 data + meta', async () => {
            const res = await search('limit=3&page=2').expect(200);
            expect(nrpsOf(res)).toEqual(['6025231004']);
            expect(metaOf(res)).toEqual({
                page: 2,
                limit: 3,
                total: 4,
                totalPages: 2,
            });
        });

        it('halaman di luar jangkauan → data kosong, total tetap', async () => {
            const res = await search('page=9').expect(200);
            expect(nrpsOf(res)).toEqual([]);
            expect(metaOf(res).total).toBe(4);
        });
    });

    describe('validasi query', () => {
        it.each([
            ['degree tidak dikenal', 'degree=S4'],
            ['studyProgramId bukan UUID', 'studyProgramId=abc'],
            ['cohortYear bukan angka', 'cohortYear=dua'],
            ['limit > 100', 'limit=101'],
            ['page < 1', 'page=0'],
            ['query tak dikenal', 'foo=bar'],
        ])('%s → 400', async (_, qs) => {
            await search(qs).expect(400);
        });
    });
    describe('eligibleForProjectId', () => {
        const idOf = (nrp: string) =>
            prisma.user
                .findFirstOrThrow({ where: { nrp, deletedAt: null } })
                .then((u) => u.id);

        it('project s2_thesis → hanya mahasiswa S2 yang belum anggota', async () => {
            const project = await createProject(prisma, lecturerId, {
                type: 's2_thesis',
            });
            await addMember(prisma, project.id, await idOf('6025221003'));
            const res = await search(
                `eligibleForProjectId=${project.id}`,
            ).expect(200);
            expect(nrpsOf(res)).toEqual(['6025231004']);
        });

        it('project tipe umum → semua jenjang kecuali anggota; bisa digabung filter lain', async () => {
            const project = await createProject(prisma, lecturerId, {
                type: 'competition',
            });
            await addMember(prisma, project.id, await idOf('5025211001'));
            const all = await search(
                `eligibleForProjectId=${project.id}`,
            ).expect(200);
            expect(nrpsOf(all)).toEqual([
                '5025221002',
                '6025221003',
                '6025231004',
            ]);
            const filtered = await search(
                `eligibleForProjectId=${project.id}&degree=S1`,
            ).expect(200);
            expect(nrpsOf(filtered)).toEqual(['5025221002']);
        });

        it('project milik dosen lain / terhapus → 404; bukan UUID → 400', async () => {
            const other = await createLecturer(prisma, {
                name: 'Dosen Lain',
                email: 'lain@example.com',
            });
            const foreign = await createProject(prisma, other.id);
            const deleted = await createProject(prisma, lecturerId, {
                deletedAt: new Date(),
            });
            for (const id of [foreign.id, deleted.id]) {
                await search(`eligibleForProjectId=${id}`).expect(404);
            }
            await search('eligibleForProjectId=abc').expect(400);
        });
    });
});
