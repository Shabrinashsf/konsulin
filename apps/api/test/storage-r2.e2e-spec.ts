import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import type { Env } from '../src/config/env.schema';
import { StorageService } from '../src/modules/submission/storage.service';
import { SubmissionRepository } from '../src/modules/submission/submission.repository';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';
import {
    addMember,
    createProject,
    dataOf,
    resetState,
    seedPeople,
} from './utils/fixtures';

// switching STORAGE_DRIVER to r2 needs no code change, and versions
// stored with the old driver stay downloadable.
const R2_ENV = {
    STORAGE_DRIVER: 'r2',
    R2_ACCOUNT_ID: 'acc',
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'konsulin-test',
};

const UPLOADS = process.env.UPLOAD_DIR!;
const TMP = process.env.UPLOAD_TMP_DIR!;
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

// an in-memory bucket in place of Cloudflare R2 (S3Client.send)
const bucket = new Map<string, Buffer>();
const r2 = {
    send: jest.fn(async (cmd: unknown) => {
        if (cmd instanceof PutObjectCommand) {
            expect(cmd.input.Bucket).toBe(R2_ENV.R2_BUCKET);
            bucket.set(
                cmd.input.Key!,
                await buffer(cmd.input.Body as Readable),
            );
            return {};
        }
        if (cmd instanceof GetObjectCommand) {
            return { Body: Readable.from([bucket.get(cmd.input.Key!)!]) };
        }
        if (cmd instanceof DeleteObjectCommand) {
            bucket.delete(cmd.input.Key!);
            return {};
        }
        throw new Error('unexpected command');
    }),
};

describe('R2 storage driver (e2e)', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let token: string;
    let ownerToken: string;
    let folderId: string;

    const http = () => request(app.getHttpServer());
    const upload = () =>
        http()
            .post(`/api/v1/folders/${folderId}/versions`)
            .auth(token, { type: 'bearer' })
            .attach('file', PDF, 'draft.pdf');
    const download = (id: string) =>
        http()
            .get(`/api/v1/versions/${id}/download`)
            .auth(ownerToken, { type: 'bearer' })
            .buffer(true)
            .parse((res, cb) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => cb(null, Buffer.concat(chunks)));
            });

    beforeAll(async () => {
        // StorageService as the app builds it with STORAGE_DRIVER=r2 and the
        // R2 variables set; the client sends to the in-memory bucket
        jest.spyOn(S3Client.prototype, 'send').mockImplementation(
            r2.send as never,
        );
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideProvider(StorageService)
            .useFactory({
                inject: [ConfigService],
                factory: (config: ConfigService<Env, true>) =>
                    new StorageService({
                        get: (k: keyof Env) =>
                            k in R2_ENV
                                ? R2_ENV[k as keyof typeof R2_ENV]
                                : config.get(k, { infer: true }),
                    } as ConfigService<Env, true>),
            })
            .compile();
        app = moduleRef.createNestApplication();
        setupApp(app);
        await app.init();
        prisma = app.get(PrismaService);
    });

    beforeEach(async () => {
        await resetState(app);
        rmSync(join(UPLOADS, 'projects'), { recursive: true, force: true });
        bucket.clear();
        r2.send.mockClear();
        const p = await seedPeople(app);
        token = p.tokens.s1;
        ownerToken = p.tokens.owner;
        const project = await createProject(prisma, p.owner.id);
        await addMember(prisma, project.id, p.studentS1.id);
        folderId = (
            await prisma.submissionFolder.create({
                data: {
                    projectId: project.id,
                    createdBy: p.studentS1.id,
                    title: 'Bab 1',
                },
            })
        ).id;
    });

    afterAll(async () => {
        await resetState(app);
        await app.close();
    });

    it('uploads to the bucket and streams the file back', async () => {
        const res = await upload();
        expect(res.status).toBe(201);
        const { id } = dataOf<{ id: string }>(res);

        const row = await prisma.submissionVersion.findUniqueOrThrow({
            where: { id },
        });
        expect(row.storageDriver).toBe('r2');
        expect(bucket.get(row.storedKey)).toEqual(PDF);
        // nothing on the local disk, tmp file gone
        expect(existsSync(join(UPLOADS, 'projects'))).toBe(false);
        expect(existsSync(TMP) ? readdirSync(TMP) : []).toEqual([]);

        const file = await download(id);
        expect(file.status).toBe(200);
        expect(file.headers['content-type']).toBe('application/pdf');
        expect(file.body).toEqual(PDF);
    });

    it('still serves versions stored on the local disk before the switch', async () => {
        const key = `projects/old/${folderId}.pdf`;
        mkdirSync(join(UPLOADS, 'projects/old'), { recursive: true });
        writeFileSync(join(UPLOADS, key), PDF);
        const v = await prisma.submissionVersion.create({
            data: {
                folderId,
                versionNumber: 1,
                uploadedBy: (
                    await prisma.user.findFirstOrThrow({
                        where: { role: 'student' },
                    })
                ).id,
                originalName: 'old.pdf',
                storageDriver: 'local',
                storedKey: key,
                mimeType: 'application/pdf',
                sizeBytes: PDF.length,
            },
        });

        const file = await download(v.id);
        expect(file.status).toBe(200);
        expect(file.body).toEqual(PDF);
        expect(r2.send).not.toHaveBeenCalled();
    });

    it('removes the object when the version cannot be saved', async () => {
        // the folder is deleted while the file is uploading
        jest.spyOn(
            app.get(SubmissionRepository),
            'createVersion',
        ).mockResolvedValueOnce(null);

        const res = await upload();
        expect(res.status).toBe(404);
        expect(r2.send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
        expect(bucket.size).toBe(0);
    });
});
