import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    CONSULTATION_CANCELLED,
    ConsultationCancelledEvent,
} from '../src/shared/consultation/consultation-cancelled.event';
import { PrismaService } from '../src/prisma/prisma.service';
import {
    addDays,
    jakartaDateTime,
    toJakartaDate,
} from '../src/shared/time/time';
import { createTestApp } from './utils/create-test-app';
import {
    addMember,
    codeOf,
    createConsultation,
    createProject,
    dataOf,
    metaOf,
    resetState,
    seedPeople,
} from './utils/fixtures';

type People = Awaited<ReturnType<typeof seedPeople>>;
type Blackout = { id: string; date: string; reason: string | null };
type Affected = {
    id: string;
    status: string;
    topic: string;
    requestedDate: string;
    student: Record<string, unknown>;
};
type CreateResult = {
    created: string[];
    skipped: string[];
    cancelledConsultations: Affected[];
};
type DayStatus = { date: string; status: 'available' | 'unavailable' };

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const GENERIC_REASON = 'Dosen berhalangan pada tanggal tersebut';

describe('Schedule (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let p: People;
    let projectId: string;
    // WIB dates relative to today so BR-06 (today – 60 days) always holds
    const today = () => toJakartaDate(new Date());
    const day = (n: number) => addDays(today(), n);

    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({
        get: (url: string) => http().get(url).auth(token, { type: 'bearer' }),
        post: (url: string) => http().post(url).auth(token, { type: 'bearer' }),
        delete: (url: string) =>
            http().delete(url).auth(token, { type: 'bearer' }),
    });
    const addBlackout = (body: object, token = p.tokens.owner) =>
        as(token).post('/api/v1/me/blackout-dates').send(body);
    const blackout = (from: string, to = from, over: object = {}) =>
        addBlackout({ from, to, ...over });
    const affectedOf = (res: request.Response) =>
        (res.body as { details: { consultations: Affected[] } }).details
            .consultations;
    const blackoutDates = async (lecturerId = p.owner.id) =>
        (
            await prisma.blackoutDate.findMany({
                where: { lecturerId },
                orderBy: { date: 'asc' },
            })
        ).map((b) => b.date.toISOString().slice(0, 10));
    const statusOf = async (id: string) =>
        (await prisma.consultation.findUniqueOrThrow({ where: { id } })).status;
    const consultation = (
        date: string,
        start: string,
        end: string,
        over: Partial<Parameters<typeof createConsultation>[1]> = {},
    ) =>
        createConsultation(prisma, {
            projectId,
            lecturerId: p.owner.id,
            studentId: p.studentS1.id,
            startAt: jakartaDateTime(date, start),
            endAt: jakartaDateTime(date, end),
            status: 'approved',
            ...over,
        });
    const request_ = (date: string) =>
        createConsultation(prisma, {
            projectId,
            lecturerId: p.owner.id,
            studentId: p.studentS1.id,
            status: 'requested',
            requestedDate: date,
        });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await resetState(app);
        p = await seedPeople(app);
        projectId = (await createProject(prisma, p.owner.id)).id;
        await addMember(prisma, projectId, p.studentS1.id);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /me/blackout-dates', () => {
        it('satu hari (from = to) → 201; reason di-trim, hanya dosen yang melihat', async () => {
            const res = await blackout(day(3), day(3), {
                reason: '  Seminar  ',
            }).expect(201);
            expect(dataOf(res)).toEqual({
                created: [day(3)],
                skipped: [],
                cancelledConsultations: [],
            });
            const row = await prisma.blackoutDate.findFirstOrThrow();
            expect(row.reason).toBe('Seminar');
        });

        it('rentang → satu baris per tanggal; reason opsional → null', async () => {
            const res = await blackout(day(1), day(3)).expect(201);
            expect(dataOf<CreateResult>(res).created).toEqual([
                day(1),
                day(2),
                day(3),
            ]);
            expect(await blackoutDates()).toEqual([day(1), day(2), day(3)]);
            const rows = await prisma.blackoutDate.findMany();
            expect(rows.every((r) => r.reason === null)).toBe(true);
        });

        it('tanggal yang sudah di-blacklist dilewati, sisanya dibuat', async () => {
            await blackout(day(2)).expect(201);
            const res = await blackout(day(1), day(3)).expect(201);
            expect(dataOf<CreateResult>(res)).toMatchObject({
                created: [day(1), day(3)],
                skipped: [day(2)],
            });
            const again = await blackout(day(1), day(3)).expect(201);
            expect(dataOf<CreateResult>(again)).toMatchObject({
                created: [],
                skipped: [day(1), day(2), day(3)],
            });
        });

        it('reason hanya spasi → null', async () => {
            await blackout(day(3), day(3), { reason: '   ' }).expect(201);
            const row = await prisma.blackoutDate.findFirstOrThrow();
            expect(row.reason).toBeNull();
        });

        it('dua POST bersamaan untuk tanggal yang sama → keduanya 201, tetap satu baris', async () => {
            const results = await Promise.all([
                blackout(day(3), day(4)),
                blackout(day(3), day(4)),
            ]);
            expect(results.map((r) => r.status)).toEqual([201, 201]);
            const created = results.flatMap(
                (r) => dataOf<CreateResult>(r).created,
            );
            expect(created.sort()).toEqual([day(3), day(4)]);
            expect(await blackoutDates()).toEqual([day(3), day(4)]);
        });

        it('per dosen: dosen lain boleh tanggal yang sama', async () => {
            await blackout(day(3)).expect(201);
            await addBlackout(
                { from: day(3), to: day(3) },
                p.tokens.other,
            ).expect(201);
            expect(await blackoutDates(p.otherLecturer.id)).toEqual([day(3)]);
        });

        it('hari ini boleh; tanggal lampau → 400 DATE_IN_PAST', async () => {
            await blackout(day(0)).expect(201);
            const res = await blackout(day(-1), day(1)).expect(400);
            expect(codeOf(res)).toBe('DATE_IN_PAST');
            expect(await blackoutDates()).toEqual([day(0)]);
        });

        it('rentang 90 hari → 201; 91 hari / to < from → 400 INVALID_DATE_RANGE', async () => {
            const ok = await blackout(day(1), day(90)).expect(201);
            expect(dataOf<CreateResult>(ok).created).toHaveLength(90);
            for (const [from, to] of [
                [day(1), day(91)],
                [day(5), day(4)],
            ]) {
                const res = await blackout(from, to).expect(400);
                expect(codeOf(res)).toBe('INVALID_DATE_RANGE');
            }
        });

        it.each([
            ['from & to wajib', {}],
            ['to wajib', { from: '2099-01-01' }],
            ['format salah', { from: '01-12-2099', to: '2099-12-01' }],
            ['tanggal tidak ada', { from: '2099-02-30', to: '2099-03-01' }],
            [
                'reason > 255',
                {
                    from: '2099-01-01',
                    to: '2099-01-01',
                    reason: 'a'.repeat(256),
                },
            ],
            [
                'cancelConsultations bukan boolean',
                {
                    from: '2099-01-01',
                    to: '2099-01-01',
                    cancelConsultations: 'ya',
                },
            ],
            ['field lama "date"', { date: '2099-01-01' }],
        ])('%s → 400', async (_, body) => {
            await addBlackout(body).expect(400);
        });

        it('mahasiswa → 403', async () => {
            await addBlackout({ from: day(3), to: day(3) }, p.tokens.s1).expect(
                403,
            );
        });
    });

    describe('POST /me/blackout-dates — BR-10 (pratinjau & konfirmasi)', () => {
        it('tanpa konfirmasi → 409 + daftar terdampak; tidak ada yang berubah', async () => {
            const approved = await consultation(day(2), '09:00', '10:00');
            const proposed = await consultation(day(3), '13:00', '14:00', {
                status: 'requested',
                requestedDate: day(5),
            });
            const pending = await request_(day(1));

            const res = await blackout(day(1), day(3)).expect(409);
            expect(codeOf(res)).toBe('BLACKOUT_HAS_CONSULTATION');
            const affected = affectedOf(res);
            expect(affected.map((c) => c.id)).toEqual([
                pending.id,
                approved.id,
                proposed.id,
            ]);
            expect(affected[0]).toMatchObject({
                status: 'requested',
                topic: 'Bimbingan Uji',
                requestedDate: day(1),
                student: { id: p.studentS1.id, name: 'Andi S1' },
            });
            // tidak membocorkan email mahasiswa
            expect(affected[0].student).not.toHaveProperty('email');

            expect(await blackoutDates()).toEqual([]);
            for (const c of [approved, proposed, pending]) {
                expect(await statusOf(c.id)).toBe(c.status);
            }
        });

        it('dengan cancelConsultations: true → blacklist dibuat, terdampak dibatalkan + event E7', async () => {
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            const approved = await consultation(day(2), '09:00', '10:00');
            const pending = await request_(day(1));

            const res = await blackout(day(1), day(3), {
                reason: 'Dinas luar kota',
                cancelConsultations: true,
            }).expect(201);
            const data = dataOf<CreateResult>(res);
            expect(data.created).toEqual([day(1), day(2), day(3)]);
            expect(data.cancelledConsultations.map((c) => c.id)).toEqual([
                pending.id,
                approved.id,
            ]);

            for (const c of [approved, pending]) {
                const row = await prisma.consultation.findUniqueOrThrow({
                    where: { id: c.id },
                });
                expect(row.status).toBe('cancelled');
                expect(row.statusReason).toBe(GENERIC_REASON);
            }

            const events = emit.mock.calls.filter(
                ([name]) => name === CONSULTATION_CANCELLED,
            );
            expect(events).toHaveLength(2);
            const event = events.find(
                ([, e]) =>
                    (e as ConsultationCancelledEvent).consultationId ===
                    approved.id,
            )![1] as ConsultationCancelledEvent;
            expect(event).toBeInstanceOf(ConsultationCancelledEvent);
            expect(event).toMatchObject({
                project: { id: projectId },
                lecturer: { id: p.owner.id, name: 'Dosen Pemilik' },
                student: {
                    id: p.studentS1.id,
                    email: p.studentS1.email,
                },
                requestedDate: day(2),
                reason: GENERIC_REASON,
                cancelledBy: 'lecturer',
            });
            expect(event.startAt).toEqual(jakartaDateTime(day(2), '09:00'));
        });

        it('409 tidak memancarkan event pembatalan', async () => {
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            await consultation(day(2), '09:00', '10:00');
            await blackout(day(2)).expect(409);
            expect(emit).not.toHaveBeenCalledWith(
                CONSULTATION_CANCELLED,
                expect.anything(),
            );
        });

        it('event untuk pengajuan tanpa jam: startAt/endAt null, requestedDate terisi', async () => {
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            const pending = await request_(day(2));
            await blackout(day(2), day(2), {
                cancelConsultations: true,
            }).expect(201);
            const [, event] = emit.mock.calls.find(
                ([name]) => name === CONSULTATION_CANCELLED,
            )! as [string, ConsultationCancelledEvent];
            expect(event).toMatchObject({
                consultationId: pending.id,
                requestedDate: day(2),
                startAt: null,
                endAt: null,
            });
        });

        it('bimbingan di project lain milik dosen yang sama juga terdampak', async () => {
            const second = await createProject(prisma, p.owner.id, {
                title: 'Project Kedua',
            });
            await addMember(prisma, second.id, p.studentS2.id);
            const other = await consultation(day(2), '13:00', '14:00', {
                projectId: second.id,
                studentId: p.studentS2.id,
            });
            const res = await blackout(day(2)).expect(409);
            expect(affectedOf(res).map((c) => c.id)).toEqual([other.id]);
        });

        it('konfirmasi pada rentang yang sebagian sudah di-blacklist → skipped & cancelled sekaligus', async () => {
            await blackout(day(1)).expect(201);
            const approved = await consultation(day(2), '09:00', '10:00');
            const res = await blackout(day(1), day(2), {
                cancelConsultations: true,
            }).expect(201);
            expect(dataOf<CreateResult>(res)).toMatchObject({
                created: [day(2)],
                skipped: [day(1)],
            });
            expect(
                dataOf<CreateResult>(res).cancelledConsultations.map(
                    (c) => c.id,
                ),
            ).toEqual([approved.id]);
        });

        it('cancelConsultations: true tanpa yang terdampak → hanya membuat blacklist', async () => {
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            const res = await blackout(day(4), day(4), {
                cancelConsultations: true,
            }).expect(201);
            expect(dataOf<CreateResult>(res).cancelledConsultations).toEqual(
                [],
            );
            expect(emit).not.toHaveBeenCalledWith(
                CONSULTATION_CANCELLED,
                expect.anything(),
            );
        });

        it.each(['rejected', 'cancelled', 'completed'] as const)(
            'bimbingan %s tidak terdampak',
            async (status) => {
                await consultation(day(2), '09:00', '10:00', { status });
                await blackout(day(2)).expect(201);
            },
        );

        it('pengajuan yang tanggalnya di rentang tapi usulan jamnya di luar rentang tidak terdampak', async () => {
            const moved = await consultation(day(5), '09:00', '10:00', {
                status: 'requested',
                requestedDate: day(2),
            });
            await blackout(day(2)).expect(201);
            expect(await statusOf(moved.id)).toBe('requested');
        });

        it('approved yang sudah dimulai tidak dibatalkan', async () => {
            const now = Date.now();
            const started = await createConsultation(prisma, {
                projectId,
                lecturerId: p.owner.id,
                studentId: p.studentS1.id,
                status: 'approved',
                startAt: new Date(now - 60_000),
                endAt: new Date(now + 30 * 60_000),
            });
            await blackout(day(0), day(1), {
                cancelConsultations: true,
            }).expect(201);
            expect(await statusOf(started.id)).toBe('approved');
        });

        it('rentang dihitung WIB: bimbingan 00:30 WIB terdampak di tanggal itu, bukan sehari sebelumnya', async () => {
            await consultation(day(3), '00:30', '01:00');
            await blackout(day(2)).expect(201);
            await blackout(day(3)).expect(409);
        });

        it('bimbingan dosen lain / project terhapus / di luar rentang tidak terdampak', async () => {
            const foreign = await createProject(prisma, p.otherLecturer.id);
            await consultation(day(2), '09:00', '10:00', {
                projectId: foreign.id,
                lecturerId: p.otherLecturer.id,
            });
            const gone = await createProject(prisma, p.owner.id, {
                deletedAt: new Date(),
            });
            await consultation(day(2), '11:00', '12:00', {
                projectId: gone.id,
            });
            await consultation(day(4), '09:00', '10:00');
            await blackout(day(1), day(3)).expect(201);
        });
    });

    describe('GET /me/blackout-dates', () => {
        beforeEach(async () => {
            for (const n of [1, 5, 10]) await blackout(day(n)).expect(201);
            await addBlackout(
                { from: day(2), to: day(2) },
                p.tokens.other,
            ).expect(201);
        });
        const list = (qs = '') =>
            as(p.tokens.owner).get(
                `/api/v1/me/blackout-dates${qs ? `?${qs}` : ''}`,
            );
        const datesOf = (res: request.Response) =>
            dataOf<Blackout[]>(res).map((b) => b.date);

        it('hanya milik sendiri; default terbaru dulu; bentuk item', async () => {
            const res = await list().expect(200);
            expect(datesOf(res)).toEqual([day(10), day(5), day(1)]);
            expect(metaOf(res).total).toBe(3);
            expect(dataOf<Blackout[]>(res)[0]).toEqual({
                id: expect.any(String) as string,
                date: day(10),
                reason: null,
                createdAt: expect.any(String) as string,
            });
        });

        it('filter from/to (inklusif) + order asc', async () => {
            const res = await list(
                `from=${day(1)}&to=${day(5)}&order=asc`,
            ).expect(200);
            expect(datesOf(res)).toEqual([day(1), day(5)]);
        });

        it('pagination', async () => {
            const res = await list('order=asc&limit=2&page=2').expect(200);
            expect(datesOf(res)).toEqual([day(10)]);
            expect(metaOf(res)).toMatchObject({ total: 3, totalPages: 2 });
        });

        it.each([
            ['from salah', 'from=2026-13-01'],
            ['limit > 100', 'limit=101'],
            ['query tak dikenal', 'foo=bar'],
        ])('%s → 400', async (_, qs) => {
            await list(qs).expect(400);
        });

        it('mahasiswa → 403', async () => {
            await as(p.tokens.s1).get('/api/v1/me/blackout-dates').expect(403);
        });
    });

    describe('DELETE /me/blackout-dates?from&to', () => {
        const removeRange = (qs: string, token = p.tokens.owner) =>
            as(token).delete(`/api/v1/me/blackout-dates?${qs}`);

        it('menghapus semua blacklist sendiri di rentang → 200 daftar yang dihapus', async () => {
            await blackout(day(1), day(5)).expect(201);
            await addBlackout(
                { from: day(2), to: day(2) },
                p.tokens.other,
            ).expect(201);
            const res = await removeRange(`from=${day(2)}&to=${day(3)}`).expect(
                200,
            );
            expect(dataOf(res)).toEqual({ deleted: [day(2), day(3)] });
            expect(await blackoutDates()).toEqual([day(1), day(4), day(5)]);
            expect(await blackoutDates(p.otherLecturer.id)).toEqual([day(2)]);
        });

        it('setelah dihapus, tanggal kembali available di available-days', async () => {
            await blackout(day(2)).expect(201);
            const daysUrl = `/api/v1/projects/${projectId}/available-days?from=${day(2)}&to=${day(2)}`;
            const before_ = await as(p.tokens.s1).get(daysUrl).expect(200);
            expect(dataOf<DayStatus[]>(before_)[0].status).toBe('unavailable');
            await removeRange(`from=${day(2)}&to=${day(2)}`).expect(200);
            const after = await as(p.tokens.s1).get(daysUrl).expect(200);
            expect(dataOf<DayStatus[]>(after)[0].status).toBe('available');
        });

        it('rentang tanpa blacklist → deleted kosong', async () => {
            const res = await removeRange(`from=${day(1)}&to=${day(2)}`).expect(
                200,
            );
            expect(dataOf(res)).toEqual({ deleted: [] });
        });

        it('rentang lampau boleh dihapus', async () => {
            await prisma.blackoutDate.create({
                data: {
                    lecturerId: p.owner.id,
                    date: new Date(`${day(-2)}T00:00:00.000Z`),
                },
            });
            const res = await removeRange(
                `from=${day(-3)}&to=${day(-1)}`,
            ).expect(200);
            expect(dataOf(res)).toEqual({ deleted: [day(-2)] });
        });

        it.each([
            ['from & to wajib', ''],
            ['to < from', `from=2099-01-05&to=2099-01-04`],
            ['> 90 hari', `from=2099-01-01&to=2099-04-01`],
            ['format salah', `from=2099-1-1&to=2099-01-02`],
        ])('%s → 400', async (_, qs) => {
            await removeRange(qs).expect(400);
        });

        it('mahasiswa → 403', async () => {
            await removeRange(
                `from=${day(1)}&to=${day(2)}`,
                p.tokens.s1,
            ).expect(403);
        });
    });

    describe('DELETE /me/blackout-dates/:id', () => {
        const idOf = async () =>
            (await prisma.blackoutDate.findFirstOrThrow()).id;

        it('pemilik → 200 data yang dihapus; hapus ulang → 404', async () => {
            await blackout(day(3)).expect(201);
            const url = `/api/v1/me/blackout-dates/${await idOf()}`;
            const res = await as(p.tokens.owner).delete(url).expect(200);
            expect(dataOf(res)).toMatchObject({ date: day(3) });
            const again = await as(p.tokens.owner).delete(url).expect(404);
            expect(codeOf(again)).toBe('BLACKOUT_NOT_FOUND');
            await blackout(day(3)).expect(201);
        });

        it('milik dosen lain → 404 dan tidak terhapus', async () => {
            await blackout(day(3)).expect(201);
            await as(p.tokens.other)
                .delete(`/api/v1/me/blackout-dates/${await idOf()}`)
                .expect(404);
            expect(await prisma.blackoutDate.count()).toBe(1);
        });

        it('id tidak ada → 404; bukan UUID → 400; mahasiswa → 403', async () => {
            await as(p.tokens.owner)
                .delete(`/api/v1/me/blackout-dates/${MISSING_ID}`)
                .expect(404);
            await as(p.tokens.owner)
                .delete('/api/v1/me/blackout-dates/abc')
                .expect(400);
            await as(p.tokens.s1)
                .delete(`/api/v1/me/blackout-dates/${MISSING_ID}`)
                .expect(403);
        });
    });

    describe('GET /projects/:projectId/available-days', () => {
        const days = (qs: string, token = p.tokens.s1) =>
            as(token).get(`/api/v1/projects/${projectId}/available-days?${qs}`);
        const statuses = (res: request.Response) =>
            dataOf<DayStatus[]>(res).map((d) => d.status);

        it('setiap tanggal dalam rentang punya status; tanpa blacklist semua tersedia', async () => {
            const res = await days(`from=${day(1)}&to=${day(3)}`).expect(200);
            expect(dataOf(res)).toEqual(
                [1, 2, 3].map((n) => ({ date: day(n), status: 'available' })),
            );
        });

        it('pemilik project juga bisa melihat', async () => {
            await days(`from=${day(1)}&to=${day(1)}`, p.tokens.owner).expect(
                200,
            );
        });

        it('blacklist dosen project → unavailable tanpa alasan; blacklist dosen lain tidak berpengaruh', async () => {
            await blackout(day(2), day(2), { reason: 'Sakit' }).expect(201);
            await addBlackout(
                { from: day(3), to: day(3) },
                p.tokens.other,
            ).expect(201);
            const res = await days(`from=${day(1)}&to=${day(3)}`).expect(200);
            expect(dataOf(res)).toEqual([
                { date: day(1), status: 'available' },
                { date: day(2), status: 'unavailable' },
                { date: day(3), status: 'available' },
            ]);
            expect(JSON.stringify(res.body)).not.toContain('Sakit');
        });

        it('bimbingan yang sudah ada tidak membuat tanggal unavailable', async () => {
            await consultation(day(2), '09:00', '17:00');
            const res = await days(`from=${day(2)}&to=${day(2)}`).expect(200);
            expect(statuses(res)).toEqual(['available']);
        });

        it('tanggal lampau & lebih dari 60 hari → unavailable', async () => {
            const past = await days(`from=${day(-2)}&to=${day(0)}`).expect(200);
            expect(statuses(past)).toEqual([
                'unavailable',
                'unavailable',
                'available',
            ]);
            const far = await days(`from=${day(59)}&to=${day(62)}`).expect(200);
            expect(statuses(far)).toEqual([
                'available',
                'available',
                'unavailable',
                'unavailable',
            ]);
        });

        it('rentang tepat 42 hari (grid kalender) → 200; 43 hari / to < from → 400', async () => {
            const ok = await days(`from=${day(-7)}&to=${day(34)}`).expect(200);
            expect(dataOf<DayStatus[]>(ok)).toHaveLength(42);
            for (const qs of [
                `from=${day(1)}&to=${day(43)}`,
                `from=${day(5)}&to=${day(4)}`,
            ]) {
                const res = await days(qs).expect(400);
                expect(codeOf(res)).toBe('INVALID_DATE_RANGE');
            }
        });

        it.each([
            ['from & to wajib', ''],
            ['to wajib', 'from=2026-12-01'],
            ['format salah', 'from=2026-12-1&to=2026-12-02'],
            ['tanggal tidak ada', 'from=2026-02-30&to=2026-03-01'],
        ])('%s → 400', async (_, qs) => {
            await days(qs).expect(400);
        });

        it('endpoint lama /slots dan /me/office-hours → 404', async () => {
            await as(p.tokens.s1)
                .get(
                    `/api/v1/projects/${projectId}/slots?from=${day(1)}&to=${day(1)}`,
                )
                .expect(404);
            await as(p.tokens.owner).get('/api/v1/me/office-hours').expect(404);
        });

        it('bukan anggota / dosen lain / project terhapus → 404; id salah → 400; tanpa token → 401', async () => {
            const qs = `from=${day(1)}&to=${day(1)}`;
            await days(qs, p.tokens.s2).expect(404);
            await days(qs, p.tokens.other).expect(404);
            await http()
                .get(`/api/v1/projects/${projectId}/available-days?${qs}`)
                .expect(401);
            await as(p.tokens.s1)
                .get(`/api/v1/projects/abc/available-days?${qs}`)
                .expect(400);
            await prisma.project.update({
                where: { id: projectId },
                data: { deletedAt: new Date() },
            });
            await days(qs).expect(404);
        });
    });
});
