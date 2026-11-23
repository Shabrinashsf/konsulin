import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { RevisionItemStatus } from '../src/generated/prisma/client';
import {
    SUBMISSION_UPLOADED,
    SubmissionUploadedEvent,
} from '../src/modules/submission/submission-events';
import { FolderService } from '../src/modules/submission/folder.service';
import { SubmissionRepository } from '../src/modules/submission/submission.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/create-test-app';
import {
    addMember,
    codeOf,
    createProject,
    dataOf,
    metaOf,
    resetState,
    seedPeople,
} from './utils/fixtures';

type People = Awaited<ReturnType<typeof seedPeople>>;
type Folder = {
    id: string;
    projectId: string;
    studentId: string | null;
    createdBy: string;
    title: string;
    description: string | null;
    deadlineAt: string | null;
    deadlineStatus: string;
    versionCount: number;
    student: { id: string; name: string } | null;
    creator: { id: string; role: string };
    latestVersion?: Version | null;
};
type Version = {
    id: string;
    folderId: string;
    versionNumber: number;
    note: string | null;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    late: boolean;
    feedbackCount: number;
    openRevisions: number;
    uploader: { id: string; name: string };
};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const UPLOADS = process.env.UPLOAD_DIR!;
const TMP = process.env.UPLOAD_TMP_DIR!;

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const ZIP = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('....a.txt....PK\x01\x02a.txt'),
]);
const DOCX = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('....PK\x01\x02word/document.xml'),
]);
const DOCX_MIME =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const hours = (n: number) => new Date(Date.now() + n * 3_600_000);
const tmpFiles = () => (existsSync(TMP) ? readdirSync(TMP) : []);
const storedFiles = () =>
    existsSync(join(UPLOADS, 'projects'))
        ? readdirSync(join(UPLOADS, 'projects'), { recursive: true }).filter(
              (f) => String(f).endsWith('.pdf'),
          )
        : [];

describe('Submissions (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let p: People;
    let individualId: string; // s1_thesis: s1 + s2 are members
    let sharedId: string; // research: s1 + s2 are members

    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({
        get: (url: string) => http().get(url).auth(token, { type: 'bearer' }),
        post: (url: string) => http().post(url).auth(token, { type: 'bearer' }),
        patch: (url: string) =>
            http().patch(url).auth(token, { type: 'bearer' }),
        delete: (url: string) =>
            http().delete(url).auth(token, { type: 'bearer' }),
    });

    const createFolder = (
        projectId: string,
        body: object,
        token = p.tokens.s1,
    ) => as(token).post(`/api/v1/projects/${projectId}/folders`).send(body);
    const listFolders = (
        projectId: string,
        query = '',
        token = p.tokens.owner,
    ) => as(token).get(`/api/v1/projects/${projectId}/folders${query}`);
    const upload = (
        folderId: string,
        file: Buffer | null = PDF,
        name = 'draft.pdf',
        token = p.tokens.s1,
        note?: string,
    ) => {
        const req = as(token).post(`/api/v1/folders/${folderId}/versions`);
        if (note !== undefined) void req.field('note', note);
        return file ? req.attach('file', file, name) : req.field('x', '');
    };
    const download = (versionId: string, token = p.tokens.owner) =>
        as(token)
            .get(`/api/v1/versions/${versionId}/download`)
            .buffer(true)
            .parse((res, cb) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                    const body = Buffer.concat(chunks);
                    // errors stay JSON
                    const json = String(res.headers['content-type']).includes(
                        'json',
                    );
                    cb(null, json ? JSON.parse(body.toString()) : body);
                });
            });

    // folder straight in the DB, for states the API refuses to create
    const folderRow = (
        data: Partial<{
            projectId: string;
            studentId: string | null;
            createdBy: string;
            title: string;
            deadlineAt: Date | null;
            createdAt: Date;
            deletedAt: Date;
        }> = {},
    ) =>
        prisma.submissionFolder.create({
            data: {
                projectId: individualId,
                studentId: p.studentS1.id,
                createdBy: p.studentS1.id,
                title: 'Bab 1',
                ...data,
            },
        });
    const versionRow = (
        folderId: string,
        versionNumber: number,
        data: Partial<{ createdAt: Date; storageDriver: 'local' | 'r2' }> = {},
    ) =>
        prisma.submissionVersion.create({
            data: {
                folderId,
                versionNumber,
                uploadedBy: p.studentS1.id,
                originalName: `v${versionNumber}.pdf`,
                storageDriver: 'local',
                storedKey: `missing/${versionNumber}.pdf`,
                mimeType: 'application/pdf',
                sizeBytes: 10,
                ...data,
            },
        });
    const feedbackWith = (versionId: string, statuses: RevisionItemStatus[]) =>
        prisma.feedback.create({
            data: {
                versionId,
                content: 'Perbaiki bab 1',
                revisionItems: {
                    create: statuses.map((status, position) => ({
                        position,
                        description: `Item ${position}`,
                        status,
                    })),
                },
            },
        });

    const removeMember = (projectId: string, studentId: string) =>
        prisma.projectMember.delete({
            where: { projectId_studentId: { projectId, studentId } },
        });

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await resetState(app);
        // stored files only; multer created UPLOAD_TMP_DIR once at startup
        rmSync(join(UPLOADS, 'projects'), { recursive: true, force: true });
        p = await seedPeople(app);
        individualId = (
            await createProject(prisma, p.owner.id, { type: 's1_thesis' })
        ).id;
        sharedId = (await createProject(prisma, p.owner.id)).id;
        for (const projectId of [individualId, sharedId]) {
            await addMember(prisma, projectId, p.studentS1.id);
            await addMember(prisma, projectId, p.studentS2.id);
        }
    });

    afterAll(async () => {
        await resetState(app);
        rmSync(UPLOADS, { recursive: true, force: true });
        await app.close();
    });

    // ---------------------------------------------------------------
    describe('POST /projects/:projectId/folders', () => {
        it('a student creates a folder for their own track (individual)', async () => {
            const res = await createFolder(individualId, {
                title: '  Bab 1  ',
                description: 'Pendahuluan',
            });
            expect(res.status).toBe(201);
            expect(dataOf<Folder>(res)).toMatchObject({
                projectId: individualId,
                studentId: p.studentS1.id,
                createdBy: p.studentS1.id,
                title: 'Bab 1',
                description: 'Pendahuluan',
                deadlineAt: null,
                deadlineStatus: 'none',
                versionCount: 0,
                student: { id: p.studentS1.id, name: 'Andi S1' },
                creator: { id: p.studentS1.id, role: 'student' },
            });
        });

        it('a student cannot choose the track owner or the deadline (403)', async () => {
            for (const body of [
                { studentId: p.studentS2.id },
                { deadlineAt: hours(48).toISOString() },
                { deadlineAt: null },
            ]) {
                const res = await createFolder(individualId, {
                    title: 'Bab 1',
                    ...body,
                });
                expect(res.status).toBe(403);
                expect(codeOf(res)).toBe('LECTURER_ONLY');
            }
        });

        it('the lecturer must name a current member on individual projects', async () => {
            const missing = await createFolder(
                individualId,
                { title: 'Bab 1' },
                p.tokens.owner,
            );
            expect(missing.status).toBe(400);
            expect(codeOf(missing)).toBe('STUDENT_REQUIRED');

            const outsider = await createFolder(
                individualId,
                { title: 'Bab 1', studentId: p.studentS3.id },
                p.tokens.owner,
            );
            expect(outsider.status).toBe(400);
            expect(codeOf(outsider)).toBe('STUDENT_NOT_MEMBER');

            const deadline = hours(48);
            const ok = await createFolder(
                individualId,
                {
                    title: 'Bab 1',
                    studentId: p.studentS2.id,
                    deadlineAt: deadline.toISOString(),
                },
                p.tokens.owner,
            );
            expect(ok.status).toBe(201);
            expect(dataOf<Folder>(ok)).toMatchObject({
                studentId: p.studentS2.id,
                createdBy: p.owner.id,
                deadlineAt: deadline.toISOString(),
                deadlineStatus: 'upcoming',
            });
        });

        it('shared folders have no track owner', async () => {
            const res = await createFolder(sharedId, { title: 'Laporan' });
            expect(res.status).toBe(201);
            expect(dataOf<Folder>(res)).toMatchObject({
                studentId: null,
                student: null,
                createdBy: p.studentS1.id,
            });

            const withStudent = await createFolder(
                sharedId,
                { title: 'Laporan', studentId: p.studentS1.id },
                p.tokens.owner,
            );
            expect(withStudent.status).toBe(400);
            expect(codeOf(withStudent)).toBe('STUDENT_NOT_ALLOWED');
        });

        it('the lecturer creates a shared folder with a deadline', async () => {
            const deadline = hours(72);
            const res = await createFolder(
                sharedId,
                {
                    title: 'Laporan Akhir',
                    description: '',
                    deadlineAt: deadline.toISOString(),
                },
                p.tokens.owner,
            );
            expect(res.status).toBe(201);
            expect(dataOf<Folder>(res)).toMatchObject({
                studentId: null,
                createdBy: p.owner.id,
                creator: { id: p.owner.id, role: 'lecturer' },
                description: null,
                deadlineAt: deadline.toISOString(),
                deadlineStatus: 'upcoming',
            });
        });

        it('a member whose account was deleted cannot own a track', async () => {
            await prisma.user.update({
                where: { id: p.studentS2.id },
                data: { deletedAt: new Date() },
            });
            const res = await createFolder(
                individualId,
                { title: 'Bab 1', studentId: p.studentS2.id },
                p.tokens.owner,
            );
            expect(res.status).toBe(400);
            expect(codeOf(res)).toBe('STUDENT_NOT_MEMBER');
        });

        it('the deadline must be in the future and carry an offset', async () => {
            const past = await createFolder(
                sharedId,
                { title: 'Laporan', deadlineAt: hours(-1).toISOString() },
                p.tokens.owner,
            );
            expect(past.status).toBe(400);
            expect(codeOf(past)).toBe('DEADLINE_IN_PAST');

            const noOffset = await createFolder(
                sharedId,
                { title: 'Laporan', deadlineAt: '2099-01-01T10:00:00' },
                p.tokens.owner,
            );
            expect(noOffset.status).toBe(400);
        });

        it('validates the body', async () => {
            for (const body of [
                {},
                { title: '   ' },
                { title: 'x'.repeat(201) },
                { title: 'Bab 1', description: 'x'.repeat(2001) },
                { title: 'Bab 1', extra: true },
            ]) {
                expect((await createFolder(sharedId, body)).status).toBe(400);
            }
        });

        it('hides projects the user cannot see (404)', async () => {
            const deleted = await createProject(prisma, p.owner.id, {
                deletedAt: new Date(),
            });
            await addMember(prisma, deleted.id, p.studentS1.id);
            for (const [projectId, token] of [
                [sharedId, p.tokens.s3],
                [sharedId, p.tokens.other],
                [deleted.id, p.tokens.s1],
                [MISSING_ID, p.tokens.owner],
            ]) {
                const res = await createFolder(
                    projectId,
                    { title: 'X' },
                    token,
                );
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('PROJECT_NOT_FOUND');
            }
        });

        it('requires a token (401) and a uuid (400)', async () => {
            expect(
                (
                    await http()
                        .post(`/api/v1/projects/${sharedId}/folders`)
                        .send({ title: 'X' })
                ).status,
            ).toBe(401);
            expect((await createFolder('abc', { title: 'X' })).status).toBe(
                400,
            );
        });
    });

    // ---------------------------------------------------------------
    describe('GET /projects/:projectId/folders', () => {
        it('individual: a student only sees their own track (BR-05)', async () => {
            const own = await folderRow({ title: 'Punya S1' });
            await folderRow({
                title: 'Punya S2',
                studentId: p.studentS2.id,
                createdBy: p.studentS2.id,
            });

            const s1 = await listFolders(individualId, '', p.tokens.s1);
            expect(dataOf<Folder[]>(s1).map((f) => f.id)).toEqual([own.id]);
            expect(metaOf(s1).total).toBe(1);

            const other = await listFolders(
                individualId,
                `?studentId=${p.studentS2.id}`,
                p.tokens.s1,
            );
            expect(dataOf<Folder[]>(other)).toEqual([]);

            const lecturer = await listFolders(individualId);
            expect(metaOf(lecturer).total).toBe(2);
            const filtered = await listFolders(
                individualId,
                `?studentId=${p.studentS2.id}`,
            );
            expect(dataOf<Folder[]>(filtered).map((f) => f.title)).toEqual([
                'Punya S2',
            ]);
        });

        it('shared: every member sees every folder of that project only', async () => {
            const shared = await folderRow({
                projectId: sharedId,
                studentId: null,
            });
            await versionRow(shared.id, 1);
            await folderRow({
                projectId: sharedId,
                studentId: null,
                createdBy: p.owner.id,
            });
            await folderRow(); // individual project
            const res = await listFolders(sharedId, '', p.tokens.s2);
            expect(metaOf(res).total).toBe(2);
            expect(
                dataOf<Folder[]>(res).find((f) => f.id === shared.id),
            ).toMatchObject({ versionCount: 1, projectId: sharedId });

            // shared folders have no track owner to filter on
            const byStudent = await listFolders(
                sharedId,
                `?studentId=${p.studentS1.id}`,
            );
            expect(metaOf(byStudent).total).toBe(0);
        });

        it('derives deadlineStatus and filters hasDeadline / overdue (BR-24)', async () => {
            const none = await folderRow({ title: 'none' });
            const upcoming = await folderRow({
                title: 'upcoming',
                deadlineAt: hours(24),
            });
            const overdue = await folderRow({
                title: 'overdue',
                deadlineAt: hours(-24),
            });
            const submitted = await folderRow({
                title: 'submitted',
                deadlineAt: hours(-24),
            });
            await versionRow(submitted.id, 1, { createdAt: hours(-48) });
            await versionRow(submitted.id, 2, { createdAt: hours(-1) });
            const late = await folderRow({
                title: 'late',
                deadlineAt: hours(-24),
            });
            await versionRow(late.id, 1, { createdAt: hours(-1) });

            const all = await listFolders(individualId, '?limit=100');
            const status = Object.fromEntries(
                dataOf<Folder[]>(all).map((f) => [f.title, f.deadlineStatus]),
            );
            expect(status).toEqual({
                none: 'none',
                upcoming: 'upcoming',
                overdue: 'overdue',
                submitted: 'submitted',
                late: 'late',
            });

            const ids = async (query: string) =>
                dataOf<Folder[]>(await listFolders(individualId, query))
                    .map((f) => f.id)
                    .sort();
            expect(await ids('?overdue=true')).toEqual([overdue.id]);
            expect(await ids('?overdue=false')).toEqual(
                [none.id, upcoming.id, submitted.id, late.id].sort(),
            );
            expect(await ids('?hasDeadline=false')).toEqual([none.id]);
            expect(await ids('?hasDeadline=true')).toHaveLength(4);
        });

        it('searches the title, sorts and paginates', async () => {
            await folderRow({
                title: 'Bab 1 Pendahuluan',
                createdAt: hours(-3),
                deadlineAt: hours(48),
            });
            await folderRow({ title: 'Bab 2 Tinjauan', createdAt: hours(-2) });
            await folderRow({
                title: 'Lampiran 100%',
                createdAt: hours(-1),
                deadlineAt: hours(24),
            });

            const search = await listFolders(individualId, '?q=bab');
            expect(metaOf(search).total).toBe(2);
            const literal = await listFolders(individualId, '?q=100%25');
            expect(dataOf<Folder[]>(literal).map((f) => f.title)).toEqual([
                'Lampiran 100%',
            ]);

            const newest = await listFolders(individualId);
            expect(dataOf<Folder[]>(newest).map((f) => f.title)).toEqual([
                'Lampiran 100%',
                'Bab 2 Tinjauan',
                'Bab 1 Pendahuluan',
            ]);
            // deadline ascending, folders without a deadline last
            const byDeadline = await listFolders(
                individualId,
                '?sort=deadline&order=asc',
            );
            expect(dataOf<Folder[]>(byDeadline).map((f) => f.title)).toEqual([
                'Lampiran 100%',
                'Bab 1 Pendahuluan',
                'Bab 2 Tinjauan',
            ]);

            const page = await listFolders(individualId, '?limit=2&page=2');
            expect(dataOf<Folder[]>(page)).toHaveLength(1);
            expect(metaOf(page)).toEqual({
                page: 2,
                limit: 2,
                total: 3,
                totalPages: 2,
            });
        });

        it('leaves out deleted folders and rejects bad queries', async () => {
            await folderRow({ deletedAt: new Date() });
            expect(metaOf(await listFolders(individualId)).total).toBe(0);
            for (const q of [
                '?overdue=yes',
                '?hasDeadline=1',
                '?sort=title',
                '?studentId=abc',
            ]) {
                expect((await listFolders(individualId, q)).status).toBe(400);
            }
        });

        it('a removed student folder stays in the lecturer list (BR-23)', async () => {
            const folder = await folderRow();
            await removeMember(individualId, p.studentS1.id);
            const res = await listFolders(individualId);
            expect(dataOf<Folder[]>(res).map((f) => f.id)).toEqual([folder.id]);
            expect(
                (await listFolders(individualId, '', p.tokens.s1)).status,
            ).toBe(404);
        });

        it('404 for outsiders and deleted projects', async () => {
            const deleted = await createProject(prisma, p.owner.id, {
                deletedAt: new Date(),
            });
            expect((await listFolders(deleted.id)).status).toBe(404);
            expect(
                (await listFolders(individualId, '', p.tokens.s3)).status,
            ).toBe(404);
            expect(
                (await listFolders(individualId, '', p.tokens.other)).status,
            ).toBe(404);
        });
    });

    // ---------------------------------------------------------------
    describe('GET /folders/:folderId', () => {
        it('returns the folder with its latest version', async () => {
            const folder = await folderRow({ deadlineAt: hours(-1) });
            const empty = await as(p.tokens.s1).get(
                `/api/v1/folders/${folder.id}`,
            );
            expect(dataOf<Folder>(empty)).toMatchObject({
                latestVersion: null,
                deadlineStatus: 'overdue',
            });

            await versionRow(folder.id, 1, { createdAt: hours(-2) });
            const v2 = await versionRow(folder.id, 2);
            await feedbackWith(v2.id, ['open', 'verified']);
            const res = await as(p.tokens.owner).get(
                `/api/v1/folders/${folder.id}`,
            );
            expect(dataOf<Folder>(res)).toMatchObject({
                versionCount: 2,
                deadlineStatus: 'submitted',
                latestVersion: {
                    id: v2.id,
                    versionNumber: 2,
                    late: true,
                    feedbackCount: 1,
                    openRevisions: 1,
                },
            });
        });

        it('404 for another student track, deleted folders and outsiders', async () => {
            const folder = await folderRow();
            const deleted = await folderRow({ deletedAt: new Date() });
            for (const [id, token] of [
                [folder.id, p.tokens.s2],
                [folder.id, p.tokens.s3],
                [folder.id, p.tokens.other],
                [deleted.id, p.tokens.owner],
                [MISSING_ID, p.tokens.owner],
            ]) {
                const res = await as(token).get(`/api/v1/folders/${id}`);
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('FOLDER_NOT_FOUND');
            }
        });

        it('a removed student loses access, the lecturer keeps the history (BR-23)', async () => {
            const folder = await folderRow();
            await removeMember(individualId, p.studentS1.id);
            expect(
                (await as(p.tokens.s1).get(`/api/v1/folders/${folder.id}`))
                    .status,
            ).toBe(404);
            expect(
                (await as(p.tokens.owner).get(`/api/v1/folders/${folder.id}`))
                    .status,
            ).toBe(200);
        });

        it('folders of a deleted project are gone (BR-15)', async () => {
            const folder = await folderRow();
            await prisma.project.update({
                where: { id: individualId },
                data: { deletedAt: new Date() },
            });
            expect(
                (await as(p.tokens.owner).get(`/api/v1/folders/${folder.id}`))
                    .status,
            ).toBe(404);
        });
    });

    // ---------------------------------------------------------------
    describe('PATCH /folders/:folderId', () => {
        const patch = (id: string, body: object, token = p.tokens.s1) =>
            as(token).patch(`/api/v1/folders/${id}`).send(body);

        it('the creator edits the title and clears the description', async () => {
            const folder = dataOf<Folder>(
                await createFolder(individualId, {
                    title: 'Bab 1',
                    description: 'Lama',
                }),
            );
            const res = await patch(folder.id, {
                title: 'Bab 1 (revisi)',
                description: '',
            });
            expect(res.status).toBe(200);
            expect(dataOf<Folder>(res)).toMatchObject({
                title: 'Bab 1 (revisi)',
                description: null,
            });
            const unchanged = await patch(folder.id, {});
            expect(dataOf<Folder>(unchanged).title).toBe('Bab 1 (revisi)');
        });

        it('only the lecturer sets or clears the deadline (BR-12)', async () => {
            const folder = await folderRow();
            for (const deadlineAt of [hours(24).toISOString(), null]) {
                const res = await patch(folder.id, { deadlineAt });
                expect(res.status).toBe(403);
                expect(codeOf(res)).toBe('LECTURER_ONLY');
            }

            const set = await patch(
                folder.id,
                { deadlineAt: hours(24).toISOString() },
                p.tokens.owner,
            );
            expect(dataOf<Folder>(set).deadlineStatus).toBe('upcoming');
            const past = await patch(
                folder.id,
                { deadlineAt: hours(-1).toISOString() },
                p.tokens.owner,
            );
            expect(codeOf(past)).toBe('DEADLINE_IN_PAST');
            const cleared = await patch(
                folder.id,
                { deadlineAt: null },
                p.tokens.owner,
            );
            expect(dataOf<Folder>(cleared)).toMatchObject({
                deadlineAt: null,
                deadlineStatus: 'none',
            });
        });

        it('the lecturer edits any folder; students only their own (403)', async () => {
            const byStudent = await folderRow({
                projectId: sharedId,
                studentId: null,
            });
            expect(
                (await patch(byStudent.id, { title: 'X' }, p.tokens.owner))
                    .status,
            ).toBe(200);
            const other = await patch(
                byStudent.id,
                { title: 'X' },
                p.tokens.s2,
            );
            expect(other.status).toBe(403);
            expect(codeOf(other)).toBe('NOT_FOLDER_CREATOR');

            // the track owner did not create it
            const byLecturer = await folderRow({ createdBy: p.owner.id });
            expect((await patch(byLecturer.id, { title: 'X' })).status).toBe(
                403,
            );
        });

        it('the track owner cannot change and the title cannot be null', async () => {
            const folder = await folderRow();
            for (const body of [
                { studentId: p.studentS2.id },
                { title: null },
                { title: '' },
                { deadlineAt: 'besok' },
            ]) {
                expect(
                    (await patch(folder.id, body, p.tokens.owner)).status,
                ).toBe(400);
            }
        });

        it('extending the deadline relabels a late folder (BR-24)', async () => {
            const folder = await folderRow({ deadlineAt: hours(-2) });
            await versionRow(folder.id, 1, { createdAt: hours(-1) });
            const before = await as(p.tokens.owner).get(
                `/api/v1/folders/${folder.id}`,
            );
            expect(dataOf<Folder>(before).deadlineStatus).toBe('late');
            const res = await patch(
                folder.id,
                { deadlineAt: hours(24).toISOString() },
                p.tokens.owner,
            );
            expect(dataOf<Folder>(res).deadlineStatus).toBe('submitted');
            const versions = await as(p.tokens.owner).get(
                `/api/v1/folders/${folder.id}/versions`,
            );
            expect(dataOf<Version[]>(versions)[0].late).toBe(false);
        });

        it('404 for a folder the user cannot see or that was deleted', async () => {
            const folder = await folderRow();
            const deleted = await folderRow({ deletedAt: new Date() });
            expect(
                (await patch(deleted.id, { title: 'X' }, p.tokens.owner))
                    .status,
            ).toBe(404);
            expect(
                (await patch(folder.id, { title: 'X' }, p.tokens.s2)).status,
            ).toBe(404);
            expect(
                (await patch(folder.id, { title: 'X' }, p.tokens.other)).status,
            ).toBe(404);
        });
    });

    // ---------------------------------------------------------------
    describe('DELETE /folders/:folderId', () => {
        const remove = (id: string, token = p.tokens.s1) =>
            as(token).delete(`/api/v1/folders/${id}`);

        it('the creator soft-deletes an empty folder', async () => {
            const folder = await folderRow();
            const res = await remove(folder.id);
            expect(res.status).toBe(200);
            expect(dataOf(res)).toBeNull();
            const row = await prisma.submissionFolder.findUniqueOrThrow({
                where: { id: folder.id },
            });
            expect(row.deletedAt).not.toBeNull();
            expect((await remove(folder.id)).status).toBe(404);
        });

        it('a student cannot delete a folder with versions (409); the lecturer can', async () => {
            const folder = await folderRow();
            await versionRow(folder.id, 1);
            const res = await remove(folder.id);
            expect(res.status).toBe(409);
            expect(codeOf(res)).toBe('FOLDER_HAS_VERSIONS');
            expect((await remove(folder.id, p.tokens.owner)).status).toBe(200);
        });

        it('other members get 403, outsiders 404', async () => {
            const folder = await folderRow({
                projectId: sharedId,
                studentId: null,
            });
            const res = await remove(folder.id, p.tokens.s2);
            expect(res.status).toBe(403);
            expect(codeOf(res)).toBe('NOT_FOLDER_CREATOR');
            expect((await remove(folder.id, p.tokens.s3)).status).toBe(404);
            expect((await remove(folder.id, p.tokens.other)).status).toBe(404);
        });

        it('hides the versions and downloads of the deleted folder (BR-23)', async () => {
            const folder = await folderRow();
            const version = dataOf<Version>(await upload(folder.id));
            await remove(folder.id, p.tokens.owner);
            // the file is kept, only hidden (PRD §18.4)
            expect(storedFiles()).toHaveLength(1);
            expect(
                (
                    await as(p.tokens.owner).get(
                        `/api/v1/folders/${folder.id}/versions`,
                    )
                ).status,
            ).toBe(404);
            expect((await download(version.id)).status).toBe(404);
        });
    });

    describe('DELETE vs upload race (BR-23)', () => {
        it('a student delete and an upload never both succeed', async () => {
            for (let i = 0; i < 5; i++) {
                const folder = await folderRow({ title: `Race ${i}` });
                const [up, del] = await Promise.all([
                    upload(folder.id),
                    as(p.tokens.s1).delete(`/api/v1/folders/${folder.id}`),
                ]);
                const outcome = [up.status, del.status];
                expect([
                    [201, 409],
                    [404, 200],
                ]).toContainEqual(outcome);
                const row = await prisma.submissionFolder.findUniqueOrThrow({
                    where: { id: folder.id },
                    include: { _count: { select: { versions: true } } },
                });
                expect(row.deletedAt !== null && row._count.versions > 0).toBe(
                    false,
                );
            }
        });
    });

    // ---------------------------------------------------------------
    describe('POST /folders/:folderId/versions', () => {
        it('uploads a PDF: stored locally, numbered, E9 event', async () => {
            const folder = await folderRow();
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            const res = await upload(
                folder.id,
                PDF,
                'draft.pdf',
                p.tokens.s1,
                '  Bab 1 awal  ',
            );
            expect(res.status).toBe(201);
            const v = dataOf<Version>(res);
            expect(v).toMatchObject({
                folderId: folder.id,
                versionNumber: 1,
                note: 'Bab 1 awal',
                originalName: 'draft.pdf',
                mimeType: 'application/pdf',
                sizeBytes: PDF.length,
                late: false,
                feedbackCount: 0,
                openRevisions: 0,
                uploader: { id: p.studentS1.id, name: 'Andi S1' },
            });
            expect(v).not.toHaveProperty('storedKey');

            const row = await prisma.submissionVersion.findUniqueOrThrow({
                where: { id: v.id },
            });
            expect(row.storageDriver).toBe('local');
            expect(row.storedKey).toMatch(
                new RegExp(
                    `^projects/${individualId}/folders/${folder.id}/[0-9a-f-]{36}\\.pdf$`,
                ),
            );
            expect(existsSync(join(UPLOADS, row.storedKey))).toBe(true);
            expect(tmpFiles()).toEqual([]);

            const events = (emit.mock.calls as [unknown, unknown][]).filter(
                ([name]) => name === SUBMISSION_UPLOADED,
            );
            expect(events).toHaveLength(1);
            expect(events[0][1]).toBeInstanceOf(SubmissionUploadedEvent);
            expect(events[0][1]).toMatchObject({
                versionId: v.id,
                versionNumber: 1,
                note: 'Bab 1 awal',
                folder: { id: folder.id, title: 'Bab 1' },
                project: { id: individualId, title: 'Project Uji' },
                lecturer: {
                    id: p.owner.id,
                    name: 'Dosen Pemilik',
                    email: 'owner@example.com',
                },
                uploader: { id: p.studentS1.id, name: 'Andi S1' },
            });
            emit.mockRestore();
        });

        it('accepts DOCX and ZIP and numbers versions in order (BR-11)', async () => {
            const folder = await folderRow();
            const docx = await upload(folder.id, DOCX, 'Draft.DOCX');
            expect(dataOf<Version>(docx)).toMatchObject({
                versionNumber: 1,
                mimeType: DOCX_MIME,
                note: null,
            });
            const zip = await upload(folder.id, ZIP, 'lampiran.zip');
            expect(dataOf<Version>(zip)).toMatchObject({
                versionNumber: 2,
                mimeType: 'application/zip',
            });
            const detail = await as(p.tokens.s1).get(
                `/api/v1/folders/${folder.id}`,
            );
            expect(dataOf<Folder>(detail)).toMatchObject({
                versionCount: 2,
                latestVersion: { versionNumber: 2 },
            });
        });

        it('concurrent uploads get distinct numbers', async () => {
            const folder = await folderRow();
            const results = await Promise.all(
                Array.from({ length: 5 }, () => upload(folder.id)),
            );
            expect(results.map((r) => r.status)).toEqual(Array(5).fill(201));
            expect(
                results.map((r) => dataOf<Version>(r).versionNumber).sort(),
            ).toEqual([1, 2, 3, 4, 5]);
        });

        it('rejects files whose content does not match (400)', async () => {
            const folder = await folderRow();
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            for (const [file, name] of [
                [ZIP, 'palsu.pdf'],
                [PDF, 'palsu.zip'],
                [ZIP, 'bukan-word.docx'],
                [PDF, 'program.exe'],
                [PDF, 'tanpa-ekstensi'],
                [Buffer.alloc(0), 'kosong.pdf'],
            ] as const) {
                const res = await upload(folder.id, file, name);
                expect(res.status).toBe(400);
                expect(codeOf(res)).toBe('INVALID_FILE_TYPE');
            }
            expect(tmpFiles()).toEqual([]);
            expect(storedFiles()).toEqual([]);
            expect(
                await prisma.submissionVersion.count({
                    where: { folderId: folder.id },
                }),
            ).toBe(0);
            expect(
                (emit.mock.calls as [unknown, unknown][]).filter(
                    ([name]) => name === SUBMISSION_UPLOADED,
                ),
            ).toEqual([]);
            emit.mockRestore();
        });

        it('requires a file and validates the note', async () => {
            const folder = await folderRow();
            const none = await upload(folder.id, null);
            expect(none.status).toBe(400);

            const noFile = await as(p.tokens.s1)
                .post(`/api/v1/folders/${folder.id}/versions`)
                .field('note', 'tanpa file');
            expect(noFile.status).toBe(400);
            expect(codeOf(noFile)).toBe('FILE_REQUIRED');

            const longNote = await upload(
                folder.id,
                PDF,
                'draft.pdf',
                p.tokens.s1,
                'x'.repeat(2001),
            );
            expect(longNote.status).toBe(400);
            expect(tmpFiles()).toEqual([]);

            const twoFiles = await as(p.tokens.s1)
                .post(`/api/v1/folders/${folder.id}/versions`)
                .attach('file', PDF, 'a.pdf')
                .attach('file', PDF, 'b.pdf');
            expect(twoFiles.status).toBe(400);
        });

        it('rejects files over MAX_UPLOAD_MB (413)', async () => {
            const folder = await folderRow();
            const big = Buffer.concat([PDF, Buffer.alloc(1024 * 1024)]);
            const res = await upload(folder.id, big, 'besar.pdf');
            expect(res.status).toBe(413);
            expect(tmpFiles()).toEqual([]);
        });

        it('keeps UTF-8 names and cuts long ones keeping the extension', async () => {
            const folder = await folderRow();
            const utf8 = await upload(folder.id, PDF, 'Bab 1 – revisi ü.pdf');
            expect(dataOf<Version>(utf8).originalName).toBe(
                'Bab 1 – revisi ü.pdf',
            );
            const long = await upload(folder.id, PDF, `${'a'.repeat(300)}.pdf`);
            const name = dataOf<Version>(long).originalName;
            expect(name).toHaveLength(255);
            expect(name.endsWith('a.pdf')).toBe(true);
        });

        it('uploads after the deadline are allowed and labelled late (BR-24)', async () => {
            const folder = await folderRow({ deadlineAt: hours(-1) });
            const res = await upload(folder.id);
            expect(res.status).toBe(201);
            expect(dataOf<Version>(res).late).toBe(true);
            const detail = await as(p.tokens.s1).get(
                `/api/v1/folders/${folder.id}`,
            );
            expect(dataOf<Folder>(detail).deadlineStatus).toBe('late');

            const onTime = await folderRow({ deadlineAt: hours(1) });
            expect(dataOf<Version>(await upload(onTime.id)).late).toBe(false);
            const after = await as(p.tokens.s1).get(
                `/api/v1/folders/${onTime.id}`,
            );
            expect(dataOf<Folder>(after).deadlineStatus).toBe('submitted');
        });

        it('shared: any member uploads to any folder', async () => {
            const folder = await folderRow({
                projectId: sharedId,
                studentId: null,
                createdBy: p.owner.id,
            });
            const res = await upload(folder.id, PDF, 'tim.pdf', p.tokens.s2);
            expect(res.status).toBe(201);
            expect(dataOf<Version>(res).uploader.id).toBe(p.studentS2.id);
        });

        it('only the track owner student may upload', async () => {
            const folder = await folderRow();
            const lecturer = await upload(
                folder.id,
                PDF,
                'a.pdf',
                p.tokens.owner,
            );
            expect(lecturer.status).toBe(403);

            for (const token of [p.tokens.s2, p.tokens.s3]) {
                const res = await upload(folder.id, PDF, 'a.pdf', token);
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('FOLDER_NOT_FOUND');
            }
            const deleted = await folderRow({ deletedAt: new Date() });
            expect((await upload(deleted.id)).status).toBe(404);
            expect((await upload(MISSING_ID)).status).toBe(404);
            expect((await upload('abc')).status).toBe(400);
            expect(
                (
                    await http()
                        .post(`/api/v1/folders/${folder.id}/versions`)
                        .attach('file', PDF, 'a.pdf')
                ).status,
            ).toBe(401);
            expect(tmpFiles()).toEqual([]);
        });

        it('a folder deleted during the upload: 404 and the stored file is removed', async () => {
            const folder = await folderRow();
            const folders = app.get(FolderService);
            const seen = await folders.readable(folder.id, {
                id: p.studentS1.id,
                role: 'student',
            });
            // access was checked before the folder got deleted
            const readable = jest
                .spyOn(folders, 'readable')
                .mockResolvedValue(seen);
            await prisma.submissionFolder.update({
                where: { id: folder.id },
                data: { deletedAt: new Date() },
            });
            const res = await upload(folder.id);
            readable.mockRestore();
            expect(res.status).toBe(404);
            expect(codeOf(res)).toBe('FOLDER_NOT_FOUND');
            expect(storedFiles()).toEqual([]);
            expect(tmpFiles()).toEqual([]);
        });

        it('a failed insert removes the stored file', async () => {
            const folder = await folderRow();
            const create = jest
                .spyOn(app.get(SubmissionRepository), 'createVersion')
                .mockRejectedValueOnce(new Error('db down'));
            const res = await upload(folder.id);
            create.mockRestore();
            expect(res.status).toBe(500);
            expect(storedFiles()).toEqual([]);
            expect(tmpFiles()).toEqual([]);
        });

        it('a removed member or a deleted project blocks uploads (404)', async () => {
            const folder = await folderRow();
            const shared = await folderRow({
                projectId: sharedId,
                studentId: null,
            });
            await removeMember(individualId, p.studentS1.id);
            expect((await upload(folder.id)).status).toBe(404);

            await prisma.project.update({
                where: { id: sharedId },
                data: { deletedAt: new Date() },
            });
            expect((await upload(shared.id)).status).toBe(404);
            expect(storedFiles()).toEqual([]);
        });
    });

    // ---------------------------------------------------------------
    describe('GET /folders/:folderId/versions', () => {
        it('lists newest first with feedback and open revision counts', async () => {
            const folder = await folderRow({ deadlineAt: hours(-24) });
            const v1 = await versionRow(folder.id, 1, {
                createdAt: hours(-48),
            });
            const v2 = await versionRow(folder.id, 2, { createdAt: hours(-1) });
            await feedbackWith(v1.id, ['open', 'reopened', 'addressed']);
            await feedbackWith(v1.id, ['verified', 'open']);
            await feedbackWith(v2.id, []);

            const res = await as(p.tokens.s1).get(
                `/api/v1/folders/${folder.id}/versions`,
            );
            expect(res.status).toBe(200);
            expect(
                dataOf<Version[]>(res).map((v) => ({
                    n: v.versionNumber,
                    feedbackCount: v.feedbackCount,
                    openRevisions: v.openRevisions,
                    late: v.late,
                })),
            ).toEqual([
                { n: 2, feedbackCount: 1, openRevisions: 0, late: true },
                { n: 1, feedbackCount: 2, openRevisions: 3, late: false },
            ]);

            const asc = await as(p.tokens.owner).get(
                `/api/v1/folders/${folder.id}/versions?order=asc&limit=1`,
            );
            expect(dataOf<Version[]>(asc).map((v) => v.versionNumber)).toEqual([
                1,
            ]);
            expect(metaOf(asc).total).toBe(2);
        });

        it('404 for another student track', async () => {
            const folder = await folderRow();
            expect(
                (
                    await as(p.tokens.s2).get(
                        `/api/v1/folders/${folder.id}/versions`,
                    )
                ).status,
            ).toBe(404);
        });
    });

    // ---------------------------------------------------------------
    describe('GET /versions/:versionId/download', () => {
        it('streams the file with its name and type', async () => {
            const folder = await folderRow();
            const v = dataOf<Version>(
                await upload(folder.id, PDF, "Bab 1 (final) d'Arc ü.pdf"),
            );
            for (const token of [p.tokens.owner, p.tokens.s1]) {
                const res = await download(v.id, token);
                expect(res.status).toBe(200);
                expect(res.body).toEqual(PDF);
                expect(res.headers['content-type']).toBe('application/pdf');
                expect(res.headers['content-length']).toBe(String(PDF.length));
                expect(res.headers['content-disposition']).toBe(
                    "attachment; filename*=UTF-8''Bab%201%20%28final%29%20d%27Arc%20%C3%BC.pdf",
                );
                expect(res.headers['x-content-type-options']).toBe('nosniff');
            }
        });

        it('shared: every member downloads', async () => {
            const folder = await folderRow({
                projectId: sharedId,
                studentId: null,
            });
            const v = dataOf<Version>(await upload(folder.id));
            expect((await download(v.id, p.tokens.s2)).status).toBe(200);
        });

        it('404 for outsiders and unknown versions', async () => {
            const folder = await folderRow();
            const v = dataOf<Version>(await upload(folder.id));
            for (const [id, token] of [
                [v.id, p.tokens.s2],
                [v.id, p.tokens.s3],
                [v.id, p.tokens.other],
                [MISSING_ID, p.tokens.owner],
            ]) {
                const res = await download(id, token);
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('VERSION_NOT_FOUND');
            }
            expect((await download('abc')).status).toBe(400);
        });

        it('404 after the member is removed or the project is deleted', async () => {
            const folder = await folderRow();
            const v = dataOf<Version>(await upload(folder.id));
            await removeMember(individualId, p.studentS1.id);
            expect((await download(v.id, p.tokens.s1)).status).toBe(404);
            expect((await download(v.id)).status).toBe(200);

            await prisma.project.update({
                where: { id: individualId },
                data: { deletedAt: new Date() },
            });
            expect((await download(v.id)).status).toBe(404);
        });

        it('a version stored on R2 is unavailable until the adapter exists (503)', async () => {
            const folder = await folderRow();
            const v = await versionRow(folder.id, 1, { storageDriver: 'r2' });
            const res = await download(v.id);
            expect(res.status).toBe(503);
            expect(codeOf(res)).toBe('STORAGE_UNAVAILABLE');
        });
    });

    // ---------------------------------------------------------------
    describe('project type and folders (BR-04)', () => {
        const changeType = (projectId: string, type: string) =>
            as(p.tokens.owner)
                .patch(`/api/v1/projects/${projectId}`)
                .send({ type });

        it('the track mode cannot change once the project has folders', async () => {
            const empty = await createProject(prisma, p.owner.id);
            await folderRow({
                projectId: empty.id,
                studentId: null,
                createdBy: p.owner.id,
            });
            const res = await changeType(empty.id, 's1_thesis');
            expect(res.status).toBe(409);
            expect(codeOf(res)).toBe('PROJECT_TYPE_LOCKED');
            // same track mode is fine
            expect((await changeType(empty.id, 'competition')).status).toBe(
                200,
            );
        });

        it('nor from individual to shared', async () => {
            const thesis = await createProject(prisma, p.owner.id, {
                type: 's1_thesis',
            });
            await folderRow({ projectId: thesis.id, createdBy: p.owner.id });
            const res = await changeType(thesis.id, 'research');
            expect(res.status).toBe(409);
            expect(codeOf(res)).toBe('PROJECT_TYPE_LOCKED');
            expect(
                (await changeType(thesis.id, 's1_thesis_proposal')).status,
            ).toBe(200);
        });

        it('deleted folders do not lock the type', async () => {
            const empty = await createProject(prisma, p.owner.id);
            await folderRow({
                projectId: empty.id,
                studentId: null,
                deletedAt: new Date(),
            });
            expect((await changeType(empty.id, 's1_thesis')).status).toBe(200);
        });
    });
});
