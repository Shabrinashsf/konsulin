import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    CONSULTATION_EVENTS,
    ConsultationEvent,
} from '../src/modules/consultation/consultation-events';
import { PrismaService } from '../src/prisma/prisma.service';
import {
    CONSULTATION_CANCELLED,
    ConsultationCancelledEvent,
} from '../src/shared/consultation/consultation-cancelled.event';
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
type View = {
    id: string;
    status: string;
    turn: 'lecturer' | 'student' | null;
    proposedBy: string | null;
    mode: string;
    topic: string;
    note: string | null;
    requestedDate: string;
    startAt: string | null;
    endAt: string | null;
    location: string | null;
    statusReason: string | null;
    summary: string | null;
    project: { id: string; trackMode: string };
    student: Record<string, unknown>;
    lecturer: Record<string, unknown>;
};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Consultations (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let p: People;
    let indiv: string; // s1_thesis: s1 & s2 are members (individual track)
    let team: string; // research: s1 & s2 are members (shared)

    const today = () => toJakartaDate(new Date());
    const day = (n: number) => addDays(today(), n);
    const iso = (d: string, t: string) => jakartaDateTime(d, t).toISOString();
    const slot = (d = day(3), start = '09:00', end = '10:00') => ({
        startAt: iso(d, start),
        endAt: iso(d, end),
    });

    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({
        get: (url: string) => http().get(url).auth(token, { type: 'bearer' }),
        post: (url: string) => http().post(url).auth(token, { type: 'bearer' }),
        delete: (url: string) =>
            http().delete(url).auth(token, { type: 'bearer' }),
    });
    const submit = (
        projectId = indiv,
        token = p.tokens.s1,
        over: Record<string, unknown> = {},
    ) =>
        as(token)
            .post(`/api/v1/projects/${projectId}/consultations`)
            .send({
                requestedDate: day(3),
                topic: 'Bab 3 Metodologi',
                agenda: 'Diskusi rancangan eksperimen',
                mode: 'offline',
                ...over,
            });
    const act = (id: string, action: string, token: string, body = {}) =>
        as(token).post(`/api/v1/consultations/${id}/${action}`).send(body);
    const idOf = (res: request.Response) => dataOf<View>(res).id;
    const viewOf = (res: request.Response) => dataOf<View>(res);
    const statusOf = async (id: string) =>
        (await prisma.consultation.findUniqueOrThrow({ where: { id } })).status;
    const spyEvents = () => {
        const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
        return (name: string): unknown[] =>
            (emit.mock.calls as [unknown, unknown][])
                .filter(([n]) => n === name)
                .map(([, e]) => e);
    };

    /** request → lecturer proposes (with location) → returns id, student's turn */
    const proposed = async (projectId = indiv, token = p.tokens.s1) => {
        const id = idOf(await submit(projectId, token).expect(201));
        await act(id, 'propose', p.tokens.owner, {
            ...slot(),
            location: 'Ruang 101',
        }).expect(200);
        return id;
    };
    /** approved consultation of s1 in `indiv`, created directly */
    const approved = (over: Record<string, unknown> = {}) =>
        createConsultation(prisma, {
            projectId: indiv,
            lecturerId: p.owner.id,
            studentId: p.studentS1.id,
            status: 'approved',
            startAt: jakartaDateTime(day(3), '09:00'),
            endAt: jakartaDateTime(day(3), '10:00'),
            ...over,
        }).then(async (c) => {
            await prisma.consultation.update({
                where: { id: c.id },
                data: { location: 'Ruang 101' },
            });
            return c;
        });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await resetState(app);
        p = await seedPeople(app);
        indiv = (
            await createProject(prisma, p.owner.id, {
                title: 'TA Individu',
                type: 's1_thesis',
            })
        ).id;
        team = (
            await createProject(prisma, p.owner.id, {
                title: 'Riset Tim',
                type: 'research',
            })
        ).id;
        for (const projectId of [indiv, team]) {
            await addMember(prisma, projectId, p.studentS1.id);
            await addMember(prisma, projectId, p.studentS2.id);
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /projects/:projectId/consultations (ajukan tanggal)', () => {
        it('201 → requested, giliran dosen, tanpa jam; event E2 ke dosen', async () => {
            const events = spyEvents();
            const res = await submit(indiv, p.tokens.s1, {
                note: '  Mohon pagi  ',
            }).expect(201);
            expect(viewOf(res)).toMatchObject({
                status: 'requested',
                turn: 'lecturer',
                proposedBy: null,
                topic: 'Bab 3 Metodologi',
                mode: 'offline',
                note: 'Mohon pagi',
                requestedDate: day(3),
                startAt: null,
                endAt: null,
                location: null,
                project: { id: indiv, trackMode: 'individual' },
                student: { id: p.studentS1.id, name: 'Andi S1' },
                lecturer: { id: p.owner.id, name: 'Dosen Pemilik' },
            });
            // email tidak bocor di respons
            expect(viewOf(res).student).not.toHaveProperty('email');
            const [event] = events(CONSULTATION_EVENTS.requested);
            expect(event).toBeInstanceOf(ConsultationEvent);
            expect(event).toMatchObject({
                actor: 'student',
                lecturer: { email: 'owner@example.com' },
                extra: { note: 'Mohon pagi' },
            });
        });

        it('hari ini & akhir pekan boleh (tanpa office hours)', async () => {
            await submit(indiv, p.tokens.s1, { requestedDate: day(0) }).expect(
                201,
            );
        });

        it.each([
            ['tanggal lampau', () => day(-1)],
            ['lebih dari 60 hari', () => day(61)],
        ])('%s → 400 DATE_NOT_AVAILABLE', async (_, date) => {
            const res = await submit(indiv, p.tokens.s1, {
                requestedDate: date(),
            }).expect(400);
            expect(codeOf(res)).toBe('DATE_NOT_AVAILABLE');
        });

        it('tanggal blacklist dosen → 400 DATE_NOT_AVAILABLE', async () => {
            await prisma.blackoutDate.create({
                data: {
                    lecturerId: p.owner.id,
                    date: new Date(`${day(3)}T00:00:00.000Z`),
                },
            });
            const res = await submit().expect(400);
            expect(codeOf(res)).toBe('DATE_NOT_AVAILABLE');
        });

        it('BR-19: pengajuan kedua di project sama → 409; project lain boleh', async () => {
            await submit().expect(201);
            const res = await submit(indiv, p.tokens.s1, {
                requestedDate: day(4),
            }).expect(409);
            expect(codeOf(res)).toBe('CONSULTATION_PENDING_EXISTS');
            await submit(team).expect(201);
            await submit(indiv, p.tokens.s2).expect(201);
        });

        it('BR-19: pengajuan expired / dibatalkan / approved tidak menghalangi', async () => {
            await createConsultation(prisma, {
                projectId: indiv,
                lecturerId: p.owner.id,
                studentId: p.studentS1.id,
                status: 'requested',
                requestedDate: day(-2),
            });
            await approved();
            const res = await submit().expect(201);
            await act(idOf(res), 'cancel', p.tokens.s1).expect(200);
            await submit().expect(201);
        });

        it('dua pengajuan bersamaan di project sama → satu 201, satu 409 (kunci dosen)', async () => {
            const results = await Promise.all([
                submit(indiv, p.tokens.s1, { requestedDate: day(3) }),
                submit(indiv, p.tokens.s1, { requestedDate: day(4) }),
            ]);
            expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
            expect(
                await prisma.consultation.count({
                    where: { projectId: indiv, studentId: p.studentS1.id },
                }),
            ).toBe(1);
        });

        it('project terhapus → 404', async () => {
            await prisma.project.update({
                where: { id: indiv },
                data: { deletedAt: new Date() },
            });
            await submit().expect(404);
        });

        it.each([
            ['topik < 3', { topic: 'ab' }],
            ['agenda wajib', { agenda: undefined }],
            ['mode tak dikenal', { mode: 'hybrid' }],
            ['catatan > 1000', { note: 'a'.repeat(1001) }],
            ['format tanggal', { requestedDate: '2026-1-1' }],
            ['field tak dikenal', { startAt: iso(day(3), '09:00') }],
        ])('%s → 400', async (_, over) => {
            await submit(indiv, p.tokens.s1, over).expect(400);
        });

        it('dosen → 403; bukan anggota → 404', async () => {
            await submit(indiv, p.tokens.owner).expect(403);
            await submit(indiv, p.tokens.s3).expect(404);
        });
    });

    describe('POST /consultations/:id/propose', () => {
        let id: string;
        beforeEach(async () => {
            id = idOf(await submit().expect(201));
        });

        it('dosen mengusulkan jam + lokasi → giliran mahasiswa; event E11', async () => {
            const events = spyEvents();
            const res = await act(id, 'propose', p.tokens.owner, {
                ...slot(),
                location: '  Ruang 101  ',
            }).expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'requested',
                proposedBy: 'lecturer',
                turn: 'student',
                startAt: iso(day(3), '09:00'),
                endAt: iso(day(3), '10:00'),
                location: 'Ruang 101',
            });
            expect(events(CONSULTATION_EVENTS.proposed)[0]).toMatchObject({
                actor: 'lecturer',
            });
        });

        it('usulan dosen tanpa lokasi saat belum ada lokasi → 400 LOCATION_REQUIRED', async () => {
            const res = await act(id, 'propose', p.tokens.owner, slot()).expect(
                400,
            );
            expect(codeOf(res)).toBe('LOCATION_REQUIRED');
        });

        it('dosen boleh mengganti mode; usulan berikutnya boleh tanpa lokasi', async () => {
            await act(id, 'propose', p.tokens.owner, {
                ...slot(),
                location: 'Ruang 101',
            }).expect(200);
            await act(
                id,
                'propose',
                p.tokens.s1,
                slot(day(3), '13:00', '14:00'),
            ).expect(200);
            const res = await act(id, 'propose', p.tokens.owner, {
                ...slot(day(4)),
                mode: 'online',
            }).expect(200);
            expect(viewOf(res)).toMatchObject({
                mode: 'online',
                location: 'Ruang 101',
            });
        });

        it('waktu dengan offset +07:00 diterima dan disimpan sebagai instant yang benar', async () => {
            const res = await act(id, 'propose', p.tokens.owner, {
                startAt: `${day(3)}T09:00:00+07:00`,
                endAt: `${day(3)}T10:00:00+07:00`,
                location: 'Ruang 101',
            }).expect(200);
            expect(viewOf(res).startAt).toBe(iso(day(3), '09:00'));
        });

        it('dua usulan dosen bersamaan → satu 200, satu 409', async () => {
            const results = await Promise.all([
                act(id, 'propose', p.tokens.owner, {
                    ...slot(),
                    location: 'R1',
                }),
                act(id, 'propose', p.tokens.owner, {
                    ...slot(day(4)),
                    location: 'R2',
                }),
            ]);
            expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        });

        it('usulan mahasiswa membalik giliran ke dosen', async () => {
            await act(id, 'propose', p.tokens.owner, {
                ...slot(),
                location: 'Ruang 101',
            }).expect(200);
            const res = await act(
                id,
                'propose',
                p.tokens.s1,
                slot(day(3), '13:00', '14:00'),
            ).expect(200);
            expect(viewOf(res)).toMatchObject({
                proposedBy: 'student',
                turn: 'lecturer',
                startAt: iso(day(3), '13:00'),
            });
        });

        it('bukan giliran → 409 NOT_YOUR_TURN', async () => {
            const first = await act(id, 'propose', p.tokens.s1, slot()).expect(
                409,
            );
            expect(codeOf(first)).toBe('NOT_YOUR_TURN');
            await act(id, 'propose', p.tokens.owner, {
                ...slot(),
                location: 'Ruang 101',
            }).expect(200);
            const again = await act(id, 'propose', p.tokens.owner, {
                ...slot(day(4)),
            }).expect(409);
            expect(codeOf(again)).toBe('NOT_YOUR_TURN');
        });

        it('mahasiswa mengirim lokasi / mode → 400 FIELD_NOT_ALLOWED', async () => {
            await act(id, 'propose', p.tokens.owner, {
                ...slot(),
                location: 'Ruang 101',
            }).expect(200);
            for (const extra of [{ location: 'Kafe' }, { mode: 'online' }]) {
                const res = await act(id, 'propose', p.tokens.s1, {
                    ...slot(day(4)),
                    ...extra,
                }).expect(400);
                expect(codeOf(res)).toBe('FIELD_NOT_ALLOWED');
            }
        });

        it('boleh di tanggal lain dari tanggal yang diajukan', async () => {
            const res = await act(id, 'propose', p.tokens.owner, {
                ...slot(day(10)),
                location: 'Ruang 101',
            }).expect(200);
            expect(viewOf(res)).toMatchObject({ requestedDate: day(3) });
        });

        it.each([
            [
                'durasi < 15 menit',
                () => slot(day(3), '09:00', '09:10'),
                'INVALID_TIME_RANGE',
            ],
            [
                'durasi > 4 jam',
                () => slot(day(3), '08:00', '12:30'),
                'INVALID_TIME_RANGE',
            ],
            [
                'selesai sebelum mulai',
                () => slot(day(3), '10:00', '09:00'),
                'INVALID_TIME_RANGE',
            ],
            [
                'melewati tengah malam',
                () => ({
                    startAt: iso(day(3), '23:30'),
                    endAt: iso(day(4), '00:30'),
                }),
                'INVALID_TIME_RANGE',
            ],
            [
                'kurang dari 1 jam dari sekarang',
                () => ({
                    startAt: new Date(Date.now() + 30 * 60_000).toISOString(),
                    endAt: new Date(Date.now() + 60 * 60_000).toISOString(),
                }),
                'OUTSIDE_BOOKING_WINDOW',
            ],
            [
                'lebih dari 60 hari',
                () => slot(day(62)),
                'OUTSIDE_BOOKING_WINDOW',
            ],
        ])('%s → 400 %s', async (_, time, code) => {
            const res = await act(id, 'propose', p.tokens.owner, {
                ...time(),
                location: 'Ruang 101',
            }).expect(400);
            expect(codeOf(res)).toBe(code);
        });

        it('tanggal blacklist → 400 DATE_BLACKLISTED', async () => {
            await prisma.blackoutDate.create({
                data: {
                    lecturerId: p.owner.id,
                    date: new Date(`${day(5)}T00:00:00.000Z`),
                },
            });
            const res = await act(id, 'propose', p.tokens.owner, {
                ...slot(day(5)),
                location: 'Ruang 101',
            }).expect(400);
            expect(codeOf(res)).toBe('DATE_BLACKLISTED');
        });

        it('bentrok dengan bimbingan approved dosen → 409 CONSULTATION_OVERLAP', async () => {
            await approved({ studentId: p.studentS2.id });
            const res = await act(id, 'propose', p.tokens.owner, {
                ...slot(day(3), '09:30', '10:30'),
                location: 'Ruang 101',
            }).expect(409);
            expect(codeOf(res)).toBe('CONSULTATION_OVERLAP');
            // bersebelahan [) tidak bentrok
            await act(id, 'propose', p.tokens.owner, {
                ...slot(day(3), '10:00', '11:00'),
                location: 'Ruang 101',
            }).expect(200);
        });

        it.each([
            [
                'format waktu tanpa zona',
                {
                    startAt: '2099-01-01T09:00:00',
                    endAt: '2099-01-01T10:00:00',
                },
            ],
            ['startAt wajib', { endAt: '2099-01-01T10:00:00Z' }],
            [
                'lokasi > 255',
                {
                    ...{
                        startAt: '2099-01-01T09:00:00Z',
                        endAt: '2099-01-01T10:00:00Z',
                    },
                    location: 'a'.repeat(256),
                },
            ],
        ])('%s → 400', async (_, body) => {
            await act(id, 'propose', p.tokens.owner, body).expect(400);
        });
    });

    describe('POST /consultations/:id/accept', () => {
        it('mahasiswa menerima usulan dosen → approved; event E3', async () => {
            const id = await proposed();
            const events = spyEvents();
            const res = await act(id, 'accept', p.tokens.s1).expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'approved',
                turn: null,
                location: 'Ruang 101',
                startAt: iso(day(3), '09:00'),
            });
            expect(events(CONSULTATION_EVENTS.approved)[0]).toMatchObject({
                actor: 'student',
                icsSequence: 0,
            });
        });

        it('pertemuan tim di project shared: event membawa trackMode shared (email ke semua anggota)', async () => {
            const id = await proposed(team, p.tokens.s1);
            const events = spyEvents();
            await act(id, 'accept', p.tokens.s1).expect(200);
            expect(events(CONSULTATION_EVENTS.approved)[0]).toMatchObject({
                project: { id: team, trackMode: 'shared' },
            });
        });

        it('dosen menerima usulan mahasiswa sambil mengisi lokasi', async () => {
            const id = idOf(await submit().expect(201));
            await act(id, 'propose', p.tokens.owner, {
                ...slot(),
                location: 'Ruang 101',
            }).expect(200);
            await act(id, 'propose', p.tokens.s1, slot(day(4))).expect(200);
            const res = await act(id, 'accept', p.tokens.owner, {
                location: 'Lab RPL',
            }).expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'approved',
                location: 'Lab RPL',
                startAt: iso(day(4), '09:00'),
            });
        });

        it('tanpa lokasi sama sekali → 400 LOCATION_REQUIRED', async () => {
            const c = await createConsultation(prisma, {
                projectId: indiv,
                lecturerId: p.owner.id,
                studentId: p.studentS1.id,
                status: 'requested',
                requestedDate: day(3),
                startAt: jakartaDateTime(day(3), '09:00'),
                endAt: jakartaDateTime(day(3), '10:00'),
            });
            await prisma.consultation.update({
                where: { id: c.id },
                data: { proposedBy: 'student' },
            });
            const res = await act(c.id, 'accept', p.tokens.owner).expect(400);
            expect(codeOf(res)).toBe('LOCATION_REQUIRED');
        });

        it('bukan giliran / belum ada usulan → 409', async () => {
            const id = idOf(await submit().expect(201));
            expect(
                codeOf(await act(id, 'accept', p.tokens.s1).expect(409)),
            ).toBe('NOT_YOUR_TURN');
            expect(
                codeOf(await act(id, 'accept', p.tokens.owner).expect(409)),
            ).toBe('NO_PROPOSAL');
            await act(id, 'propose', p.tokens.owner, {
                ...slot(),
                location: 'Ruang 101',
            }).expect(200);
            expect(
                codeOf(await act(id, 'accept', p.tokens.owner).expect(409)),
            ).toBe('NOT_YOUR_TURN');
        });

        it('usulan yang sudah lewat → 409 PROPOSAL_EXPIRED', async () => {
            const id = await proposed();
            await prisma.consultation.update({
                where: { id },
                data: {
                    startAt: new Date(Date.now() - 60_000),
                    endAt: new Date(Date.now() + 30 * 60_000),
                },
            });
            const res = await act(id, 'accept', p.tokens.s1).expect(409);
            expect(codeOf(res)).toBe('PROPOSAL_EXPIRED');
        });

        it('jam sudah terisi bimbingan lain saat diterima → 409 CONSULTATION_OVERLAP', async () => {
            const id = await proposed();
            await approved({ studentId: p.studentS2.id });
            const res = await act(id, 'accept', p.tokens.s1).expect(409);
            expect(codeOf(res)).toBe('CONSULTATION_OVERLAP');
            expect(await statusOf(id)).toBe('requested');
        });

        it('mahasiswa mengirim lokasi → 400 FIELD_NOT_ALLOWED', async () => {
            const id = await proposed();
            const res = await act(id, 'accept', p.tokens.s1, {
                location: 'Kafe',
            }).expect(400);
            expect(codeOf(res)).toBe('FIELD_NOT_ALLOWED');
        });

        it('dua usulan bentrok diterima bersamaan → tepat satu approved', async () => {
            const a = await proposed(indiv, p.tokens.s1);
            const b = await proposed(indiv, p.tokens.s2);
            const results = await Promise.all([
                act(a, 'accept', p.tokens.s1),
                act(b, 'accept', p.tokens.s2),
            ]);
            expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
            expect(
                await prisma.consultation.count({
                    where: { status: 'approved' },
                }),
            ).toBe(1);
        });
    });

    describe('POST /consultations/:id/reject', () => {
        it('dosen menolak saat gilirannya → rejected + alasan; event E4', async () => {
            const id = idOf(await submit().expect(201));
            const events = spyEvents();
            const res = await act(id, 'reject', p.tokens.owner, {
                reason: '  Fokus revisi dulu  ',
            }).expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'rejected',
                statusReason: 'Fokus revisi dulu',
            });
            expect(events(CONSULTATION_EVENTS.rejected)[0]).toMatchObject({
                extra: { reason: 'Fokus revisi dulu' },
            });
        });

        it('dosen boleh menolak setelah mahasiswa mengusulkan balik', async () => {
            const id = await proposed();
            await act(id, 'propose', p.tokens.s1, slot(day(4))).expect(200);
            const res = await act(id, 'reject', p.tokens.owner, {
                reason: 'Jadwal penuh',
            }).expect(200);
            expect(viewOf(res).status).toBe('rejected');
        });

        it('giliran mahasiswa → 409; alasan wajib → 400; mahasiswa → 403', async () => {
            const id = await proposed();
            expect(
                codeOf(
                    await act(id, 'reject', p.tokens.owner, {
                        reason: 'x',
                    }).expect(409),
                ),
            ).toBe('NOT_YOUR_TURN');
            await act(id, 'reject', p.tokens.owner, { reason: '   ' }).expect(
                400,
            );
            await act(id, 'reject', p.tokens.s1, { reason: 'x' }).expect(403);
        });
    });

    describe('BR-21: pengajuan expired', () => {
        const expired = async (startAt?: Date) =>
            (
                await createConsultation(prisma, {
                    projectId: indiv,
                    lecturerId: p.owner.id,
                    studentId: p.studentS1.id,
                    status: 'requested',
                    requestedDate: day(-2),
                    startAt,
                    endAt: startAt && new Date(startAt.getTime() + 3_600_000),
                })
            ).id;

        it('tanpa usulan / usulan sudah lewat → status expired, giliran null', async () => {
            for (const id of [
                await expired(),
                await expired(jakartaDateTime(day(-2), '09:00')),
            ]) {
                const res = await as(p.tokens.s1)
                    .get(`/api/v1/consultations/${id}`)
                    .expect(200);
                expect(viewOf(res)).toMatchObject({
                    status: 'expired',
                    turn: null,
                });
            }
        });

        it('usulan masih di masa depan → tetap requested', async () => {
            const id = await expired(jakartaDateTime(day(2), '09:00'));
            await prisma.consultation.update({
                where: { id },
                data: { proposedBy: 'lecturer' },
            });
            const res = await as(p.tokens.s1)
                .get(`/api/v1/consultations/${id}`)
                .expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'requested',
                turn: 'student',
            });
        });

        it('aksi pada pengajuan expired → 409 CONSULTATION_EXPIRED', async () => {
            const id = await expired();
            for (const [action, token, body] of [
                ['propose', p.tokens.owner, { ...slot(), location: 'R' }],
                ['reject', p.tokens.owner, { reason: 'x' }],
                ['cancel', p.tokens.s1, {}],
            ] as const) {
                const res = await act(id, action, token, body).expect(409);
                expect(codeOf(res)).toBe('CONSULTATION_EXPIRED');
            }
        });
    });

    describe('POST /projects/:projectId/consultations/schedule', () => {
        const schedule = (
            over: Record<string, unknown> = {},
            token = p.tokens.owner,
        ) =>
            as(token)
                .post(`/api/v1/projects/${indiv}/consultations/schedule`)
                .send({
                    studentId: p.studentS1.id,
                    ...slot(day(5)),
                    topic: 'Review progres',
                    agenda: 'Cek bab 4',
                    mode: 'online',
                    location: 'https://meet.example.com/abc',
                    ...over,
                });

        it('201 → langsung approved; requestedDate dari tanggal mulai; event E5', async () => {
            const events = spyEvents();
            const res = await schedule().expect(201);
            expect(viewOf(res)).toMatchObject({
                status: 'approved',
                proposedBy: 'lecturer',
                requestedDate: day(5),
                location: 'https://meet.example.com/abc',
                student: { id: p.studentS1.id },
            });
            expect(events(CONSULTATION_EVENTS.scheduled)).toHaveLength(1);
        });

        it('mahasiswa bukan anggota → 400 STUDENT_NOT_MEMBER', async () => {
            const res = await schedule({ studentId: p.studentS3.id }).expect(
                400,
            );
            expect(codeOf(res)).toBe('STUDENT_NOT_MEMBER');
        });

        it('bentrok → 409; blacklist → 400; waktu tidak valid → 400', async () => {
            await approved({
                startAt: jakartaDateTime(day(5), '09:30'),
                endAt: jakartaDateTime(day(5), '10:30'),
            });
            expect(codeOf(await schedule().expect(409))).toBe(
                'CONSULTATION_OVERLAP',
            );
            await prisma.blackoutDate.create({
                data: {
                    lecturerId: p.owner.id,
                    date: new Date(`${day(6)}T00:00:00.000Z`),
                },
            });
            expect(codeOf(await schedule(slot(day(6))).expect(400))).toBe(
                'DATE_BLACKLISTED',
            );
            expect(
                codeOf(
                    await schedule(slot(day(7), '09:00', '09:05')).expect(400),
                ),
            ).toBe('INVALID_TIME_RANGE');
        });

        it('lokasi wajib → 400; mahasiswa → 403; project dosen lain → 404', async () => {
            await schedule({ location: undefined }).expect(400);
            await schedule({}, p.tokens.s1).expect(403);
            await schedule({}, p.tokens.other).expect(404);
        });
    });

    describe('POST /consultations/:id/reschedule', () => {
        it('approved → jam baru, ics_sequence + 1, reminder direset; event E6', async () => {
            const c = await approved();
            await prisma.consultation.update({
                where: { id: c.id },
                data: { reminderSentAt: new Date() },
            });
            const events = spyEvents();
            const res = await act(c.id, 'reschedule', p.tokens.owner, {
                ...slot(day(4), '13:00', '14:00'),
                mode: 'online',
                location: 'https://meet.example.com/x',
            }).expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'approved',
                startAt: iso(day(4), '13:00'),
                mode: 'online',
                location: 'https://meet.example.com/x',
            });
            const row = await prisma.consultation.findUniqueOrThrow({
                where: { id: c.id },
            });
            expect(row.icsSequence).toBe(1);
            expect(row.reminderSentAt).toBeNull();
            expect(events(CONSULTATION_EVENTS.rescheduled)[0]).toMatchObject({
                icsSequence: 1,
                extra: { previousStartAt: jakartaDateTime(day(3), '09:00') },
            });
        });

        it('ke tanggal blacklist → 400; waktu tidak valid → 400', async () => {
            const c = await approved();
            await prisma.blackoutDate.create({
                data: {
                    lecturerId: p.owner.id,
                    date: new Date(`${day(6)}T00:00:00.000Z`),
                },
            });
            expect(
                codeOf(
                    await act(
                        c.id,
                        'reschedule',
                        p.tokens.owner,
                        slot(day(6)),
                    ).expect(400),
                ),
            ).toBe('DATE_BLACKLISTED');
            expect(
                codeOf(
                    await act(
                        c.id,
                        'reschedule',
                        p.tokens.owner,
                        slot(day(7), '09:00', '14:00'),
                    ).expect(400),
                ),
            ).toBe('INVALID_TIME_RANGE');
        });

        it('geser sedikit di jam sendiri tidak dianggap bentrok dengan dirinya', async () => {
            const c = await approved();
            await act(
                c.id,
                'reschedule',
                p.tokens.owner,
                slot(day(3), '09:30', '10:30'),
            ).expect(200);
        });

        it('bentrok bimbingan lain → 409; requested → 409; mahasiswa → 403', async () => {
            const c = await approved();
            await approved({
                studentId: p.studentS2.id,
                startAt: jakartaDateTime(day(4), '09:00'),
                endAt: jakartaDateTime(day(4), '10:00'),
            });
            expect(
                codeOf(
                    await act(
                        c.id,
                        'reschedule',
                        p.tokens.owner,
                        slot(day(4)),
                    ).expect(409),
                ),
            ).toBe('CONSULTATION_OVERLAP');
            const req = idOf(await submit(team).expect(201));
            expect(
                codeOf(
                    await act(
                        req,
                        'reschedule',
                        p.tokens.owner,
                        slot(day(6)),
                    ).expect(409),
                ),
            ).toBe('INVALID_TRANSITION');
            await act(c.id, 'reschedule', p.tokens.s1, slot(day(6))).expect(
                403,
            );
        });
    });

    describe('POST /consultations/:id/cancel', () => {
        it('mahasiswa membatalkan pengajuannya → cancelled; event E7 cancelledBy student', async () => {
            const id = idOf(await submit().expect(201));
            const events = spyEvents();
            const res = await act(id, 'cancel', p.tokens.s1, {
                reason: 'Sudah tidak perlu',
            }).expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'cancelled',
                statusReason: 'Sudah tidak perlu',
            });
            const [event] = events(CONSULTATION_CANCELLED);
            expect(event).toBeInstanceOf(ConsultationCancelledEvent);
            expect(event).toMatchObject({
                cancelledBy: 'student',
                reason: 'Sudah tidak perlu',
            });
        });

        it('dosen membatalkan approved yang belum mulai; alasan opsional', async () => {
            const c = await approved();
            const res = await act(c.id, 'cancel', p.tokens.owner).expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'cancelled',
                statusReason: null,
            });
        });

        it('approved yang sudah mulai → 409 CONSULTATION_STARTED', async () => {
            const c = await approved({
                startAt: new Date(Date.now() - 60_000),
                endAt: new Date(Date.now() + 30 * 60_000),
            });
            const res = await act(c.id, 'cancel', p.tokens.owner).expect(409);
            expect(codeOf(res)).toBe('CONSULTATION_STARTED');
        });

        it('status final → 409 INVALID_TRANSITION', async () => {
            const id = idOf(await submit().expect(201));
            await act(id, 'cancel', p.tokens.s1).expect(200);
            const res = await act(id, 'cancel', p.tokens.s1).expect(409);
            expect(codeOf(res)).toBe('INVALID_TRANSITION');
        });
    });

    describe('POST /consultations/:id/complete (BR-09, logbook)', () => {
        it('approved yang sudah mulai → completed + ringkasan', async () => {
            const c = await approved({
                startAt: new Date(Date.now() - 2 * 3_600_000),
                endAt: new Date(Date.now() - 3_600_000),
            });
            const res = await act(c.id, 'complete', p.tokens.owner, {
                summary: 'Bab 3 disetujui',
            }).expect(200);
            expect(viewOf(res)).toMatchObject({
                status: 'completed',
                summary: 'Bab 3 disetujui',
            });
        });

        it('belum mulai → 409; requested → 409; ringkasan wajib → 400; mahasiswa → 403', async () => {
            const c = await approved();
            expect(
                codeOf(
                    await act(c.id, 'complete', p.tokens.owner, {
                        summary: 'x',
                    }).expect(409),
                ),
            ).toBe('CONSULTATION_NOT_STARTED');
            const req = idOf(await submit(team).expect(201));
            await act(req, 'complete', p.tokens.owner, { summary: 'x' }).expect(
                409,
            );
            await act(c.id, 'complete', p.tokens.owner, {}).expect(400);
            await act(c.id, 'complete', p.tokens.s1, { summary: 'x' }).expect(
                403,
            );
        });
    });

    describe('akses (BR-05)', () => {
        it('individual: anggota lain → 404; pemilik & pengaju → 200', async () => {
            const id = idOf(await submit(indiv, p.tokens.s1).expect(201));
            const url = `/api/v1/consultations/${id}`;
            await as(p.tokens.owner).get(url).expect(200);
            await as(p.tokens.s1).get(url).expect(200);
            await as(p.tokens.s2).get(url).expect(404);
            await act(id, 'cancel', p.tokens.s2).expect(404);
        });

        it('shared: anggota lain boleh melihat tapi tidak bertindak (403)', async () => {
            const id = await proposed(team, p.tokens.s1);
            await as(p.tokens.s2)
                .get(`/api/v1/consultations/${id}`)
                .expect(200);
            for (const action of ['accept', 'cancel']) {
                const res = await act(id, action, p.tokens.s2).expect(403);
                expect(codeOf(res)).toBe('NOT_CONSULTATION_OWNER');
            }
        });

        it('bukan anggota / dosen lain / tidak ada → 404; id salah → 400', async () => {
            const id = idOf(await submit().expect(201));
            await as(p.tokens.s3)
                .get(`/api/v1/consultations/${id}`)
                .expect(404);
            await as(p.tokens.other)
                .get(`/api/v1/consultations/${id}`)
                .expect(404);
            await as(p.tokens.owner)
                .get(`/api/v1/consultations/${MISSING_ID}`)
                .expect(404);
            await as(p.tokens.owner)
                .get('/api/v1/consultations/abc')
                .expect(400);
        });

        it('mahasiswa yang dikeluarkan tidak bisa mengakses (404)', async () => {
            const id = idOf(await submit(team, p.tokens.s2).expect(201));
            await prisma.projectMember.delete({
                where: {
                    projectId_studentId: {
                        projectId: team,
                        studentId: p.studentS2.id,
                    },
                },
            });
            await as(p.tokens.s2)
                .get(`/api/v1/consultations/${id}`)
                .expect(404);
        });

        it('project terhapus → 404', async () => {
            const id = idOf(await submit().expect(201));
            await prisma.project.update({
                where: { id: indiv },
                data: { deletedAt: new Date() },
            });
            await as(p.tokens.owner)
                .get(`/api/v1/consultations/${id}`)
                .expect(404);
        });
    });

    describe('BR-22: pembatalan otomatis', () => {
        it('anggota dikeluarkan → bimbingan aktifnya dibatalkan + E7 (shared: pertemuan tim ikut batal)', async () => {
            const pending = idOf(await submit(team, p.tokens.s2).expect(201));
            const future = await approved({
                projectId: team,
                studentId: p.studentS2.id,
            });
            const started = await approved({
                projectId: team,
                studentId: p.studentS2.id,
                startAt: new Date(Date.now() - 60_000),
                endAt: new Date(Date.now() + 30 * 60_000),
            });
            const others = idOf(await submit(team, p.tokens.s1).expect(201));
            const events = spyEvents();

            await as(p.tokens.owner)
                .delete(`/api/v1/projects/${team}/members/${p.studentS2.id}`)
                .expect(204);

            expect(await statusOf(pending)).toBe('cancelled');
            expect(await statusOf(future.id)).toBe('cancelled');
            expect(await statusOf(started.id)).toBe('approved');
            expect(await statusOf(others)).toBe('requested');
            const row = await prisma.consultation.findUniqueOrThrow({
                where: { id: pending },
            });
            expect(row.statusReason).toBe(
                'Mahasiswa tidak lagi menjadi anggota project',
            );
            expect(
                (events(CONSULTATION_CANCELLED) as ConsultationCancelledEvent[])
                    .map((e) => e.consultationId)
                    .sort(),
            ).toEqual([pending, future.id].sort());
        });

        it('project dihapus → semua bimbingan aktif dibatalkan + E7', async () => {
            const a = idOf(await submit(indiv, p.tokens.s1).expect(201));
            const b = await approved({ studentId: p.studentS2.id });
            const events = spyEvents();
            await as(p.tokens.owner)
                .delete(`/api/v1/projects/${indiv}`)
                .expect(204);
            for (const id of [a, b.id]) {
                const row = await prisma.consultation.findUniqueOrThrow({
                    where: { id },
                });
                expect(row).toMatchObject({
                    status: 'cancelled',
                    statusReason: 'Project telah dihapus oleh dosen',
                });
            }
            expect(events(CONSULTATION_CANCELLED)).toHaveLength(2);
            // waktu dosen terbebas: jam yang sama bisa dijadwalkan di project lain
            await as(p.tokens.owner)
                .post(`/api/v1/projects/${team}/consultations/schedule`)
                .send({
                    studentId: p.studentS1.id,
                    ...slot(),
                    topic: 'Pengganti',
                    agenda: 'x',
                    mode: 'offline',
                    location: 'Ruang 101',
                })
                .expect(201);
        });

        it('pengajuan expired tidak ikut dibatalkan (tanpa email)', async () => {
            const old = await createConsultation(prisma, {
                projectId: team,
                lecturerId: p.owner.id,
                studentId: p.studentS2.id,
                status: 'requested',
                requestedDate: day(-3),
            });
            const events = spyEvents();
            await as(p.tokens.owner)
                .delete(`/api/v1/projects/${team}/members/${p.studentS2.id}`)
                .expect(204);
            expect(await statusOf(old.id)).toBe('requested');
            expect(events(CONSULTATION_CANCELLED)).toHaveLength(0);
        });
    });

    describe('GET /projects/:projectId/consultations', () => {
        const list = (projectId: string, token: string, qs = '') =>
            as(token).get(
                `/api/v1/projects/${projectId}/consultations${qs ? `?${qs}` : ''}`,
            );
        const idsOf = (res: request.Response) =>
            dataOf<View[]>(res).map((c) => c.id);

        it('individual: mahasiswa hanya miliknya; dosen semua', async () => {
            const mine = idOf(await submit(indiv, p.tokens.s1).expect(201));
            const theirs = idOf(await submit(indiv, p.tokens.s2).expect(201));
            expect(idsOf(await list(indiv, p.tokens.s1).expect(200))).toEqual([
                mine,
            ]);
            expect(
                idsOf(await list(indiv, p.tokens.owner).expect(200)).sort(),
            ).toEqual([mine, theirs].sort());
        });

        it('shared: semua anggota melihat semua', async () => {
            await submit(team, p.tokens.s1).expect(201);
            await submit(team, p.tokens.s2).expect(201);
            expect(
                metaOf(await list(team, p.tokens.s1).expect(200)).total,
            ).toBe(2);
        });

        it('filter status (termasuk expired), studentId, q, from/to; sort date', async () => {
            const a = idOf(
                await submit(indiv, p.tokens.s1, {
                    topic: 'Diagram ERD',
                }).expect(201),
            );
            const b = await approved({ studentId: p.studentS2.id });
            const old = await createConsultation(prisma, {
                projectId: indiv,
                lecturerId: p.owner.id,
                studentId: p.studentS2.id,
                status: 'requested',
                requestedDate: day(-5),
            });
            const owner = p.tokens.owner;
            expect(
                idsOf(await list(indiv, owner, 'status=expired').expect(200)),
            ).toEqual([old.id]);
            expect(
                idsOf(await list(indiv, owner, 'status=requested').expect(200)),
            ).toEqual([a]);
            expect(
                idsOf(
                    await list(
                        indiv,
                        owner,
                        `studentId=${p.studentS2.id}&sort=date&order=asc`,
                    ).expect(200),
                ),
            ).toEqual([old.id, b.id]);
            expect(
                idsOf(await list(indiv, owner, 'q=erd').expect(200)),
            ).toEqual([a]);
            expect(
                idsOf(
                    await list(
                        indiv,
                        owner,
                        `from=${day(3)}&to=${day(3)}`,
                    ).expect(200),
                ).sort(),
            ).toEqual([a, b.id].sort());
        });

        it.each([
            ['status tak dikenal', 'status=draft'],
            ['sort tak dikenal', 'sort=topic'],
            ['studentId bukan UUID', 'studentId=x'],
        ])('%s → 400', async (_, qs) => {
            await list(indiv, p.tokens.owner, qs).expect(400);
        });

        it('bukan anggota → 404', async () => {
            await list(indiv, p.tokens.s3).expect(404);
        });
    });

    describe('GET /consultations (kalender saya)', () => {
        const mine = (token: string, qs = '') =>
            as(token).get(`/api/v1/consultations${qs ? `?${qs}` : ''}`);
        const idsOf = (res: request.Response) =>
            dataOf<View[]>(res).map((c) => c.id);

        it('mahasiswa: miliknya + pertemuan tim di project shared; bukan milik orang lain di individual', async () => {
            const own = idOf(await submit(indiv, p.tokens.s1).expect(201));
            const teamMeeting = idOf(
                await submit(team, p.tokens.s2).expect(201),
            );
            const otherIndividual = idOf(
                await submit(indiv, p.tokens.s2).expect(201),
            );
            const ids = idsOf(await mine(p.tokens.s1).expect(200));
            expect(ids.sort()).toEqual([own, teamMeeting].sort());
            expect(ids).not.toContain(otherIndividual);
        });

        it('project yang sudah ditinggalkan tidak tampil', async () => {
            await submit(team, p.tokens.s1).expect(201);
            await prisma.projectMember.delete({
                where: {
                    projectId_studentId: {
                        projectId: team,
                        studentId: p.studentS1.id,
                    },
                },
            });
            expect(metaOf(await mine(p.tokens.s1).expect(200)).total).toBe(0);
        });

        it('dosen: semua bimbingan project miliknya; urut tanggal terdekat', async () => {
            const later = idOf(
                await submit(indiv, p.tokens.s1, {
                    requestedDate: day(9),
                }).expect(201),
            );
            const sooner = await approved({ studentId: p.studentS2.id });
            const foreign = await createProject(prisma, p.otherLecturer.id);
            await addMember(prisma, foreign.id, p.studentS3.id);
            await createConsultation(prisma, {
                projectId: foreign.id,
                lecturerId: p.otherLecturer.id,
                studentId: p.studentS3.id,
                status: 'requested',
                requestedDate: day(1),
            });
            expect(idsOf(await mine(p.tokens.owner).expect(200))).toEqual([
                sooner.id,
                later,
            ]);
        });

        it('usulan yang memindah tanggal ikut menggeser urutan kalender (sort_at)', async () => {
            const moved = idOf(
                await submit(indiv, p.tokens.s1, {
                    requestedDate: day(9),
                }).expect(201),
            );
            const fixed = idOf(
                await submit(team, p.tokens.s1, {
                    requestedDate: day(5),
                }).expect(201),
            );
            expect(idsOf(await mine(p.tokens.s1).expect(200))).toEqual([
                fixed,
                moved,
            ]);
            await act(moved, 'propose', p.tokens.owner, {
                ...slot(day(2)),
                location: 'Ruang 101',
            }).expect(200);
            expect(idsOf(await mine(p.tokens.s1).expect(200))).toEqual([
                moved,
                fixed,
            ]);
            // filter from/to memakai tanggal efektif yang sama
            expect(
                idsOf(
                    await mine(
                        p.tokens.s1,
                        `from=${day(2)}&to=${day(2)}`,
                    ).expect(200),
                ),
            ).toEqual([moved]);
            expect(
                idsOf(await mine(p.tokens.s1, 'order=desc').expect(200)),
            ).toEqual([fixed, moved]);
        });

        it('filter projectId & status', async () => {
            await submit(indiv, p.tokens.s1).expect(201);
            const t = idOf(await submit(team, p.tokens.s1).expect(201));
            expect(
                idsOf(
                    await mine(
                        p.tokens.s1,
                        `projectId=${team}&status=requested`,
                    ).expect(200),
                ),
            ).toEqual([t]);
        });
    });

    describe('GET /projects/:projectId/logbook', () => {
        const completed = async (
            studentId: string,
            topic: string,
            summary: string,
            daysAgo: number,
        ) => {
            const c = await createConsultation(prisma, {
                projectId: team,
                lecturerId: p.owner.id,
                studentId,
                status: 'completed',
                startAt: jakartaDateTime(day(-daysAgo), '09:00'),
                endAt: jakartaDateTime(day(-daysAgo), '10:00'),
            });
            await prisma.consultation.update({
                where: { id: c.id },
                data: { topic, summary },
            });
            return c.id;
        };
        const logbook = (token: string, qs = '', projectId = team) =>
            as(token).get(
                `/api/v1/projects/${projectId}/logbook${qs ? `?${qs}` : ''}`,
            );
        const idsOf = (res: request.Response) =>
            dataOf<View[]>(res).map((c) => c.id);

        it('hanya completed, terbaru dulu; q mencari topik & ringkasan', async () => {
            const older = await completed(
                p.studentS1.id,
                'Bab 1',
                'Latar belakang ok',
                10,
            );
            const newer = await completed(
                p.studentS2.id,
                'Bab 2',
                'Revisi diagram ERD',
                2,
            );
            await approved({ projectId: team });
            expect(idsOf(await logbook(p.tokens.owner).expect(200))).toEqual([
                newer,
                older,
            ]);
            expect(
                idsOf(await logbook(p.tokens.owner, 'q=erd').expect(200)),
            ).toEqual([newer]);
            expect(
                idsOf(await logbook(p.tokens.owner, 'q=bab 1').expect(200)),
            ).toEqual([older]);
            expect(
                idsOf(
                    await logbook(
                        p.tokens.owner,
                        `studentId=${p.studentS1.id}`,
                    ).expect(200),
                ),
            ).toEqual([older]);
            expect(
                idsOf(
                    await logbook(
                        p.tokens.owner,
                        `from=${day(-3)}&to=${day(0)}`,
                    ).expect(200),
                ),
            ).toEqual([newer]);
        });

        it('individual: mahasiswa hanya logbook miliknya', async () => {
            const c = await createConsultation(prisma, {
                projectId: indiv,
                lecturerId: p.owner.id,
                studentId: p.studentS2.id,
                status: 'completed',
                startAt: jakartaDateTime(day(-1), '09:00'),
                endAt: jakartaDateTime(day(-1), '10:00'),
            });
            expect(
                idsOf(await logbook(p.tokens.s1, '', indiv).expect(200)),
            ).toEqual([]);
            expect(
                idsOf(await logbook(p.tokens.s2, '', indiv).expect(200)),
            ).toEqual([c.id]);
        });

        it('bukan anggota → 404', async () => {
            await logbook(p.tokens.s3).expect(404);
        });
    });

    describe('database (BR-07)', () => {
        it('exclusion constraint menolak dua approved yang beririsan', async () => {
            await approved();
            await expect(
                approved({
                    studentId: p.studentS2.id,
                    startAt: jakartaDateTime(day(3), '09:30'),
                    endAt: jakartaDateTime(day(3), '10:30'),
                }),
            ).rejects.toThrow(/consultations_no_overlap/);
        });
    });
});
