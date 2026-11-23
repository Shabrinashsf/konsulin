import { Injectable, StreamableFile } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import { badRequest, notFound } from '../../shared/http/http-exception.filter';
import {
    paginate,
    PaginationQueryDto,
} from '../../shared/http/pagination-query.dto';
import { UploadVersionDto } from './dto/upload-version.dto';
import { detectFileType } from './file-signature';
import { folderNotFound, FolderService } from './folder.service';
import { StorageService } from './storage.service';
import {
    SUBMISSION_UPLOADED,
    SubmissionUploadedEvent,
} from './submission-events';
import { SubmissionRepository } from './submission.repository';
import { toVersionView } from './views';

// submission_versions.original_name
const MAX_NAME = 255;

// long names are cut, keeping the extension
const fitName = (name: string) => {
    if (name.length <= MAX_NAME) return name;
    const ext = extname(name);
    return name.slice(0, MAX_NAME - ext.length) + ext;
};

// RFC 5987 filename*, which encodeURIComponent nearly is
const contentDisposition = (name: string) =>
    `attachment; filename*=UTF-8''${encodeURIComponent(name).replace(
        /['()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    )}`;

@Injectable()
export class VersionService {
    constructor(
        private readonly submissions: SubmissionRepository,
        private readonly folders: FolderService,
        private readonly storage: StorageService,
        private readonly events: EventEmitter2,
    ) {}

    async list(folderId: string, user: AuthUser, q: PaginationQueryDto) {
        const folder = await this.folders.readable(folderId, user);
        const [rows, total] = await this.submissions.findVersionPage(
            folderId,
            q,
        );
        return paginate(
            rows.map((v) => toVersionView(v, folder.deadlineAt)),
            total,
            q,
        );
    }

    // the tmp file is removed by RemoveTmpFile whatever happens here
    async upload(
        folderId: string,
        user: AuthUser,
        file: Express.Multer.File | undefined,
        dto: UploadVersionDto,
    ) {
        const folder = await this.folders.readable(folderId, user);
        if (!file) throw badRequest('FILE_REQUIRED', 'File wajib diunggah');
        const type = await detectFileType(file.path, file.originalname);
        if (!type) {
            throw badRequest(
                'INVALID_FILE_TYPE',
                'File harus PDF, DOCX, atau ZIP dan isinya sesuai ekstensi',
            );
        }

        const driver = this.storage.driver;
        const key = `projects/${folder.projectId}/folders/${folder.id}/${randomUUID()}${type.ext}`;
        await this.storage.put(key, file.path);
        const removeStored = () => this.storage.delete(driver, key);
        const row = await this.submissions
            .createVersion({
                folderId,
                uploadedBy: user.id,
                note: dto.note || null,
                originalName: fitName(file.originalname),
                storageDriver: driver,
                storedKey: key,
                mimeType: type.mime,
                sizeBytes: file.size,
            })
            .catch(async (e: unknown) => {
                await removeStored();
                throw e;
            });
        // the folder was deleted while the file was uploading
        if (!row) {
            await removeStored();
            throw folderNotFound();
        }

        const { lecturer, title: projectTitle } = folder.project;
        this.events.emit(
            SUBMISSION_UPLOADED,
            new SubmissionUploadedEvent(
                row.id,
                row.versionNumber,
                row.note,
                { id: folder.id, title: folder.title },
                { id: folder.projectId, title: projectTitle },
                lecturer,
                row.uploader,
            ),
        );
        return toVersionView(row, folder.deadlineAt);
    }

    async download(id: string, user: AuthUser) {
        const v = await this.submissions.findVersion(id);
        if (!v || !(await this.folders.canRead(v.folder, user))) {
            throw notFound('VERSION_NOT_FOUND', 'Versi tidak ditemukan');
        }
        const stream = await this.storage.open(v.storageDriver, v.storedKey);
        return new StreamableFile(stream, {
            type: v.mimeType,
            disposition: contentDisposition(v.originalName),
            length: Number(v.sizeBytes),
        });
    }
}
