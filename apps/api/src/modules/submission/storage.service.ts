import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Env } from '../../config/env.schema';
import type { StorageDriver } from '../../generated/prisma/client';

// local disk only; the R2 adapter is an optional // TODO
@Injectable()
export class StorageService {
    readonly driver: StorageDriver = 'local';
    private readonly root: string;

    constructor(config: ConfigService<Env, true>) {
        this.root = resolve(config.get('UPLOAD_DIR', { infer: true }));
    }

    // moves the multer tmp file (UPLOAD_TMP_DIR must be on the same disk)
    async put(key: string, tmpPath: string) {
        const dest = this.pathOf(key);
        await mkdir(dirname(dest), { recursive: true });
        await rename(tmpPath, dest);
    }

    async open(driver: StorageDriver, key: string) {
        this.assertLocal(driver);
        const file = await open(this.pathOf(key));
        return file.createReadStream();
    }

    async delete(driver: StorageDriver, key: string) {
        this.assertLocal(driver);
        await rm(this.pathOf(key), { force: true });
    }

    private assertLocal(driver: StorageDriver) {
        if (driver !== 'local') {
            throw new ServiceUnavailableException({
                message: 'Storage R2 belum dikonfigurasi',
                code: 'STORAGE_UNAVAILABLE',
            });
        }
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
