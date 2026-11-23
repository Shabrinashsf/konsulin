import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { RevisionItemStatus } from '../src/generated/prisma/client';
import {
    FEEDBACK_CREATED,
    FeedbackCreatedEvent,
} from '../src/modules/feedback/feedback-events';
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
type Item = {
    id: string;
    feedbackId: string;
    position: number;
    description: string;
    status: RevisionItemStatus;
    addressedNote: string | null;
    addressedInVersion: { id: string; versionNumber: number } | null;
    version?: { id: string; versionNumber: number };
    folder?: { id: string; title: string; studentId: string | null };
};
type Feedback = {
    id: string;
    versionId: string;
    content: string;
    revisionItems: Item[];
};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('Feedback (e2e)', () => {
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

    // a folder with versions 1..n, straight in the DB
    const folderWithVersions = async (
        n = 3,
        data: Partial<{
            projectId: string;
            studentId: string | null;
            deletedAt: Date;
        }> = {},
    ) => {
        const folder = await prisma.submissionFolder.create({
            data: {
                projectId: individualId,
                studentId: p.studentS1.id,
                createdBy: p.studentS1.id,
                title: 'Bab 1',
                ...data,
            },
        });
        const versions = [];
        for (let i = 1; i <= n; i++) {
            versions.push(
                await prisma.submissionVersion.create({
                    data: {
                        folderId: folder.id,
                        versionNumber: i,
                        uploadedBy: p.studentS1.id,
                        originalName: `v${i}.pdf`,
                        storageDriver: 'local',
                        storedKey: `k/${folder.id}/${i}.pdf`,
                        mimeType: 'application/pdf',
                        sizeBytes: 10,
                    },
                }),
            );
        }
        return { folder, versions };
    };
    const feedbackRow = (
        versionId: string,
        statuses: RevisionItemStatus[] = ['open'],
        addressedInVersionId?: string,
    ) =>
        prisma.feedback.create({
            data: {
                versionId,
                content: 'Perbaiki latar belakang',
                revisionItems: {
                    create: statuses.map((status, position) => ({
                        position,
                        description: `Item ${position}`,
                        status,
                        addressedInVersionId:
                            status === 'open' ? null : addressedInVersionId,
                    })),
                },
            },
            include: { revisionItems: { orderBy: { position: 'asc' } } },
        });
    const removeMember = (projectId: string, studentId: string) =>
        prisma.projectMember.delete({
            where: { projectId_studentId: { projectId, studentId } },
        });

    const createFeedback = (
        versionId: string,
        body: object,
        token = p.tokens.owner,
    ) => as(token).post(`/api/v1/versions/${versionId}/feedbacks`).send(body);
    const listFeedback = (versionId: string, token = p.tokens.owner) =>
        as(token).get(`/api/v1/versions/${versionId}/feedbacks`);
    const address = (itemId: string, body: object, token = p.tokens.s1) =>
        as(token).post(`/api/v1/revision-items/${itemId}/address`).send(body);
    const review = (itemId: string, decision: string, token = p.tokens.owner) =>
        as(token)
            .post(`/api/v1/revision-items/${itemId}/review`)
            .send({ decision });
    const listItems = (projectId: string, query = '', token = p.tokens.owner) =>
        as(token).get(`/api/v1/projects/${projectId}/revision-items${query}`);
    const itemStatus = async (id: string) =>
        (await prisma.revisionItem.findUniqueOrThrow({ where: { id } })).status;

    beforeAll(async () => {
        app = await createTestApp();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await resetState(app);
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
        await app.close();
    });

    // ---------------------------------------------------------------
    describe('POST /versions/:versionId/feedbacks', () => {
        it('creates feedback with its checklist in order + E10 event', async () => {
            const { folder, versions } = await folderWithVersions(1);
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            const res = await createFeedback(versions[0].id, {
                content: '  Latar belakang kurang kuat  ',
                revisionItems: [
                    { description: ' Tambah data ' },
                    { description: 'Perbaiki rumusan masalah' },
                ],
            });
            expect(res.status).toBe(201);
            const f = dataOf<Feedback>(res);
            expect(f).toMatchObject({
                versionId: versions[0].id,
                content: 'Latar belakang kurang kuat',
                revisionItems: [
                    {
                        position: 0,
                        description: 'Tambah data',
                        status: 'open',
                        addressedInVersion: null,
                        addressedNote: null,
                    },
                    { position: 1, description: 'Perbaiki rumusan masalah' },
                ],
            });

            const events = (emit.mock.calls as [unknown, unknown][]).filter(
                ([name]) => name === FEEDBACK_CREATED,
            );
            expect(events).toHaveLength(1);
            expect(events[0][1]).toBeInstanceOf(FeedbackCreatedEvent);
            expect(events[0][1]).toEqual({
                feedbackId: f.id,
                content: 'Latar belakang kurang kuat',
                revisionItems: ['Tambah data', 'Perbaiki rumusan masalah'],
                version: { id: versions[0].id, versionNumber: 1 },
                folder: {
                    id: folder.id,
                    title: 'Bab 1',
                    studentId: p.studentS1.id,
                },
                project: {
                    id: individualId,
                    title: 'Project Uji',
                    type: 's1_thesis',
                },
                lecturer: { id: p.owner.id, name: 'Dosen Pemilik' },
            });
            emit.mockRestore();
        });

        it('the checklist is optional', async () => {
            const { versions } = await folderWithVersions(1);
            for (const body of [
                { content: 'Sudah bagus' },
                { content: 'Sudah bagus', revisionItems: [] },
            ]) {
                const res = await createFeedback(versions[0].id, body);
                expect(res.status).toBe(201);
                expect(dataOf<Feedback>(res).revisionItems).toEqual([]);
            }
        });

        it('any visible version, old ones included (BR-25)', async () => {
            const { versions } = await folderWithVersions(3);
            const res = await createFeedback(versions[0].id, {
                content: 'Catatan untuk v1',
            });
            expect(res.status).toBe(201);
        });

        it('validates the body', async () => {
            const { versions } = await folderWithVersions(1);
            const items = (n: number) =>
                Array.from({ length: n }, (_, i) => ({
                    description: `Item ${i}`,
                }));
            for (const body of [
                {},
                { content: '   ' },
                { content: 'x'.repeat(10001) },
                { content: 'ok', revisionItems: items(51) },
                { content: 'ok', revisionItems: [{ description: ' ' }] },
                {
                    content: 'ok',
                    revisionItems: [{ description: 'x'.repeat(1001) }],
                },
                { content: 'ok', revisionItems: ['Tambah data'] },
                { content: 'ok', revisionItems: 'Tambah data' },
                { content: 'ok', revisionItems: [{ description: 'a', x: 1 }] },
                { content: 'ok', extra: true },
            ]) {
                expect(
                    (await createFeedback(versions[0].id, body)).status,
                ).toBe(400);
            }
            expect(
                (
                    await createFeedback(versions[0].id, {
                        content: 'x'.repeat(10000),
                        revisionItems: items(50),
                    })
                ).status,
            ).toBe(201);
        });

        it('no E10 event when the request is refused', async () => {
            const { versions } = await folderWithVersions(1);
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            await createFeedback(versions[0].id, {});
            await createFeedback(versions[0].id, { content: 'x' }, p.tokens.s1);
            await createFeedback(
                versions[0].id,
                { content: 'x' },
                p.tokens.other,
            );
            expect(
                (emit.mock.calls as [unknown, unknown][]).filter(
                    ([name]) => name === FEEDBACK_CREATED,
                ),
            ).toEqual([]);
            expect(await prisma.feedback.count()).toBe(0);
            emit.mockRestore();
        });

        it('shared: the event has no track owner', async () => {
            const { folder, versions } = await folderWithVersions(1, {
                projectId: sharedId,
                studentId: null,
            });
            const emit = jest.spyOn(app.get(EventEmitter2), 'emit');
            await createFeedback(versions[0].id, { content: 'Tim' });
            const [, event] = (emit.mock.calls as [unknown, unknown][]).find(
                ([name]) => name === FEEDBACK_CREATED,
            )!;
            expect(event).toMatchObject({
                folder: { id: folder.id, studentId: null },
                project: { id: sharedId, type: 'research' },
            });
            emit.mockRestore();
        });

        it('students cannot give feedback (403)', async () => {
            const { versions } = await folderWithVersions(1);
            const res = await createFeedback(
                versions[0].id,
                { content: 'x' },
                p.tokens.s1,
            );
            expect(res.status).toBe(403);
        });

        it('404 for versions the lecturer cannot see', async () => {
            const { versions } = await folderWithVersions(1);
            const deleted = await folderWithVersions(1, {
                deletedAt: new Date(),
            });
            for (const [id, token] of [
                [versions[0].id, p.tokens.other],
                [deleted.versions[0].id, p.tokens.owner],
                [MISSING_ID, p.tokens.owner],
            ]) {
                const res = await createFeedback(id, { content: 'x' }, token);
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('VERSION_NOT_FOUND');
            }
            expect((await createFeedback('abc', { content: 'x' })).status).toBe(
                400,
            );
            expect(
                (
                    await http()
                        .post(`/api/v1/versions/${versions[0].id}/feedbacks`)
                        .send({ content: 'x' })
                ).status,
            ).toBe(401);
        });

        it('a removed student folder can still get feedback (BR-25)', async () => {
            const { versions } = await folderWithVersions(1);
            await removeMember(individualId, p.studentS1.id);
            expect(
                (await createFeedback(versions[0].id, { content: 'x' })).status,
            ).toBe(201);
        });
    });

    // ---------------------------------------------------------------
    describe('GET /versions/:versionId/feedbacks', () => {
        it('lists newest first, items by position', async () => {
            const { versions } = await folderWithVersions(1);
            const empty = await listFeedback(versions[0].id);
            expect(dataOf(empty)).toEqual([]);

            const older = await feedbackRow(versions[0].id, ['open']);
            await prisma.feedback.update({
                where: { id: older.id },
                data: { createdAt: new Date(Date.now() - 60_000) },
            });
            const newer = await feedbackRow(versions[0].id, [
                'open',
                'addressed',
                'verified',
            ]);
            const res = await listFeedback(versions[0].id, p.tokens.s1);
            expect(res.status).toBe(200);
            const list = dataOf<Feedback[]>(res);
            expect(list.map((f) => f.id)).toEqual([newer.id, older.id]);
            expect(list[0].revisionItems.map((i) => i.position)).toEqual([
                0, 1, 2,
            ]);
        });

        it('follows folder access (BR-05)', async () => {
            const { versions } = await folderWithVersions(1);
            const shared = await folderWithVersions(1, {
                projectId: sharedId,
                studentId: null,
            });
            const deleted = await folderWithVersions(1, {
                deletedAt: new Date(),
            });
            expect((await listFeedback(versions[0].id)).status).toBe(200);
            expect(
                (await listFeedback(shared.versions[0].id, p.tokens.s2)).status,
            ).toBe(200);
            for (const [id, token] of [
                [versions[0].id, p.tokens.s2],
                [versions[0].id, p.tokens.s3],
                [versions[0].id, p.tokens.other],
                [deleted.versions[0].id, p.tokens.owner],
            ]) {
                const res = await listFeedback(id, token);
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('VERSION_NOT_FOUND');
            }
        });

        it('a removed student loses access, the lecturer keeps it', async () => {
            const { versions } = await folderWithVersions(1);
            await removeMember(individualId, p.studentS1.id);
            expect(
                (await listFeedback(versions[0].id, p.tokens.s1)).status,
            ).toBe(404);
            expect((await listFeedback(versions[0].id)).status).toBe(200);
        });

        it('a deleted project hides it (BR-15)', async () => {
            const { versions } = await folderWithVersions(1);
            await prisma.project.update({
                where: { id: individualId },
                data: { deletedAt: new Date() },
            });
            expect((await listFeedback(versions[0].id)).status).toBe(404);
        });
    });

    // ---------------------------------------------------------------
    describe('PATCH /feedbacks/:feedbackId', () => {
        const patch = (id: string, body: object, token = p.tokens.owner) =>
            as(token).patch(`/api/v1/feedbacks/${id}`).send(body);

        it('changes the content only, even after work started', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(
                versions[0].id,
                ['open', 'addressed'],
                versions[1].id,
            );
            const res = await patch(f.id, { content: '  Diperjelas  ' });
            expect(res.status).toBe(200);
            const updated = dataOf<Feedback>(res);
            expect(updated.content).toBe('Diperjelas');
            expect(updated.revisionItems.map((i) => i.status)).toEqual([
                'open',
                'addressed',
            ]);
        });

        it('revision items cannot be changed (BR-25)', async () => {
            const { versions } = await folderWithVersions(1);
            const f = await feedbackRow(versions[0].id);
            for (const body of [
                { content: 'x', revisionItems: [{ description: 'baru' }] },
                {},
                { content: '' },
                { content: 'x'.repeat(10001) },
            ]) {
                expect((await patch(f.id, body)).status).toBe(400);
            }
            expect(await prisma.revisionItem.count()).toBe(1);
        });

        it('403 for students, 404 for other lecturers and unknown ids', async () => {
            const { versions } = await folderWithVersions(1);
            const f = await feedbackRow(versions[0].id);
            expect(
                (await patch(f.id, { content: 'x' }, p.tokens.s1)).status,
            ).toBe(403);
            for (const [id, token] of [
                [f.id, p.tokens.other],
                [MISSING_ID, p.tokens.owner],
            ]) {
                const res = await patch(id, { content: 'x' }, token);
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('FEEDBACK_NOT_FOUND');
            }
        });

        it('404 once the folder is deleted', async () => {
            const { folder, versions } = await folderWithVersions(1);
            const f = await feedbackRow(versions[0].id);
            await prisma.submissionFolder.update({
                where: { id: folder.id },
                data: { deletedAt: new Date() },
            });
            expect((await patch(f.id, { content: 'x' })).status).toBe(404);
        });
    });

    // ---------------------------------------------------------------
    describe('DELETE /feedbacks/:feedbackId', () => {
        const remove = (id: string, token = p.tokens.owner) =>
            as(token).delete(`/api/v1/feedbacks/${id}`);

        it('deletes feedback whose items are all open, items included', async () => {
            const { versions } = await folderWithVersions(1);
            const f = await feedbackRow(versions[0].id, ['open', 'open']);
            const empty = await feedbackRow(versions[0].id, []);
            const res = await remove(f.id);
            expect(res.status).toBe(200);
            expect(dataOf(res)).toBeNull();
            expect(await prisma.revisionItem.count()).toBe(0);
            expect((await remove(empty.id)).status).toBe(200);
            expect((await remove(f.id)).status).toBe(404);
        });

        it('409 once any item was worked on (BR-25)', async () => {
            const { versions } = await folderWithVersions(2);
            for (const status of [
                'addressed',
                'verified',
                'reopened',
            ] as const) {
                const f = await feedbackRow(
                    versions[0].id,
                    ['open', status],
                    versions[1].id,
                );
                const res = await remove(f.id);
                expect(res.status).toBe(409);
                expect(codeOf(res)).toBe('FEEDBACK_HAS_PROGRESS');
            }
            expect(await prisma.feedback.count()).toBe(3);
        });

        it('leaves other feedback alone; 404 once the folder is deleted', async () => {
            const { folder, versions } = await folderWithVersions(1);
            const a = await feedbackRow(versions[0].id, ['open']);
            const b = await feedbackRow(versions[0].id, ['open', 'open']);
            await remove(a.id);
            expect(
                await prisma.revisionItem.count({
                    where: { feedbackId: b.id },
                }),
            ).toBe(2);
            await prisma.submissionFolder.update({
                where: { id: folder.id },
                data: { deletedAt: new Date() },
            });
            expect((await remove(b.id)).status).toBe(404);
            expect(await prisma.feedback.count()).toBe(1);
        });

        it('403 for students, 404 for other lecturers', async () => {
            const { versions } = await folderWithVersions(1);
            const f = await feedbackRow(versions[0].id);
            expect((await remove(f.id, p.tokens.s1)).status).toBe(403);
            expect((await remove(f.id, p.tokens.other)).status).toBe(404);
        });
    });

    // ---------------------------------------------------------------
    describe('POST /revision-items/:itemId/address', () => {
        it('marks an open item fixed in a newer version', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(versions[0].id);
            const res = await address(f.revisionItems[0].id, {
                versionId: versions[1].id,
                note: '  Sudah ditambah di bab 1.2  ',
            });
            expect(res.status).toBe(200);
            expect(dataOf<Item>(res)).toMatchObject({
                id: f.revisionItems[0].id,
                feedbackId: f.id,
                status: 'addressed',
                addressedNote: 'Sudah ditambah di bab 1.2',
                addressedInVersion: { id: versions[1].id, versionNumber: 2 },
                version: { id: versions[0].id, versionNumber: 1 },
                folder: { title: 'Bab 1', studentId: p.studentS1.id },
            });
        });

        it('the fix must be a newer version of the same folder (BR-14)', async () => {
            const { versions } = await folderWithVersions(3);
            const other = await folderWithVersions(3);
            const f = await feedbackRow(versions[1].id); // on v2
            const item = f.revisionItems[0].id;
            for (const versionId of [versions[0].id, versions[1].id]) {
                const res = await address(item, { versionId });
                expect(res.status).toBe(400);
                expect(codeOf(res)).toBe('VERSION_NOT_NEWER');
            }
            for (const versionId of [other.versions[2].id, MISSING_ID]) {
                const res = await address(item, { versionId });
                expect(res.status).toBe(400);
                expect(codeOf(res)).toBe('VERSION_NOT_IN_FOLDER');
            }
            expect(await itemStatus(item)).toBe('open');
        });

        it('after a reopen the fix must beat the last claimed one', async () => {
            const { versions } = await folderWithVersions(3);
            const f = await feedbackRow(
                versions[0].id,
                ['reopened'],
                versions[1].id,
            );
            const item = f.revisionItems[0].id;
            await prisma.revisionItem.update({
                where: { id: item },
                data: { addressedNote: 'catatan lama' },
            });

            // the reopened item still shows the last claim
            const list = await listItems(individualId, '', p.tokens.s1);
            expect(dataOf<Item[]>(list)[0]).toMatchObject({
                status: 'reopened',
                addressedNote: 'catatan lama',
                addressedInVersion: { versionNumber: 2 },
            });

            const same = await address(item, {
                versionId: versions[1].id,
            });
            expect(codeOf(same)).toBe('VERSION_NOT_NEWER');
            // an empty note clears the old one
            const res = await address(item, {
                versionId: versions[2].id,
                note: '   ',
            });
            expect(res.status).toBe(200);
            expect(dataOf<Item>(res)).toMatchObject({
                status: 'addressed',
                addressedNote: null,
                addressedInVersion: { versionNumber: 3 },
            });
        });

        it('409 for items that are not open or reopened (BR-13)', async () => {
            const { versions } = await folderWithVersions(3);
            const f = await feedbackRow(
                versions[0].id,
                ['addressed', 'verified'],
                versions[1].id,
            );
            for (const item of f.revisionItems) {
                const res = await address(item.id, {
                    versionId: versions[2].id,
                });
                expect(res.status).toBe(409);
                expect(codeOf(res)).toBe('INVALID_REVISION_TRANSITION');
            }
        });

        it('shared: any member addresses (BR-25)', async () => {
            const { versions } = await folderWithVersions(2, {
                projectId: sharedId,
                studentId: null,
            });
            const f = await feedbackRow(versions[0].id);
            const res = await address(
                f.revisionItems[0].id,
                { versionId: versions[1].id },
                p.tokens.s2,
            );
            expect(res.status).toBe(200);
        });

        it('only students of that track: 403 lecturer, 404 others', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(versions[0].id);
            const item = f.revisionItems[0].id;
            const body = { versionId: versions[1].id };
            expect((await address(item, body, p.tokens.owner)).status).toBe(
                403,
            );
            for (const token of [p.tokens.s2, p.tokens.s3]) {
                const res = await address(item, body, token);
                expect(res.status).toBe(404);
                expect(codeOf(res)).toBe('REVISION_ITEM_NOT_FOUND');
            }
            await removeMember(individualId, p.studentS1.id);
            expect((await address(item, body)).status).toBe(404);
            expect((await address(MISSING_ID, body)).status).toBe(404);
        });

        it('404 once the folder or project is deleted, or the member removed', async () => {
            const a = await folderWithVersions(2);
            const b = await folderWithVersions(2, {
                projectId: sharedId,
                studentId: null,
            });
            const fa = await feedbackRow(a.versions[0].id);
            const fb = await feedbackRow(b.versions[0].id);

            await prisma.submissionFolder.update({
                where: { id: a.folder.id },
                data: { deletedAt: new Date() },
            });
            const deleted = await address(fa.revisionItems[0].id, {
                versionId: a.versions[1].id,
            });
            expect(deleted.status).toBe(404);
            expect(codeOf(deleted)).toBe('REVISION_ITEM_NOT_FOUND');

            await removeMember(sharedId, p.studentS2.id);
            const body = { versionId: b.versions[1].id };
            expect(
                (await address(fb.revisionItems[0].id, body, p.tokens.s2))
                    .status,
            ).toBe(404);
            await prisma.project.update({
                where: { id: sharedId },
                data: { deletedAt: new Date() },
            });
            expect((await address(fb.revisionItems[0].id, body)).status).toBe(
                404,
            );
        });

        it('validates the body', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(versions[0].id);
            for (const body of [
                {},
                { versionId: 'abc' },
                { versionId: versions[1].id, note: 'x'.repeat(2001) },
                { versionId: versions[1].id, extra: 1 },
            ]) {
                expect(
                    (await address(f.revisionItems[0].id, body)).status,
                ).toBe(400);
            }
        });
    });

    // ---------------------------------------------------------------
    describe('POST /revision-items/:itemId/review', () => {
        it('verify and reopen an addressed item', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(
                versions[0].id,
                ['addressed', 'addressed'],
                versions[1].id,
            );
            const [a, b] = f.revisionItems;
            const verified = await review(a.id, 'verify');
            expect(verified.status).toBe(200);
            expect(dataOf<Item>(verified).status).toBe('verified');

            const reopened = await review(b.id, 'reopen');
            expect(dataOf<Item>(reopened)).toMatchObject({
                status: 'reopened',
                addressedInVersion: { id: versions[1].id },
            });
        });

        it('409 unless addressed; verified is final (BR-13)', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(
                versions[0].id,
                ['open', 'reopened', 'verified'],
                versions[1].id,
            );
            for (const item of f.revisionItems) {
                for (const decision of ['verify', 'reopen']) {
                    const res = await review(item.id, decision);
                    expect(res.status).toBe(409);
                    expect(codeOf(res)).toBe('INVALID_REVISION_TRANSITION');
                }
            }
        });

        it('lecturer owner only; validates the decision', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(
                versions[0].id,
                ['addressed'],
                versions[1].id,
            );
            const item = f.revisionItems[0].id;
            expect((await review(item, 'verify', p.tokens.s1)).status).toBe(
                403,
            );
            expect((await review(item, 'verify', p.tokens.other)).status).toBe(
                404,
            );
            for (const decision of ['approve', '']) {
                expect((await review(item, decision)).status).toBe(400);
            }
            expect(await itemStatus(item)).toBe('addressed');
        });

        it('404 for unknown items and deleted folders', async () => {
            const { folder, versions } = await folderWithVersions(2);
            const f = await feedbackRow(
                versions[0].id,
                ['addressed'],
                versions[1].id,
            );
            expect((await review(MISSING_ID, 'verify')).status).toBe(404);
            await prisma.submissionFolder.update({
                where: { id: folder.id },
                data: { deletedAt: new Date() },
            });
            const res = await review(f.revisionItems[0].id, 'verify');
            expect(res.status).toBe(404);
            expect(codeOf(res)).toBe('REVISION_ITEM_NOT_FOUND');
        });

        it('items of a removed student can still be reviewed', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(
                versions[0].id,
                ['addressed'],
                versions[1].id,
            );
            await removeMember(individualId, p.studentS1.id);
            expect((await review(f.revisionItems[0].id, 'verify')).status).toBe(
                200,
            );
        });
    });

    // ---------------------------------------------------------------
    describe('GET /projects/:projectId/revision-items', () => {
        it('individual: a student only sees their own track (BR-05)', async () => {
            const own = await folderWithVersions(1);
            const other = await folderWithVersions(1, {
                studentId: p.studentS2.id,
            });
            await feedbackRow(own.versions[0].id, ['open']);
            await feedbackRow(other.versions[0].id, ['open', 'open']);

            const s1 = await listItems(individualId, '', p.tokens.s1);
            expect(metaOf(s1).total).toBe(1);
            expect(dataOf<Item[]>(s1)[0].folder?.id).toBe(own.folder.id);
            const s1Other = await listItems(
                individualId,
                `?studentId=${p.studentS2.id}`,
                p.tokens.s1,
            );
            expect(metaOf(s1Other).total).toBe(0);

            expect(metaOf(await listItems(individualId)).total).toBe(3);
            const byStudent = await listItems(
                individualId,
                `?studentId=${p.studentS2.id}`,
            );
            expect(metaOf(byStudent).total).toBe(2);
        });

        it('filters by status and folder, newest first then position', async () => {
            const a = await folderWithVersions(2);
            const b = await folderWithVersions(1);
            const old = await feedbackRow(
                a.versions[0].id,
                ['open', 'addressed'],
                a.versions[1].id,
            );
            await prisma.feedback.update({
                where: { id: old.id },
                data: { createdAt: new Date(Date.now() - 60_000) },
            });
            await prisma.revisionItem.updateMany({
                where: { feedbackId: old.id },
                data: { createdAt: new Date(Date.now() - 60_000) },
            });
            const recent = await feedbackRow(
                b.versions[0].id,
                ['open', 'verified'],
                b.versions[0].id,
            );

            const all = await listItems(individualId);
            expect(dataOf<Item[]>(all).map((i) => i.id)).toEqual([
                ...recent.revisionItems.map((i) => i.id),
                ...old.revisionItems.map((i) => i.id),
            ]);
            const oldestFirst = await listItems(individualId, '?order=asc');
            expect(dataOf<Item[]>(oldestFirst)[0].id).toBe(
                old.revisionItems[0].id,
            );
            const open = await listItems(individualId, '?status=open');
            expect(metaOf(open).total).toBe(2);
            const inA = await listItems(
                individualId,
                `?folderId=${a.folder.id}`,
            );
            expect(dataOf<Item[]>(inA).map((i) => i.id)).toEqual(
                old.revisionItems.map((i) => i.id),
            );
            const page = await listItems(individualId, '?limit=3&page=2');
            expect(metaOf(page)).toEqual({
                page: 2,
                limit: 3,
                total: 4,
                totalPages: 2,
            });
        });

        it('shared: every member sees every item; deleted folders are hidden', async () => {
            const shared = await folderWithVersions(1, {
                projectId: sharedId,
                studentId: null,
            });
            const gone = await folderWithVersions(1, {
                projectId: sharedId,
                studentId: null,
                deletedAt: new Date(),
            });
            await feedbackRow(shared.versions[0].id, ['open']);
            await feedbackRow(gone.versions[0].id, ['open']);
            const res = await listItems(sharedId, '', p.tokens.s2);
            expect(metaOf(res).total).toBe(1);
        });

        it('a removed student item stays in the lecturer list', async () => {
            const { versions } = await folderWithVersions(1);
            await feedbackRow(versions[0].id, ['open']);
            await removeMember(individualId, p.studentS1.id);
            expect(metaOf(await listItems(individualId)).total).toBe(1);
            expect(
                (await listItems(individualId, '', p.tokens.s1)).status,
            ).toBe(404);
        });

        it('404 for a deleted project', async () => {
            await prisma.project.update({
                where: { id: individualId },
                data: { deletedAt: new Date() },
            });
            expect((await listItems(individualId)).status).toBe(404);
        });

        it('404 for outsiders, 400 for bad filters', async () => {
            expect(
                (await listItems(individualId, '', p.tokens.s3)).status,
            ).toBe(404);
            expect(
                (await listItems(individualId, '', p.tokens.other)).status,
            ).toBe(404);
            for (const q of ['?status=done', '?folderId=abc', '?studentId=1']) {
                expect((await listItems(individualId, q)).status).toBe(400);
            }
        });
    });

    // ---------------------------------------------------------------
    describe('full checklist cycle', () => {
        it('create, address, reopen, address again, verify; open counts follow', async () => {
            const { folder, versions } = await folderWithVersions(3);
            const openOf = async (versionId: string) =>
                dataOf<{ id: string; openRevisions: number }[]>(
                    await as(p.tokens.owner).get(
                        `/api/v1/folders/${folder.id}/versions`,
                    ),
                ).find((v) => v.id === versionId)!.openRevisions;

            const f = dataOf<Feedback>(
                await createFeedback(versions[0].id, {
                    content: 'Revisi bab 1',
                    revisionItems: [{ description: 'Tambah data' }],
                }),
            );
            const item = f.revisionItems[0].id;
            expect(await openOf(versions[0].id)).toBe(1);

            await address(item, { versionId: versions[1].id });
            expect(await openOf(versions[0].id)).toBe(0);

            await review(item, 'reopen');
            expect(await openOf(versions[0].id)).toBe(1);

            const again = await address(item, { versionId: versions[2].id });
            expect(again.status).toBe(200);
            const verified = await review(item, 'verify');
            expect(dataOf<Item>(verified)).toMatchObject({
                status: 'verified',
                addressedInVersion: { versionNumber: 3 },
            });
            expect(await openOf(versions[0].id)).toBe(0);

            // work happened, so the feedback can no longer be deleted
            const del = await as(p.tokens.owner).delete(
                `/api/v1/feedbacks/${f.id}`,
            );
            expect(codeOf(del)).toBe('FEEDBACK_HAS_PROGRESS');
        });
    });

    // ---------------------------------------------------------------
    describe('races', () => {
        it('deleting feedback and addressing its item never both succeed', async () => {
            const { versions } = await folderWithVersions(2);
            for (let i = 0; i < 5; i++) {
                const f = await feedbackRow(versions[0].id);
                const [addr, del] = await Promise.all([
                    address(f.revisionItems[0].id, {
                        versionId: versions[1].id,
                    }),
                    as(p.tokens.owner).delete(`/api/v1/feedbacks/${f.id}`),
                ]);
                expect([
                    [200, 409],
                    [404, 200],
                ]).toContainEqual([addr.status, del.status]);
            }
        });

        it('two addresses of one item: one wins', async () => {
            const { versions } = await folderWithVersions(3);
            const f = await feedbackRow(versions[0].id);
            const results = await Promise.all(
                [versions[1].id, versions[2].id].map((versionId) =>
                    address(f.revisionItems[0].id, { versionId }),
                ),
            );
            expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        });

        it('verify and reopen at once: one wins', async () => {
            const { versions } = await folderWithVersions(2);
            const f = await feedbackRow(
                versions[0].id,
                ['addressed'],
                versions[1].id,
            );
            const results = await Promise.all([
                review(f.revisionItems[0].id, 'verify'),
                review(f.revisionItems[0].id, 'reopen'),
            ]);
            expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
        });
    });
});
