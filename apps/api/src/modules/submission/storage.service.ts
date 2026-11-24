import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { Env } from '../../config/env.schema';
import type { StorageDriver } from '../../generated/prisma/client';
import { apiError } from '../../shared/http/errors';

// Cloudflare R2 speaks the S3 API; null when the R2 credentials are not set
export const R2_CLIENT = Symbol('R2_CLIENT');

export const r2ClientProvider: Provider = {
    provide: R2_CLIENT,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>) => {
        const get = <K extends keyof Env>(k: K) =>
            config.get(k, { infer: true });
        const account = get('R2_ACCOUNT_ID');
        const accessKeyId = get('R2_ACCESS_KEY_ID');
        const secretAccessKey = get('R2_SECRET_ACCESS_KEY');
        if (!account || !accessKeyId || !secretAccessKey || !get('R2_BUCKET'))
            return null;
        return new S3Client({
            region: 'auto',
            endpoint: `https://${account}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
        });
    },
};

// New uploads go to STORAGE_DRIVER; reads and deletes use the driver recorded
// on each version, so switching the driver never strands older files.
@Injectable()
export class StorageService {
    readonly driver: StorageDriver;
    private readonly root: string;
    private readonly bucket?: string;

    constructor(
        config: ConfigService<Env, true>,
        @Inject(R2_CLIENT) private readonly r2Client: S3Client | null,
    ) {
        this.driver = config.get('STORAGE_DRIVER', { infer: true });
        this.root = resolve(config.get('UPLOAD_DIR', { infer: true }));
        this.bucket = config.get('R2_BUCKET', { infer: true });
    }

    // stores the multer tmp file under `key` with the active driver
    async put(
        key: string,
        tmpPath: string,
        meta: { contentType: string; size: number },
    ) {
        if (this.driver === 'local') {
            // a rename: UPLOAD_TMP_DIR must be on the same disk
            const dest = this.pathOf(key);
            await mkdir(dirname(dest), { recursive: true });
            await rename(tmpPath, dest);
            return;
        }
        // the tmp file itself is removed by RemoveTmpFile
        await this.r2().send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: createReadStream(tmpPath),
                ContentLength: meta.size,
                ContentType: meta.contentType,
            }),
        );
    }

    async open(driver: StorageDriver, key: string): Promise<Readable> {
        if (driver === 'local') {
            const file = await open(this.pathOf(key));
            return file.createReadStream();
        }
        const res = await this.r2().send(
            new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        return res.Body as Readable;
    }

    async delete(driver: StorageDriver, key: string) {
        if (driver === 'local') {
            await rm(this.pathOf(key), { force: true });
            return;
        }
        await this.r2().send(
            new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        );
    }

    private r2() {
        if (!this.r2Client) {
            throw apiError('STORAGE_UNAVAILABLE');
        }
        return this.r2Client;
    }

    // keys are generated, but never let one escape UPLOAD_DIR
    private pathOf(key: string) {
        const path = resolve(this.root, key);
        if (!path.startsWith(this.root + sep)) {
            throw new Error(`Storage key outside UPLOAD_DIR: ${key}`);
        }
        return path;
    }
}
