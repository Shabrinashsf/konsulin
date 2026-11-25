import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import type { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import type { Env } from '../../config/env.schema';
import { StorageService } from './storage.service';

const dir = mkdtempSync(join(tmpdir(), 'storage-spec-'));

const config = (env: Partial<Env>) =>
    ({ get: (k: keyof Env) => env[k] }) as unknown as ConfigService<Env, true>;

const tmpFile = (content: string) => {
    const path = join(dir, `tmp-${Math.random()}`);
    writeFileSync(path, content);
    return path;
};

const R2 = {
    STORAGE_DRIVER: 'r2',
    UPLOAD_DIR: dir,
    R2_ACCOUNT_ID: 'acc',
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'konsulin',
} as const;

afterEach(() => jest.restoreAllMocks());

// an in-memory bucket in place of S3Client.send, recording what it was sent
function fakeR2() {
    const objects = new Map<string, string>();
    const sent: unknown[] = [];
    const send = jest.fn(async (cmd: unknown) => {
        sent.push(cmd);
        if (cmd instanceof PutObjectCommand) {
            objects.set(cmd.input.Key!, await text(cmd.input.Body as Readable));
            return {};
        }
        if (cmd instanceof GetObjectCommand) {
            return { Body: Readable.from([objects.get(cmd.input.Key!)!]) };
        }
        if (cmd instanceof DeleteObjectCommand) {
            objects.delete(cmd.input.Key!);
            return {};
        }
        throw new Error('unexpected command');
    });
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(send as never);
    return { objects, sent };
}

const meta = { contentType: 'application/pdf', size: 4 };

describe('StorageService', () => {
    it('local: moves the tmp file, streams it back, deletes it', async () => {
        const s = new StorageService(
            config({ STORAGE_DRIVER: 'local', UPLOAD_DIR: dir }),
        );
        await s.put('projects/p/f/a.pdf', tmpFile('%PDF'), meta);
        expect(readFileSync(join(dir, 'projects/p/f/a.pdf'), 'utf8')).toBe(
            '%PDF',
        );
        expect(await text(await s.open('local', 'projects/p/f/a.pdf'))).toBe(
            '%PDF',
        );
        await s.delete('local', 'projects/p/f/a.pdf');
        expect(existsSync(join(dir, 'projects/p/f/a.pdf'))).toBe(false);
    });

    it('local: refuses keys that escape UPLOAD_DIR', async () => {
        const s = new StorageService(
            config({ STORAGE_DRIVER: 'local', UPLOAD_DIR: dir }),
        );
        await expect(s.open('local', '../etc/passwd')).rejects.toThrow(
            'outside UPLOAD_DIR',
        );
    });

    it('r2: puts, gets and deletes in the bucket with size and type', async () => {
        const r2 = fakeR2();
        const s = new StorageService(config(R2));
        expect(s.driver).toBe('r2');
        await s.put('projects/p/f/b.pdf', tmpFile('%PDF'), meta);
        expect((r2.sent[0] as PutObjectCommand).input).toMatchObject({
            Bucket: 'konsulin',
            Key: 'projects/p/f/b.pdf',
            ContentLength: 4,
            ContentType: 'application/pdf',
        });
        expect(r2.objects.get('projects/p/f/b.pdf')).toBe('%PDF');
        // nothing written to the local disk
        expect(existsSync(join(dir, 'projects/p/f/b.pdf'))).toBe(false);

        expect(await text(await s.open('r2', 'projects/p/f/b.pdf'))).toBe(
            '%PDF',
        );
        await s.delete('r2', 'projects/p/f/b.pdf');
        expect(r2.objects.has('projects/p/f/b.pdf')).toBe(false);
    });

    it('reads each version with its own driver after a switch', async () => {
        const r2 = fakeR2();
        const s = new StorageService(config(R2));
        writeFileSync(join(dir, 'old.pdf'), 'old');
        expect(await text(await s.open('local', 'old.pdf'))).toBe('old');
        expect(r2.sent).toHaveLength(0);
    });

    it('r2 with an R2 variable missing: no client, 503 STORAGE_UNAVAILABLE', async () => {
        const s = new StorageService(config({ ...R2, R2_BUCKET: undefined }));
        for (const call of [s.open('r2', 'x.pdf'), s.delete('r2', 'x.pdf')]) {
            const e = (await call.catch(
                (err: unknown) => err,
            )) as HttpException;
            expect(e.getStatus()).toBe(503);
            expect(e.getResponse()).toMatchObject({
                code: 'STORAGE_UNAVAILABLE',
            });
        }
    });

    it('r2: the client points at the account endpoint', async () => {
        const client = new StorageService(config(R2))['r2Client']!;
        const endpoint = await client.config.endpoint!();
        expect(endpoint.hostname).toBe('acc.r2.cloudflarestorage.com');
    });
});
