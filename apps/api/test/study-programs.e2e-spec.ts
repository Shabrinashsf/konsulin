import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import { dataOf, upsertProgram } from './utils/fixtures';

type Program = { id: string; name: string; degree: string };

const PROGRAMS = [
    'S1 Teknik Informatika',
    'S1 Rekayasa Perangkat Lunak',
    'S2 Magister Teknik Informatika',
    'S3 Doktor Ilmu Komputer',
];

describe('GET /study-programs (e2e)', () => {
    let app: INestApplication<App>;
    const http = () => request(app.getHttpServer());

    beforeAll(async () => {
        app = await createTestApp();
        const prisma = app.get(PrismaService);
        for (const name of PROGRAMS) await upsertProgram(prisma, name);
    });

    afterAll(async () => {
        await app.close();
    });

    it('publik (tanpa token) → { id, name, degree } urut nama', async () => {
        const res = await http().get('/api/v1/study-programs').expect(200);
        const data = dataOf<Program[]>(res);
        expect(data.map((p) => p.name)).toEqual(
            expect.arrayContaining(PROGRAMS),
        );
        for (const p of data) {
            expect(Object.keys(p).sort()).toEqual(['degree', 'id', 'name']);
            expect(p.degree).toBe(p.name.slice(0, 2));
        }
        const names = data.map((p) => p.name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('tetap publik walau header token rusak', async () => {
        await http()
            .get('/api/v1/study-programs')
            .set('Authorization', 'Bearer token-basi')
            .expect(200);
    });

    it.each(['S1', 'S2', 'S3'])(
        '?degree=%s → hanya prodi jenjang itu',
        async (degree) => {
            const res = await http()
                .get(`/api/v1/study-programs?degree=${degree}`)
                .expect(200);
            const data = dataOf<Program[]>(res);
            expect(data.length).toBeGreaterThan(0);
            expect(data.every((p) => p.degree === degree)).toBe(true);
            expect(data.map((p) => p.name)).toEqual(
                expect.arrayContaining(
                    PROGRAMS.filter((n) => n.startsWith(`${degree} `)),
                ),
            );
        },
    );

    it.each([
        ['degree tidak dikenal', 'degree=S4'],
        ['degree huruf kecil', 'degree=s1'],
        ['query tak dikenal', 'foo=bar'],
    ])('%s → 400', async (_, qs) => {
        await http().get(`/api/v1/study-programs?${qs}`).expect(400);
    });
});
