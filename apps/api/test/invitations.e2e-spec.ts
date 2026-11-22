import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    INVITATION_CREATED,
    InvitationCreatedEvent,
} from '../src/modules/project/invitation-created.event';
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
type InvitationView = {
    id: string;
    status: string;
    expiresAt: string;
    student: { id: string };
    project: { id: string; title: string };
};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const past = () => new Date(Date.now() - 1000);

describe('Invitations (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let p: People;
    let thesisId: string;
    let researchId: string;
    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({
        get: (url: string) => http().get(url).auth(token, { type: 'bearer' }),
        post: (url: string) => http().post(url).auth(token, { type: 'bearer' }),
        patch: (url: string) =>
            http().patch(url).auth(token, { type: 'bearer' }),
        delete: (url: string) =>
            http().delete(url).auth(token, { type: 'bearer' }),
    });
    const invite = (
        projectId: string,
        studentId: string,
        token = p.tokens.owner,
    ) =>
        as(token)
            .post(`/api/v1/projects/${projectId}/invitations`)
            .send({ studentId });
    const respond = (invitationId: string, action: string, token: string) =>
        as(token)
            .post(`/api/v1/invitations/${invitationId}/respond`)
            .send({ action });
    const statusesOf = (res: request.Response) =>
        dataOf<InvitationView[]>(res).map((i) => i.status);

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await resetState(app);
        p = await seedPeople(app);
        thesisId = (
            await createProject(prisma, p.owner.id, {
                title: 'Tesis S2',
                type: 's2_thesis',
            })
        ).id;
        researchId = (
            await createProject(prisma, p.owner.id, {
                title: 'Riset Bersama',
                type: 'research',
            })
        ).id;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /projects/:projectId/invitations', () => {
        it('201 → pending 7 hari + event InvitationCreated (email E1)', async () => {
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            const res = await invite(thesisId, p.studentS2.id).expect(201);
            const data = dataOf<InvitationView>(res);
            expect(data).toMatchObject({
                status: 'pending',
                respondedAt: null,
                student: {
                    id: p.studentS2.id,
                    studyProgram: expect.objectContaining({
                        degree: 'S2',
                    }) as object,
                },
                project: {
                    id: thesisId,
                    title: 'Tesis S2',
                    typeLabel: 'Tesis',
                },
            });
            const days =
                (new Date(data.expiresAt).getTime() - Date.now()) / 86_400_000;
            expect(days).toBeGreaterThan(6.99);
            expect(days).toBeLessThanOrEqual(7);

            expect(emit).toHaveBeenCalledWith(
                INVITATION_CREATED,
                expect.any(InvitationCreatedEvent),
            );
            const event = emit.mock.calls[0][1] as InvitationCreatedEvent;
            expect(event).toMatchObject({
                invitationId: data.id,
                project: { id: thesisId, title: 'Tesis S2' },
                lecturer: { id: p.owner.id, name: 'Dosen Pemilik' },
                student: {
                    id: p.studentS2.id,
                    email: '6025211002@example.com',
                },
            });
        });

        it('mahasiswa S1 ke project s2_thesis → 400 DEGREE_MISMATCH', async () => {
            const res = await invite(thesisId, p.studentS1.id).expect(400);
            expect(codeOf(res)).toBe('DEGREE_MISMATCH');
            expect(await prisma.projectInvitation.count()).toBe(0);
        });

        it('gagal (mis. DEGREE_MISMATCH) → event tidak dipancarkan', async () => {
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            await invite(thesisId, p.studentS3.id).expect(400);
            expect(emit).not.toHaveBeenCalledWith(
                INVITATION_CREATED,
                expect.anything(),
            );
        });

        it('response tidak membocorkan email/password mahasiswa', async () => {
            const res = await invite(researchId, p.studentS1.id).expect(201);
            const student = dataOf<{ student: object }>(res).student;
            expect(student).not.toHaveProperty('email');
            expect(student).not.toHaveProperty('password');
        });

        it('tipe umum terbuka untuk semua jenjang → 201', async () => {
            for (const s of [p.studentS1, p.studentS2, p.studentS3]) {
                await invite(researchId, s.id).expect(201);
            }
        });

        it('undangan pending ganda → 409 INVITATION_ALREADY_PENDING', async () => {
            await invite(researchId, p.studentS1.id).expect(201);
            const res = await invite(researchId, p.studentS1.id).expect(409);
            expect(codeOf(res)).toBe('INVITATION_ALREADY_PENDING');
        });

        it('sudah anggota → 409 ALREADY_MEMBER', async () => {
            await addMember(prisma, researchId, p.studentS1.id);
            const res = await invite(researchId, p.studentS1.id).expect(409);
            expect(codeOf(res)).toBe('ALREADY_MEMBER');
        });

        it('undangan lama yang expired tidak menghalangi; yang lama ditutup', async () => {
            const old = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
                { expiresAt: past() },
            );
            await invite(researchId, p.studentS1.id).expect(201);
            const closed = await prisma.projectInvitation.findUniqueOrThrow({
                where: { id: old.id },
            });
            expect(closed.status).toBe('revoked');
        });

        it('setelah di-revoke boleh diundang lagi', async () => {
            await createInvitation(prisma, researchId, p.studentS1.id, {
                status: 'revoked',
            });
            await invite(researchId, p.studentS1.id).expect(201);
        });

        it('setelah dikeluarkan dari project boleh diundang lagi', async () => {
            await addMember(prisma, researchId, p.studentS1.id);
            await as(p.tokens.owner)
                .delete(
                    `/api/v1/projects/${researchId}/members/${p.studentS1.id}`,
                )
                .expect(204);
            await invite(researchId, p.studentS1.id).expect(201);
        });

        it('pending di project lain tidak menghalangi', async () => {
            await createInvitation(prisma, thesisId, p.studentS2.id);
            await invite(researchId, p.studentS2.id).expect(201);
        });

        it('setelah ditolak boleh diundang lagi', async () => {
            await createInvitation(prisma, researchId, p.studentS1.id, {
                status: 'declined',
            });
            await invite(researchId, p.studentS1.id).expect(201);
        });

        it('mahasiswa tidak ada / id dosen / akun terhapus → 404 STUDENT_NOT_FOUND', async () => {
            await prisma.user.update({
                where: { id: p.studentS3.id },
                data: { deletedAt: new Date() },
            });
            for (const id of [MISSING_ID, p.otherLecturer.id, p.studentS3.id]) {
                const res = await invite(researchId, id).expect(404);
                expect(codeOf(res)).toBe('STUDENT_NOT_FOUND');
            }
        });

        it('dosen lain → 404, mahasiswa → 403, body tidak valid → 400', async () => {
            await invite(researchId, p.studentS1.id, p.tokens.other).expect(
                404,
            );
            await invite(researchId, p.studentS1.id, p.tokens.s2).expect(403);
            await invite(researchId, 'bukan-uuid').expect(400);
            await as(p.tokens.owner)
                .post(`/api/v1/projects/${researchId}/invitations`)
                .send({})
                .expect(400);
            await as(p.tokens.owner)
                .post(`/api/v1/projects/${researchId}/invitations`)
                .send({ studentId: p.studentS1.id, status: 'accepted' })
                .expect(400);
            await invite('abc', p.studentS1.id).expect(400);
        });

        it('project terhapus → 404', async () => {
            await prisma.project.update({
                where: { id: researchId },
                data: { deletedAt: new Date() },
            });
            await invite(researchId, p.studentS1.id).expect(404);
        });
    });

    describe('GET /projects/:projectId/invitations', () => {
        beforeEach(async () => {
            await createInvitation(prisma, researchId, p.studentS1.id);
            await createInvitation(prisma, researchId, p.studentS2.id, {
                expiresAt: past(),
            });
            await createInvitation(prisma, researchId, p.studentS3.id, {
                status: 'accepted',
            });
            await createInvitation(prisma, thesisId, p.studentS2.id);
        });
        const list = (qs = '', token = p.tokens.owner) =>
            as(token).get(
                `/api/v1/projects/${researchId}/invitations${qs ? `?${qs}` : ''}`,
            );

        it('pemilik melihat undangan project itu; pending lewat waktu → expired', async () => {
            const res = await list().expect(200);
            expect(statusesOf(res).sort()).toEqual([
                'accepted',
                'expired',
                'pending',
            ]);
            expect(metaOf(res).total).toBe(3);
        });

        it.each([
            ['pending', ['pending']],
            ['expired', ['expired']],
            ['accepted', ['accepted']],
            ['declined', []],
        ])('?status=%s', async (status, expected) => {
            const res = await list(`status=${status}`).expect(200);
            expect(statusesOf(res)).toEqual(expected);
        });

        it('urut terbaru dulu + pagination', async () => {
            await prisma.projectInvitation.updateMany({
                where: { projectId: researchId, studentId: p.studentS1.id },
                data: { createdAt: new Date('2025-01-01T00:00:00Z') },
            });
            const res = await list('limit=2').expect(200);
            expect(metaOf(res)).toMatchObject({
                total: 3,
                limit: 2,
                totalPages: 2,
            });
            const page2 = await list('limit=2&page=2').expect(200);
            expect(
                dataOf<InvitationView[]>(page2).map((i) => i.student.id),
            ).toEqual([p.studentS1.id]);
        });

        it('project terhapus → 404', async () => {
            await prisma.project.update({
                where: { id: researchId },
                data: { deletedAt: new Date() },
            });
            await list().expect(404);
        });

        it('status tidak dikenal → 400; dosen lain → 404; mahasiswa → 403', async () => {
            await list('status=unknown').expect(400);
            await list('', p.tokens.other).expect(404);
            await list('', p.tokens.s1).expect(403);
        });
    });

    describe('DELETE /projects/:projectId/invitations/:invitationId (revoke)', () => {
        const revoke = (invitationId: string, projectId = researchId) =>
            as(p.tokens.owner).delete(
                `/api/v1/projects/${projectId}/invitations/${invitationId}`,
            );

        it('pending → 200 revoked; revoke ulang → 409', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            const res = await revoke(inv.id).expect(200);
            expect(dataOf(res)).toMatchObject({
                id: inv.id,
                status: 'revoked',
            });
            const again = await revoke(inv.id).expect(409);
            expect(codeOf(again)).toBe('INVITATION_NOT_PENDING');
        });

        it('undangan expired → 409 INVITATION_EXPIRED', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
                { expiresAt: past() },
            );
            const res = await revoke(inv.id).expect(409);
            expect(codeOf(res)).toBe('INVITATION_EXPIRED');
        });

        it.each(['accepted', 'declined'] as const)(
            'undangan %s → 409 INVITATION_NOT_PENDING',
            async (status) => {
                const inv = await createInvitation(
                    prisma,
                    researchId,
                    p.studentS1.id,
                    { status },
                );
                const res = await revoke(inv.id).expect(409);
                expect(codeOf(res)).toBe('INVITATION_NOT_PENDING');
            },
        );

        it('revoke tidak mengisi respondedAt; mahasiswa tidak bisa menjawab lagi', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            const res = await revoke(inv.id).expect(200);
            expect(dataOf(res)).toMatchObject({ respondedAt: null });
            const answer = await respond(inv.id, 'accept', p.tokens.s1).expect(
                409,
            );
            expect(codeOf(answer)).toBe('INVITATION_NOT_PENDING');
        });

        it('invitationId bukan UUID → 400', async () => {
            await revoke('abc').expect(400);
        });

        it('undangan project lain / tidak ada → 404', async () => {
            const inv = await createInvitation(
                prisma,
                thesisId,
                p.studentS2.id,
            );
            const res = await revoke(inv.id, researchId).expect(404);
            expect(codeOf(res)).toBe('INVITATION_NOT_FOUND');
            await revoke(MISSING_ID).expect(404);
        });

        it('dosen lain → 404, mahasiswa → 403', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            const url = `/api/v1/projects/${researchId}/invitations/${inv.id}`;
            await as(p.tokens.other).delete(url).expect(404);
            await as(p.tokens.s1).delete(url).expect(403);
        });
    });

    describe('GET /invitations/me', () => {
        it('mahasiswa melihat undangannya sendiri (project terhapus disembunyikan)', async () => {
            await createInvitation(prisma, researchId, p.studentS2.id);
            await createInvitation(prisma, thesisId, p.studentS2.id, {
                expiresAt: past(),
            });
            await createInvitation(prisma, researchId, p.studentS1.id);
            const gone = await createProject(prisma, p.owner.id, {
                deletedAt: new Date(),
            });
            await createInvitation(prisma, gone.id, p.studentS2.id);

            const res = await as(p.tokens.s2)
                .get('/api/v1/invitations/me')
                .expect(200);
            const data = dataOf<InvitationView[]>(res);
            expect(data).toHaveLength(2);
            expect(data.every((i) => i.student.id === p.studentS2.id)).toBe(
                true,
            );
            expect(data.map((i) => i.project.title).sort()).toEqual([
                'Riset Bersama',
                'Tesis S2',
            ]);

            const pending = await as(p.tokens.s2)
                .get('/api/v1/invitations/me?status=pending')
                .expect(200);
            expect(statusesOf(pending)).toEqual(['pending']);
        });

        it('dosen → 403', async () => {
            await as(p.tokens.owner).get('/api/v1/invitations/me').expect(403);
            await http().get('/api/v1/invitations/me').expect(401);
        });

        it('?status=expired hanya pending yang lewat waktu', async () => {
            await createInvitation(prisma, researchId, p.studentS2.id);
            await createInvitation(prisma, thesisId, p.studentS2.id, {
                expiresAt: past(),
            });
            const res = await as(p.tokens.s2)
                .get('/api/v1/invitations/me?status=expired')
                .expect(200);
            expect(
                dataOf<InvitationView[]>(res).map((i) => i.project.id),
            ).toEqual([thesisId]);
        });
    });

    describe('POST /invitations/:invitationId/respond', () => {
        it('accept → 200, jadi anggota & bisa melihat project', async () => {
            const inv = await createInvitation(
                prisma,
                thesisId,
                p.studentS2.id,
            );
            const res = await respond(inv.id, 'accept', p.tokens.s2).expect(
                200,
            );
            expect(dataOf(res)).toMatchObject({
                status: 'accepted',
                respondedAt: expect.any(String) as string,
            });
            await as(p.tokens.s2)
                .get(`/api/v1/projects/${thesisId}`)
                .expect(200);
            expect(
                await prisma.projectMember.count({
                    where: { projectId: thesisId, studentId: p.studentS2.id },
                }),
            ).toBe(1);
        });

        it('decline → 200, tidak jadi anggota', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            await respond(inv.id, 'decline', p.tokens.s1).expect(200);
            const row = await prisma.projectInvitation.findUniqueOrThrow({
                where: { id: inv.id },
            });
            expect(row).toMatchObject({ status: 'declined' });
            expect(row.respondedAt).not.toBeNull();
            await as(p.tokens.s1)
                .get(`/api/v1/projects/${researchId}`)
                .expect(404);
        });

        it('dua accept bersamaan → satu 200, satu 409, anggota hanya satu', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            const results = await Promise.all([
                respond(inv.id, 'accept', p.tokens.s1),
                respond(inv.id, 'accept', p.tokens.s1),
            ]);
            expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
            expect(
                await prisma.projectMember.count({
                    where: { projectId: researchId },
                }),
            ).toBe(1);
        });

        it('accept saat sudah jadi anggota → 200 tanpa baris ganda', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            await addMember(prisma, researchId, p.studentS1.id);
            await respond(inv.id, 'accept', p.tokens.s1).expect(200);
            expect(
                await prisma.projectMember.count({
                    where: { projectId: researchId },
                }),
            ).toBe(1);
        });

        it('accept mengunci perubahan tipe project', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            await respond(inv.id, 'accept', p.tokens.s1).expect(200);
            await as(p.tokens.owner)
                .patch(`/api/v1/projects/${researchId}`)
                .send({ type: 'competition' })
                .expect(409);
        });

        it('respons ulang → 409 INVITATION_NOT_PENDING', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            await respond(inv.id, 'accept', p.tokens.s1).expect(200);
            const res = await respond(inv.id, 'decline', p.tokens.s1).expect(
                409,
            );
            expect(codeOf(res)).toBe('INVITATION_NOT_PENDING');
        });

        it('undangan expired → 409 INVITATION_EXPIRED, tidak jadi anggota', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
                { expiresAt: past() },
            );
            const res = await respond(inv.id, 'accept', p.tokens.s1).expect(
                409,
            );
            expect(codeOf(res)).toBe('INVITATION_EXPIRED');
            expect(await prisma.projectMember.count()).toBe(0);
        });

        it('undangan revoked → 409', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
                { status: 'revoked' },
            );
            await respond(MISSING_ID, 'accept', p.tokens.s1).expect(404);
            await respond('abc', 'accept', p.tokens.s1).expect(400);
            await respond(inv.id, 'accept', p.tokens.s1).expect(409);
        });

        it('undangan milik mahasiswa lain → 404; dosen → 403', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            const res = await respond(inv.id, 'accept', p.tokens.s2).expect(
                404,
            );
            expect(codeOf(res)).toBe('INVITATION_NOT_FOUND');
            await respond(inv.id, 'accept', p.tokens.owner).expect(403);
        });

        it('project sudah dihapus → 404', async () => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            await prisma.project.update({
                where: { id: researchId },
                data: { deletedAt: new Date() },
            });
            await respond(inv.id, 'accept', p.tokens.s1).expect(404);
        });

        it.each([
            ['action tidak dikenal', 'maybe'],
            ['action kosong', ''],
        ])('%s → 400', async (_, action) => {
            const inv = await createInvitation(
                prisma,
                researchId,
                p.studentS1.id,
            );
            await respond(inv.id, action, p.tokens.s1).expect(400);
        });
    });
});
