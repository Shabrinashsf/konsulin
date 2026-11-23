import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import type {
    ConsultationStatus,
    RevisionItemStatus,
} from '../src/generated/prisma/client';
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
    createInvitation,
    createProject,
    createStudent,
    dataOf,
    metaOf,
    resetState,
    seedPeople,
    upsertProgram,
} from './utils/fixtures';

type People = Awaited<ReturnType<typeof seedPeople>>;
type Row = {
    id: string;
    name: string;
    nrp: string;
    email: string;
    cohortYear: number;
    studyProgram: { id: string; name: string; degree: string };
    projects: { id: string; title: string; type: string }[];
    lastConsultationAt: string | null;
    completedConsultations: number;
    openRevisions: number;
    overdueFolders: number;
    nearestDeadline: {
        folderId: string;
        title: string;
        projectId: string;
        deadlineAt: string;
    } | null;
};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

describe('Monitoring (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let p: People;
    let thesisId: string; // s1_thesis (individual)
    let teamId: string; // research (shared)

    const http = () => request(app.getHttpServer());
    const monitor = (query = '', token = p.tokens.owner) =>
        http()
            .get(`/api/v1/monitoring/students${query}`)
            .auth(token, { type: 'bearer' });
    const rows = async (query = '') => dataOf<Row[]>(await monitor(query));
    const rowOf = async (studentId: string, query = '') =>
        (await rows(query)).find((r) => r.id === studentId);
    const namesOf = async (query: string) =>
        (await rows(query)).map((r) => r.name);

    const consultation = (
        projectId: string,
        studentId: string,
        startAt: Date,
        status: ConsultationStatus = 'completed',
    ) =>
        createConsultation(prisma, {
            projectId,
            lecturerId: p.owner.id,
            studentId,
            startAt,
            endAt: new Date(startAt.getTime() + 3_600_000),
            status,
        });
    const folder = (
        projectId: string,
        studentId: string | null,
        data: Partial<{
            deadlineAt: Date;
            deletedAt: Date;
            title: string;
        }> = {},
    ) =>
        prisma.submissionFolder.create({
            data: {
                projectId,
                studentId,
                createdBy: p.owner.id,
                title: 'Folder',
                ...data,
            },
        });
    // a version with feedback carrying items in these statuses
    const revisions = async (
        folderId: string,
        statuses: RevisionItemStatus[],
    ) => {
        const n = await prisma.submissionVersion.count({ where: { folderId } });
        const version = await prisma.submissionVersion.create({
            data: {
                folderId,
                versionNumber: n + 1,
                uploadedBy: p.studentS1.id,
                originalName: 'v.pdf',
                storageDriver: 'local',
                storedKey: `k/${folderId}/${n + 1}.pdf`,
                mimeType: 'application/pdf',
                sizeBytes: 1,
            },
        });
        await prisma.feedback.create({
            data: {
                versionId: version.id,
                content: 'Revisi',
                revisionItems: {
                    create: statuses.map((status, position) => ({
                        position,
                        description: `Item ${position}`,
                        status,
                    })),
                },
            },
        });
        return version;
    };
    const joinedAt = (projectId: string, studentId: string, at: Date) =>
        prisma.projectMember.update({
            where: { projectId_studentId: { projectId, studentId } },
            data: { joinedAt: at },
        });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await resetState(app);
        p = await seedPeople(app);
        thesisId = (
            await createProject(prisma, p.owner.id, {
                type: 's1_thesis',
                title: 'B Tugas Akhir',
            })
        ).id;
        teamId = (
            await createProject(prisma, p.owner.id, { title: 'A Riset Tim' })
        ).id;
        await addMember(prisma, thesisId, p.studentS1.id);
        await addMember(prisma, teamId, p.studentS1.id);
        await addMember(prisma, teamId, p.studentS2.id);
        // everyone joined long ago unless a test says otherwise
        for (const [projectId, studentId] of [
            [thesisId, p.studentS1.id],
            [teamId, p.studentS1.id],
            [teamId, p.studentS2.id],
        ]) {
            await joinedAt(projectId, studentId, days(-365));
        }
    });

    afterAll(async () => {
        await resetState(app);
        await app.close();
    });

    // ---------------------------------------------------------------
    describe('who is listed (BR-26)', () => {
        it('one row per current member, with profile and projects', async () => {
            const res = await monitor();
            expect(res.status).toBe(200);
            const list = dataOf<Row[]>(res);
            expect(list.map((r) => r.name)).toEqual(['Andi S1', 'Budi S2']);
            expect(list[0]).toEqual({
                id: p.studentS1.id,
                name: 'Andi S1',
                nrp: '5025211001',
                email: '5025211001@example.com',
                cohortYear: 2021,
                studyProgram: {
                    id: p.studentS1.studyProgramId,
                    name: 'S1 Teknik Informatika',
                    degree: 'S1',
                },
                projects: [
                    { id: teamId, title: 'A Riset Tim', type: 'research' },
                    { id: thesisId, title: 'B Tugas Akhir', type: 's1_thesis' },
                ],
                lastConsultationAt: null,
                completedConsultations: 0,
                openRevisions: 0,
                overdueFolders: 0,
                nearestDeadline: null,
            });
            expect(metaOf(res)).toEqual({
                page: 1,
                limit: 10,
                total: 2,
                totalPages: 1,
            });
        });

        it('leaves out removed members, deleted accounts and projects, invitations and other lecturers', async () => {
            const program = await upsertProgram(
                prisma,
                'S1 Teknik Informatika',
            );
            const make = (name: string, nrp: string) =>
                createStudent(prisma, {
                    name,
                    nrp,
                    email: `${nrp}@example.com`,
                    studyProgramId: program.id,
                    cohortYear: 2022,
                });
            const removed = await make('Removed', '5025221001');
            const deletedAccount = await make('Deleted', '5025221002');
            const inDeletedProject = await make('Gone', '5025221003');
            const invited = await make('Invited', '5025221004');

            await addMember(prisma, teamId, removed.id);
            await prisma.projectMember.delete({
                where: {
                    projectId_studentId: {
                        projectId: teamId,
                        studentId: removed.id,
                    },
                },
            });
            await addMember(prisma, teamId, deletedAccount.id);
            await prisma.user.update({
                where: { id: deletedAccount.id },
                data: { deletedAt: new Date() },
            });
            const deletedProject = await createProject(prisma, p.owner.id, {
                deletedAt: new Date(),
            });
            await addMember(prisma, deletedProject.id, inDeletedProject.id);
            await createInvitation(prisma, teamId, invited.id);
            const foreign = await createProject(prisma, p.otherLecturer.id);
            await addMember(prisma, foreign.id, p.studentS3.id);

            expect(await namesOf('')).toEqual(['Andi S1', 'Budi S2']);
        });

        it('students cannot use it (403); a token is required (401)', async () => {
            const res = await monitor('', p.tokens.s1);
            expect(res.status).toBe(403);
            expect(
                (await http().get('/api/v1/monitoring/students')).status,
            ).toBe(401);
        });

        it('a lecturer without projects sees nobody', async () => {
            const res = await monitor('', p.tokens.other);
            expect(dataOf(res)).toEqual([]);
            expect(metaOf(res).total).toBe(0);
        });
    });

    // ---------------------------------------------------------------
    describe('consultation metrics (C, D, L)', () => {
        it('counts completed consultations of the requester only on individual projects', async () => {
            await addMember(prisma, thesisId, p.studentS2.id);
            const last = await consultation(
                thesisId,
                p.studentS1.id,
                days(-10),
            );
            await consultation(thesisId, p.studentS1.id, days(-20));
            // not completed: never counted
            await consultation(thesisId, p.studentS1.id, days(-2), 'approved');
            await consultation(thesisId, p.studentS1.id, days(-3), 'cancelled');

            expect(await rowOf(p.studentS1.id)).toMatchObject({
                completedConsultations: 2,
                lastConsultationAt: last.startAt!.toISOString(),
            });
            expect(await rowOf(p.studentS2.id)).toMatchObject({
                completedConsultations: 0,
                lastConsultationAt: null,
            });
        });

        it('shared: team meetings count for members who had joined', async () => {
            await joinedAt(teamId, p.studentS2.id, days(-7));
            await consultation(teamId, p.studentS1.id, days(-10));
            const after = await consultation(teamId, p.studentS1.id, days(-5));

            expect(await rowOf(p.studentS1.id)).toMatchObject({
                completedConsultations: 2,
                lastConsultationAt: after.startAt!.toISOString(),
            });
            expect(await rowOf(p.studentS2.id)).toMatchObject({
                completedConsultations: 1,
                lastConsultationAt: after.startAt!.toISOString(),
            });

            // the requester always counts, even before joining again
            await joinedAt(teamId, p.studentS1.id, days(-1));
            expect(await rowOf(p.studentS1.id)).toMatchObject({
                completedConsultations: 2,
            });
        });
    });

    // ---------------------------------------------------------------
    describe('revision and deadline metrics (E, F, G)', () => {
        it('open revisions: own track + shared folders, open and reopened only', async () => {
            const own = await folder(thesisId, p.studentS1.id);
            await revisions(own.id, [
                'open',
                'reopened',
                'addressed',
                'verified',
            ]);
            const team = await folder(teamId, null);
            await revisions(team.id, ['open']);
            const gone = await folder(teamId, null, { deletedAt: new Date() });
            await revisions(gone.id, ['open', 'open']);
            await addMember(prisma, thesisId, p.studentS2.id);
            const other = await folder(thesisId, p.studentS2.id);
            await revisions(other.id, ['open']);

            expect(await rowOf(p.studentS1.id)).toMatchObject({
                openRevisions: 3,
            });
            expect(await rowOf(p.studentS2.id)).toMatchObject({
                openRevisions: 2,
            });
        });

        it('nearest upcoming unsubmitted deadline and overdue folders', async () => {
            const soonSubmitted = await folder(thesisId, p.studentS1.id, {
                deadlineAt: days(1),
            });
            await revisions(soonSubmitted.id, []);
            const next = await folder(thesisId, p.studentS1.id, {
                title: 'Bab 2',
                deadlineAt: days(2),
            });
            const team = await folder(teamId, null, {
                title: 'Laporan Tim',
                deadlineAt: days(3),
            });
            await folder(thesisId, p.studentS1.id, { deadlineAt: days(-1) });
            await folder(teamId, null, { deadlineAt: days(-2) });
            await folder(teamId, null, {
                deadlineAt: days(-3),
                deletedAt: new Date(),
            });
            const lateButSubmitted = await folder(thesisId, p.studentS1.id, {
                deadlineAt: days(-4),
            });
            await revisions(lateButSubmitted.id, []);

            const s1 = await rowOf(p.studentS1.id);
            expect(s1).toMatchObject({
                overdueFolders: 2,
                nearestDeadline: {
                    folderId: next.id,
                    title: 'Bab 2',
                    projectId: thesisId,
                    deadlineAt: next.deadlineAt!.toISOString(),
                },
            });
            expect(await rowOf(p.studentS2.id)).toMatchObject({
                overdueFolders: 1,
                nearestDeadline: { folderId: team.id, projectId: teamId },
            });
        });
    });

    // ---------------------------------------------------------------
    describe('project scope (A, B)', () => {
        it('aggregates across projects: latest meeting, revisions of every version', async () => {
            await consultation(thesisId, p.studentS1.id, days(-10));
            const latest = await consultation(teamId, p.studentS1.id, days(-5));
            const own = await folder(thesisId, p.studentS1.id);
            await revisions(own.id, ['open']);
            await revisions(own.id, ['open', 'reopened']); // v2 of the same folder

            expect(await rowOf(p.studentS1.id)).toMatchObject({
                completedConsultations: 2,
                lastConsultationAt: latest.startAt!.toISOString(),
                openRevisions: 3,
            });
        });

        it('only projects the student is still an active member of count', async () => {
            const kept = await consultation(
                thesisId,
                p.studentS1.id,
                days(-10),
            );

            // removed from the team project: its meetings, revisions and
            // deadlines no longer count, though the student stays listed
            await consultation(teamId, p.studentS1.id, days(-3));
            await folder(teamId, null, { deadlineAt: days(-1) });
            await revisions((await folder(teamId, null)).id, ['open']);
            await folder(teamId, null, { deadlineAt: days(1) });
            await prisma.projectMember.delete({
                where: {
                    projectId_studentId: {
                        projectId: teamId,
                        studentId: p.studentS1.id,
                    },
                },
            });

            // a deleted project of the lecturer
            const deleted = await createProject(prisma, p.owner.id);
            await addMember(prisma, deleted.id, p.studentS1.id);
            await consultation(deleted.id, p.studentS1.id, days(-2));
            await revisions((await folder(deleted.id, p.studentS1.id)).id, [
                'open',
            ]);
            await prisma.project.update({
                where: { id: deleted.id },
                data: { deletedAt: new Date() },
            });

            // another lecturer's project
            const foreign = await createProject(prisma, p.otherLecturer.id);
            await addMember(prisma, foreign.id, p.studentS1.id);
            await createConsultation(prisma, {
                projectId: foreign.id,
                lecturerId: p.otherLecturer.id,
                studentId: p.studentS1.id,
                startAt: days(-1),
                endAt: new Date(days(-1).getTime() + 3_600_000),
                status: 'completed',
            });

            expect(await rowOf(p.studentS1.id)).toMatchObject({
                projects: [{ id: thesisId }],
                completedConsultations: 1,
                lastConsultationAt: kept.startAt!.toISOString(),
                openRevisions: 0,
                overdueFolders: 0,
                nearestDeadline: null,
            });
            // the remaining team member still carries the team work
            expect(await rowOf(p.studentS2.id)).toMatchObject({
                completedConsultations: 1,
                openRevisions: 1,
                overdueFolders: 1,
            });
        });
    });

    // ---------------------------------------------------------------
    describe('filters', () => {
        it('projectId / projectType restrict the counted projects', async () => {
            await consultation(thesisId, p.studentS1.id, days(-10));
            await consultation(teamId, p.studentS1.id, days(-5));

            const thesis = await rowOf(
                p.studentS1.id,
                `?projectId=${thesisId}`,
            );
            expect(thesis).toMatchObject({
                completedConsultations: 1,
                projects: [{ id: thesisId }],
            });
            expect(await namesOf(`?projectId=${thesisId}`)).toEqual([
                'Andi S1',
            ]);
            expect(await namesOf('?projectType=research')).toEqual([
                'Andi S1',
                'Budi S2',
            ]);
            expect(
                (await rowOf(p.studentS1.id, '?projectType=research'))
                    ?.completedConsultations,
            ).toBe(1);
            expect(await namesOf('?projectType=s2_thesis')).toEqual([]);
        });

        it('projectId restricts revisions and deadlines too', async () => {
            await folder(thesisId, p.studentS1.id, { deadlineAt: days(-1) });
            await revisions((await folder(thesisId, p.studentS1.id)).id, [
                'open',
            ]);
            const team = await folder(teamId, null, { deadlineAt: days(2) });
            await revisions((await folder(teamId, null)).id, ['open', 'open']);

            expect(
                await rowOf(p.studentS1.id, `?projectId=${thesisId}`),
            ).toMatchObject({
                openRevisions: 1,
                overdueFolders: 1,
                nearestDeadline: null,
            });
            expect(
                await rowOf(p.studentS1.id, `?projectId=${teamId}`),
            ).toMatchObject({
                openRevisions: 2,
                overdueFolders: 0,
                nearestDeadline: { folderId: team.id },
            });
        });

        it("another lecturer's or a deleted project is 404", async () => {
            const foreign = await createProject(prisma, p.otherLecturer.id);
            const deleted = await createProject(prisma, p.owner.id, {
                deletedAt: new Date(),
            });
            for (const id of [foreign.id, deleted.id, MISSING_ID]) {
                const res = await monitor(`?projectId=${id}`);
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('PROJECT_NOT_FOUND');
            }
        });

        it('searches name or NRP, wildcards taken literally', async () => {
            expect(await namesOf('?q=andi')).toEqual(['Andi S1']);
            expect(await namesOf('?q=6025')).toEqual(['Budi S2']);
            expect(await namesOf('?q=%25')).toEqual([]);
            expect(await namesOf('?q=_')).toEqual([]);
        });

        it('filters study program, degree and cohort', async () => {
            const s1Program = p.studentS1.studyProgramId!;
            expect(await namesOf(`?studyProgramId=${s1Program}`)).toEqual([
                'Andi S1',
            ]);
            expect(await namesOf('?degree=S2')).toEqual(['Budi S2']);
            expect(await namesOf('?degree=S3')).toEqual([]);
            await prisma.user.update({
                where: { id: p.studentS2.id },
                data: { cohortYear: 2023 },
            });
            expect(await namesOf('?cohortYear=2023')).toEqual(['Budi S2']);
        });

        it('hasOpenRevisions and overdue', async () => {
            const own = await folder(thesisId, p.studentS1.id);
            await revisions(own.id, ['open']);
            await folder(thesisId, p.studentS1.id, { deadlineAt: days(-1) });

            expect(await namesOf('?hasOpenRevisions=true')).toEqual([
                'Andi S1',
            ]);
            expect(await namesOf('?hasOpenRevisions=false')).toEqual([
                'Budi S2',
            ]);
            expect(await namesOf('?overdue=true')).toEqual(['Andi S1']);
            expect(await namesOf('?overdue=false')).toEqual(['Budi S2']);
        });

        it('noConsultationSince: last meeting before that WIB date, or never', async () => {
            const today = toJakartaDate(new Date());
            const since = addDays(today, -10);
            // exactly 00:00 WIB of `since` is not "before" it
            await consultation(
                thesisId,
                p.studentS1.id,
                jakartaDateTime(since, '00:00'),
            );
            expect(await namesOf(`?noConsultationSince=${since}`)).toEqual([
                'Budi S2',
            ]);
            await prisma.consultation.updateMany({
                data: {
                    startAt: new Date(
                        jakartaDateTime(since, '00:00').getTime() - 60_000,
                    ),
                },
            });
            expect(await namesOf(`?noConsultationSince=${since}`)).toEqual([
                'Andi S1',
                'Budi S2',
            ]);
        });

        it('combined filters apply together', async () => {
            await revisions((await folder(thesisId, p.studentS1.id)).id, [
                'open',
            ]);
            await revisions((await folder(teamId, null)).id, ['open']);
            // both have open revisions; only Budi is S2
            expect(await namesOf('?hasOpenRevisions=true')).toEqual([
                'Andi S1',
                'Budi S2',
            ]);
            expect(await namesOf('?hasOpenRevisions=true&degree=S2')).toEqual([
                'Budi S2',
            ]);
            expect(
                await namesOf(`?hasOpenRevisions=true&projectId=${thesisId}`),
            ).toEqual(['Andi S1']);
            expect(await namesOf('?q=andi&degree=S2')).toEqual([]);
        });

        it('rejects bad filters (400)', async () => {
            for (const q of [
                '?projectId=abc',
                '?projectType=thesis',
                '?studyProgramId=1',
                '?degree=S4',
                '?cohortYear=abc',
                '?hasOpenRevisions=yes',
                '?overdue=1',
                '?noConsultationSince=2026-13-01',
                '?sort=email',
                '?order=up',
            ]) {
                expect((await monitor(q)).status).toBe(400);
            }
        });
    });

    // ---------------------------------------------------------------
    describe('sort and pagination', () => {
        beforeEach(async () => {
            const program = await upsertProgram(
                prisma,
                'S1 Teknik Informatika',
            );
            const carla = await createStudent(prisma, {
                name: 'Carla',
                nrp: '5025200003',
                email: 'carla@example.com',
                studyProgramId: program.id,
                cohortYear: 2020,
            });
            await addMember(prisma, thesisId, carla.id);
            await joinedAt(thesisId, carla.id, days(-365));
            // Andi: 3 meetings (last -5), 1 open revision, deadline +2
            await consultation(teamId, p.studentS1.id, days(-20));
            await consultation(thesisId, p.studentS1.id, days(-15));
            await consultation(thesisId, p.studentS1.id, days(-5));
            await folder(thesisId, p.studentS1.id, { deadlineAt: days(2) });
            await folder(thesisId, p.studentS1.id, { deadlineAt: days(5) });
            await revisions((await folder(thesisId, p.studentS1.id)).id, [
                'open',
            ]);
            // Carla: 2 meetings (last -30), 3 open revisions, deadline +1
            await consultation(thesisId, carla.id, days(-30));
            await consultation(thesisId, carla.id, days(-40));
            const own = await folder(thesisId, carla.id);
            await revisions(own.id, ['open', 'open', 'reopened']);
            await folder(thesisId, carla.id, { deadlineAt: days(1) });
            // Budi: Andi's team meeting at -20 only, no revisions, no deadline
        });

        it('defaults to name A→Z', async () => {
            expect(await namesOf('')).toEqual(['Andi S1', 'Budi S2', 'Carla']);
            expect(await namesOf('?order=desc')).toEqual([
                'Carla',
                'Budi S2',
                'Andi S1',
            ]);
            expect(await namesOf('?sort=nrp')).toEqual([
                'Carla',
                'Andi S1',
                'Budi S2',
            ]);
        });

        it('sorts by each metric, empty values last', async () => {
            expect(
                await namesOf('?sort=lastConsultationAt&order=desc'),
            ).toEqual(['Andi S1', 'Budi S2', 'Carla']);
            expect(
                await namesOf('?sort=completedConsultations&order=desc'),
            ).toEqual(['Andi S1', 'Carla', 'Budi S2']);
            expect(await namesOf('?sort=openRevisions&order=desc')).toEqual([
                'Carla',
                'Andi S1',
                'Budi S2',
            ]);
            expect(await namesOf('?sort=nearestDeadline')).toEqual([
                'Carla',
                'Andi S1',
                'Budi S2',
            ]);
            expect(await namesOf('?sort=nearestDeadline&order=desc')).toEqual([
                'Andi S1',
                'Carla',
                'Budi S2',
            ]);
        });

        it('paginates with the full total, also past the last page', async () => {
            const page = await monitor('?limit=2&page=2');
            expect(dataOf<Row[]>(page).map((r) => r.name)).toEqual(['Carla']);
            expect(metaOf(page)).toEqual({
                page: 2,
                limit: 2,
                total: 3,
                totalPages: 2,
            });
            const beyond = await monitor('?limit=2&page=5');
            expect(dataOf(beyond)).toEqual([]);
            expect(metaOf(beyond).total).toBe(3);
        });
    });
});
