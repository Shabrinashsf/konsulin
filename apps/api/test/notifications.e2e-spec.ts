import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import {
    MailService,
    type Mail,
} from '../src/modules/notification/mail.service';
import { NotificationListener } from '../src/modules/notification/notification.listener';
import { NotificationRepository } from '../src/modules/notification/notification.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import {
    addDays,
    jakartaDateTime,
    toJakartaDate,
} from '../src/shared/time/time';
import { createTestApp } from './utils/create-test-app';
import {
    addMember,
    createConsultation,
    createProject,
    dataOf,
    resetState,
    seedPeople,
} from './utils/fixtures';

type People = Awaited<ReturnType<typeof seedPeople>>;

const WEB = 'http://localhost:5173';
const PDF = Buffer.from('%PDF-1.7\n%%EOF\n');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Notifications (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let p: People;
    let individualId: string; // s1_thesis: s1
    let sharedId: string; // research: s1 + s2
    let sent: Mail[];
    let spy: jest.SpyInstance;

    const tomorrow = () => addDays(toJakartaDate(new Date()), 1);
    const at = (time: string, date = tomorrow()) =>
        jakartaDateTime(date, time).toISOString();

    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({
        post: (url: string) => http().post(url).auth(token, { type: 'bearer' }),
        delete: (url: string) =>
            http().delete(url).auth(token, { type: 'bearer' }),
    });
    const email = (s: { email: string }) => s.email;

    // runs `action`, waits for `count` mails (then a little longer, so
    // extra mails would show up) and returns what was sent
    const mailsOf = async (action: () => Promise<unknown>, count: number) => {
        await sleep(100); // mails of earlier steps
        sent.length = 0;
        await action();
        for (let i = 0; i < 60 && sent.length < count; i++) await sleep(50);
        await sleep(150);
        return [...sent].sort((a, b) => a.to.localeCompare(b.to));
    };
    const recipients = (mails: Mail[]) => mails.map((m) => m.to).sort();

    // consultations driven through the API, so the real events fire
    const ask = (projectId: string, token = p.tokens.s1) =>
        as(token).post(`/api/v1/projects/${projectId}/consultations`).send({
            requestedDate: tomorrow(),
            topic: 'Bab <1> & metodologi',
            agenda: 'Diskusi',
            mode: 'offline',
            note: 'Catatan\nmahasiswa',
        });
    const propose = (id: string, token = p.tokens.owner, body: object = {}) =>
        as(token)
            .post(`/api/v1/consultations/${id}/propose`)
            .send({
                startAt: at('10:00'),
                endAt: at('11:00'),
                ...(token === p.tokens.owner ? { location: 'Ruang 101' } : {}),
                ...body,
            });
    const approved = async (projectId: string) => {
        const id = dataOf<{ id: string }>(await ask(projectId)).id;
        await propose(id);
        await as(p.tokens.s1)
            .post(`/api/v1/consultations/${id}/accept`)
            .send({});
        return id;
    };

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await sleep(100);
        await resetState(app);
        sent = [];
        spy = jest
            .spyOn(app.get(MailService), 'send')
            .mockImplementation((m: Mail) => {
                sent.push(m);
                return Promise.resolve();
            });
        p = await seedPeople(app);
        individualId = (
            await createProject(prisma, p.owner.id, {
                type: 's1_thesis',
                title: 'Skripsi Andi',
            })
        ).id;
        sharedId = (
            await createProject(prisma, p.owner.id, { title: 'Riset Tim' })
        ).id;
        await addMember(prisma, individualId, p.studentS1.id);
        await addMember(prisma, sharedId, p.studentS1.id);
        await addMember(prisma, sharedId, p.studentS2.id);
    });

    afterEach(() => spy.mockRestore());

    afterAll(async () => {
        await sleep(200);
        await resetState(app);
        await app.close();
    });

    // ---------------------------------------------------------------
    it('E1: the invited student', async () => {
        const project = await createProject(prisma, p.owner.id);
        const [mail, ...rest] = await mailsOf(
            () =>
                as(p.tokens.owner)
                    .post(`/api/v1/projects/${project.id}/invitations`)
                    .send({ studentId: p.studentS3.id }),
            1,
        );
        expect(rest).toEqual([]);
        expect(mail.to).toBe(email(p.studentS3));
        expect(mail.subject).toBe(
            '[Konsulin] Undangan bergabung ke project Project Uji',
        );
        expect(mail.html).toContain(`${WEB}/invitations`);
        expect(mail.html).toContain('Halo Citra S3');
    });

    describe('consultations', () => {
        it('E2: the lecturer only, user text escaped', async () => {
            const mails = await mailsOf(() => ask(sharedId), 1);
            expect(recipients(mails)).toEqual([email(p.owner)]);
            const [mail] = mails;
            expect(mail.subject).toBe(
                '[Konsulin] Pengajuan bimbingan baru: Bab <1> & metodologi',
            );
            expect(mail.html).toContain('Bab &lt;1&gt; &amp; metodologi');
            expect(mail.html).not.toContain('<1>');
            expect(mail.html).toContain('Catatan<br>mahasiswa');
            expect(mail.icalEvent).toBeUndefined();
        });

        it('E11: everyone but the proposer', async () => {
            const individual = dataOf<{ id: string }>(
                await ask(individualId),
            ).id;
            const byLecturer = await mailsOf(() => propose(individual), 1);
            expect(recipients(byLecturer)).toEqual([email(p.studentS1)]);
            expect(byLecturer[0].html).toContain(
                `${WEB}/consultations/${individual}`,
            );
            expect(byLecturer[0].icalEvent).toBeUndefined();

            const shared = dataOf<{ id: string }>(await ask(sharedId)).id;
            const toTeam = await mailsOf(() => propose(shared), 2);
            expect(recipients(toTeam)).toEqual(
                [email(p.studentS1), email(p.studentS2)].sort(),
            );
            const byStudent = await mailsOf(
                () =>
                    propose(shared, p.tokens.s1, {
                        startAt: at('13:00'),
                        endAt: at('14:00'),
                    }),
                2,
            );
            expect(recipients(byStudent)).toEqual(
                [email(p.owner), email(p.studentS2)].sort(),
            );
        });

        it('E3: everyone, each with their own REQUEST invite', async () => {
            const id = dataOf<{ id: string }>(await ask(sharedId)).id;
            await propose(id);
            const mails = await mailsOf(
                () =>
                    as(p.tokens.s1)
                        .post(`/api/v1/consultations/${id}/accept`)
                        .send({}),
                3,
            );
            expect(recipients(mails)).toEqual(
                [email(p.owner), email(p.studentS1), email(p.studentS2)].sort(),
            );
            for (const mail of mails) {
                const ics = mail.icalEvent!;
                expect(ics.method).toBe('REQUEST');
                expect(ics.content).toContain(`UID:${id}@konsulin`);
                expect(ics.content).toContain('SEQUENCE:0');
                expect(ics.content).toContain('LOCATION:Ruang 101');
                expect(ics.content).toContain(
                    `ORGANIZER;CN="Dosen Pemilik":mailto:${email(p.owner)}`,
                );
                // only the recipient is listed: members' addresses stay private
                expect(ics.content.match(/ATTENDEE/g)).toHaveLength(1);
                expect(ics.content).toContain(`mailto:${mail.to}`);
                expect(mail.html).toContain('calendar.google.com');
                expect(mail.html).toContain('10.00–11.00 WIB');
            }
        });

        it('E4: everyone but the lecturer, with the reason', async () => {
            const id = dataOf<{ id: string }>(await ask(sharedId)).id;
            const mails = await mailsOf(
                () =>
                    as(p.tokens.owner)
                        .post(`/api/v1/consultations/${id}/reject`)
                        .send({ reason: 'Belum ada draft' }),
                2,
            );
            expect(recipients(mails)).toEqual(
                [email(p.studentS1), email(p.studentS2)].sort(),
            );
            expect(mails[0].html).toContain('Belum ada draft');
            expect(mails[0].icalEvent).toBeUndefined();
        });

        it('E5 and E6: invite, then the same UID with sequence + 1', async () => {
            const scheduled = await mailsOf(
                () =>
                    as(p.tokens.owner)
                        .post(
                            `/api/v1/projects/${individualId}/consultations/schedule`,
                        )
                        .send({
                            studentId: p.studentS1.id,
                            startAt: at('09:00'),
                            endAt: at('10:00'),
                            topic: 'Revisi',
                            agenda: 'Bab 2',
                            mode: 'online',
                            location: 'https://meet.example.com/x',
                        }),
                2,
            );
            expect(recipients(scheduled)).toEqual(
                [email(p.owner), email(p.studentS1)].sort(),
            );
            expect(scheduled[0].icalEvent?.content).toContain('SEQUENCE:0');

            const id = (await prisma.consultation.findFirstOrThrow()).id;
            const moved = await mailsOf(
                () =>
                    as(p.tokens.owner)
                        .post(`/api/v1/consultations/${id}/reschedule`)
                        .send({ startAt: at('13:00'), endAt: at('14:00') }),
                2,
            );
            for (const mail of moved) {
                expect(mail.subject).toBe(
                    '[Konsulin] Jadwal bimbingan diubah: Revisi',
                );
                expect(mail.icalEvent?.content).toContain(`UID:${id}@konsulin`);
                expect(mail.icalEvent?.content).toContain('SEQUENCE:1');
                expect(mail.html).toContain('09.00–10.00 WIB'); // old
                expect(mail.html).toContain('13.00–14.00 WIB'); // new
            }
        });

        it('E7: CANCEL invite only for a consultation that was approved', async () => {
            const id = await approved(individualId);
            const cancelled = await mailsOf(
                () =>
                    as(p.tokens.s1)
                        .post(`/api/v1/consultations/${id}/cancel`)
                        .send({ reason: 'Sakit' }),
                2,
            );
            expect(recipients(cancelled)).toEqual(
                [email(p.owner), email(p.studentS1)].sort(),
            );
            for (const mail of cancelled) {
                expect(mail.icalEvent?.method).toBe('CANCEL');
                expect(mail.icalEvent?.content).toContain('SEQUENCE:1');
                expect(mail.icalEvent?.content).toContain('STATUS:CANCELLED');
                expect(mail.html).toContain('dibatalkan oleh Andi S1');
                expect(mail.html).toContain('Sakit');
            }

            // has a proposed time, but never reached anyone's calendar
            const pending = dataOf<{ id: string }>(await ask(individualId)).id;
            await propose(pending);
            const noInvite = await mailsOf(
                () =>
                    as(p.tokens.s1)
                        .post(`/api/v1/consultations/${pending}/cancel`)
                        .send({}),
                2,
            );
            expect(noInvite.map((m) => m.icalEvent)).toEqual([
                undefined,
                undefined,
            ]);
        });

        it('E7: a removed requester still hears about the team meeting', async () => {
            const id = await approved(sharedId);
            const mails = await mailsOf(
                () =>
                    as(p.tokens.owner).delete(
                        `/api/v1/projects/${sharedId}/members/${p.studentS1.id}`,
                    ),
                3,
            );
            expect(recipients(mails)).toEqual(
                [email(p.owner), email(p.studentS1), email(p.studentS2)].sort(),
            );
            expect(mails[0].html).toContain(
                'Mahasiswa tidak lagi menjadi anggota project',
            );
            expect(mails[0].icalEvent?.content).toContain(`UID:${id}@konsulin`);
        });

        it('E7: a confirmed blackout cancels with the generic reason', async () => {
            await approved(individualId);
            const mails = await mailsOf(
                () =>
                    as(p.tokens.owner).post('/api/v1/me/blackout-dates').send({
                        from: tomorrow(),
                        to: tomorrow(),
                        cancelConsultations: true,
                    }),
                2,
            );
            expect(recipients(mails)).toEqual(
                [email(p.owner), email(p.studentS1)].sort(),
            );
            expect(mails[0].html).toContain(
                'Dosen berhalangan pada tanggal tersebut',
            );
            expect(mails[0].icalEvent?.method).toBe('CANCEL');
        });

        it('deleted accounts get no mail', async () => {
            await prisma.user.update({
                where: { id: p.studentS2.id },
                data: { deletedAt: new Date() },
            });
            const id = dataOf<{ id: string }>(await ask(sharedId)).id;
            const mails = await mailsOf(() => propose(id), 1);
            expect(recipients(mails)).toEqual([email(p.studentS1)]);
        });
    });

    // ---------------------------------------------------------------
    describe('E8 reminder', () => {
        const remind = () => app.get(NotificationListener).remind(new Date());

        it('reminds everyone of tomorrow, once', async () => {
            const id = await approved(sharedId);
            const mails = await mailsOf(remind, 3);
            expect(recipients(mails)).toEqual(
                [email(p.owner), email(p.studentS1), email(p.studentS2)].sort(),
            );
            expect(mails[0].subject).toBe(
                '[Konsulin] Pengingat: bimbingan besok: Bab <1> & metodologi',
            );
            expect(mails[0].html).toContain(`${WEB}/consultations/${id}`);
            expect(await mailsOf(remind, 0)).toEqual([]);

            // a reschedule resets the reminder
            await as(p.tokens.owner)
                .post(`/api/v1/consultations/${id}/reschedule`)
                .send({ startAt: at('15:00'), endAt: at('16:00') });
            expect(await mailsOf(remind, 3)).toHaveLength(3);
        });

        it('skips other days, other statuses and deleted projects', async () => {
            const make = (
                projectId: string,
                start: string,
                status: 'approved' | 'requested' = 'approved',
            ) =>
                createConsultation(prisma, {
                    projectId,
                    lecturerId: p.owner.id,
                    studentId: p.studentS1.id,
                    startAt: new Date(start),
                    endAt: new Date(new Date(start).getTime() + 3_600_000),
                    status,
                });
            await make(individualId, at('10:00', addDays(tomorrow(), 1)));
            await make(individualId, at('10:00'), 'requested');
            const deleted = await createProject(prisma, p.owner.id, {
                deletedAt: new Date(),
            });
            await make(deleted.id, at('12:00'));
            expect(await mailsOf(remind, 0)).toEqual([]);
        });
    });

    // ---------------------------------------------------------------
    it('E9: the lecturer only', async () => {
        const folder = await prisma.submissionFolder.create({
            data: {
                projectId: sharedId,
                createdBy: p.studentS1.id,
                title: 'Laporan',
            },
        });
        const mails = await mailsOf(
            () =>
                as(p.tokens.s2)
                    .post(`/api/v1/folders/${folder.id}/versions`)
                    .field('note', 'Draft pertama')
                    .attach('file', PDF, 'laporan.pdf'),
            1,
        );
        expect(recipients(mails)).toEqual([email(p.owner)]);
        expect(mails[0].subject).toBe('[Konsulin] Versi baru: Laporan v1');
        expect(mails[0].html).toContain('Budi S2 mengunggah versi 1');
        expect(mails[0].html).toContain(`${WEB}/folders/${folder.id}`);
    });

    describe('E10 feedback', () => {
        const feedbackOn = async (
            projectId: string,
            studentId: string | null,
        ) => {
            const folder = await prisma.submissionFolder.create({
                data: {
                    projectId,
                    studentId,
                    createdBy: p.owner.id,
                    title: 'Bab 1',
                },
            });
            const version = await prisma.submissionVersion.create({
                data: {
                    folderId: folder.id,
                    versionNumber: 1,
                    uploadedBy: p.studentS1.id,
                    originalName: 'v1.pdf',
                    storageDriver: 'local',
                    storedKey: `k/${folder.id}.pdf`,
                    mimeType: 'application/pdf',
                    sizeBytes: 1,
                },
            });
            return () =>
                as(p.tokens.owner)
                    .post(`/api/v1/versions/${version.id}/feedbacks`)
                    .send({
                        content: 'Perbaiki latar belakang',
                        revisionItems: [{ description: 'Tambah <data>' }],
                    });
        };

        it('individual: the track owner', async () => {
            // another member with their own track must not be mailed
            await addMember(prisma, individualId, p.studentS2.id);
            const mails = await mailsOf(
                await feedbackOn(individualId, p.studentS1.id),
                1,
            );
            expect(recipients(mails)).toEqual([email(p.studentS1)]);
            expect(mails[0].html).toContain('<li>Tambah &lt;data&gt;</li>');
            // the folder page, opened on the version the feedback is about
            expect(mails[0].html).toMatch(
                new RegExp(
                    `${WEB}/folders/[0-9a-f-]{36}\\?versi=[0-9a-f-]{36}`,
                ),
            );
        });

        it('shared: every active member', async () => {
            const mails = await mailsOf(await feedbackOn(sharedId, null), 2);
            expect(recipients(mails)).toEqual(
                [email(p.studentS1), email(p.studentS2)].sort(),
            );
        });

        it('a removed track owner is not mailed', async () => {
            const give = await feedbackOn(individualId, p.studentS1.id);
            await prisma.projectMember.delete({
                where: {
                    projectId_studentId: {
                        projectId: individualId,
                        studentId: p.studentS1.id,
                    },
                },
            });
            expect(await mailsOf(give, 0)).toEqual([]);
        });
    });

    // ---------------------------------------------------------------
    it('a notification failure never fails the request', async () => {
        const broken = jest
            .spyOn(app.get(NotificationRepository), 'participants')
            .mockRejectedValue(new Error('db down'));
        const id = dataOf<{ id: string }>(await ask(individualId)).id;
        const res = await propose(id);
        expect(res.status).toBe(200);
        await sleep(200);
        broken.mockRestore();
    });
});
