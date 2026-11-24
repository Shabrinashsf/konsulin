import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import type { Env } from '../../config/env.schema';
import { ProjectModule } from '../project/project.module';
import { FolderController } from './folder.controller';
import { FolderService } from './folder.service';
import { r2ClientProvider, StorageService } from './storage.service';
import { SubmissionRepository } from './submission.repository';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';

@Module({
    imports: [
        ProjectModule,
        // disk storage in UPLOAD_TMP_DIR; over the limit -> 413
        MulterModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                dest: config.get('UPLOAD_TMP_DIR', { infer: true }),
                limits: {
                    fileSize:
                        config.get('MAX_UPLOAD_MB', { infer: true }) *
                        1024 *
                        1024,
                    files: 1,
                },
                // multer decodes file names as latin1 by default
                defParamCharset: 'utf8',
            }),
        }),
    ],
    controllers: [FolderController, VersionController],
    providers: [
        SubmissionRepository,
        FolderService,
        VersionService,
        StorageService,
        r2ClientProvider,
    ],
    // folder access is reused by the feedback module
    exports: [FolderService],
})
export class SubmissionModule {}
