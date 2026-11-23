import { Injectable } from '@nestjs/common';
import type { ProjectType } from '../../generated/prisma/client';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import {
    badRequest,
    conflict,
    forbidden,
    notFound,
} from '../../shared/http/http-exception.filter';
import { paginate } from '../../shared/http/pagination-query.dto';
import { toDate } from '../../shared/time/time';
import { ProjectAccessService } from '../project/project-access.service';
import { isIndividual } from '../project/project-type-rules';
import { CreateFolderDto } from './dto/create-folder.dto';
import { FolderQueryDto } from './dto/folder-query.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { type FolderRow, SubmissionRepository } from './submission.repository';
import { toFolderView, toVersionView } from './views';

export const folderNotFound = () =>
    notFound('FOLDER_NOT_FOUND', 'Folder tidak ditemukan');

@Injectable()
export class FolderService {
    constructor(
        private readonly submissions: SubmissionRepository,
        private readonly access: ProjectAccessService,
    ) {}

    async list(projectId: string, user: AuthUser, q: FolderQueryDto) {
        // check if user are eligible to see data, then take project
        const project = await this.access.getVisibleProject(projectId, user);
        const now = new Date();

        // on individual projects a student only sees their own track
        const own = user.role === 'student' && isIndividual(project.type);
        const [rows, total] = await this.submissions.findFolderPage(
            { ...q, projectId, ownerId: own ? user.id : undefined },
            q,
            now,
        );
        return paginate(
            rows.map((f) => toFolderView(f, now)),
            total,
            q,
        );
    }

    async create(projectId: string, user: AuthUser, dto: CreateFolderDto) {
        // check if user are eligible to see data, then take project
        const project = await this.access.getVisibleProject(projectId, user);
        const now = new Date();
        if (
            user.role === 'student' &&
            (dto.studentId !== undefined || dto.deadlineAt !== undefined)
        ) {
            throw this.lecturerOnly();
        }
        this.assertDeadline(dto.deadlineAt, now);
        const row = await this.submissions.createFolder({
            projectId,
            studentId: await this.trackOwner(project, user, dto.studentId),
            createdBy: user.id,
            title: dto.title,
            description: dto.description || null,
            deadlineAt: toDate(dto.deadlineAt) ?? null,
        });
        return toFolderView(row, now);
    }

    async get(id: string, user: AuthUser) {
        const folder = await this.readable(id, user);
        const [[latest]] = await this.submissions.findVersionPage(id, {
            skip: 0,
            limit: 1,
            order: 'desc',
        });
        return {
            ...toFolderView(folder, new Date()),
            latestVersion: latest
                ? toVersionView(latest, folder.deadlineAt)
                : null,
        };
    }

    async update(id: string, user: AuthUser, dto: UpdateFolderDto) {
        await this.writable(id, user);
        const now = new Date();
        if (user.role === 'student' && dto.deadlineAt !== undefined) {
            throw this.lecturerOnly();
        }
        this.assertDeadline(dto.deadlineAt, now);
        const row = await this.submissions.updateFolder(id, {
            title: dto.title,
            description:
                dto.description === undefined
                    ? undefined
                    : dto.description || null,
            deadlineAt: toDate(dto.deadlineAt),
        });
        return toFolderView(row, now);
    }

    // soft delete; students cannot delete a folder with versions (BR-23)
    async remove(id: string, user: AuthUser) {
        await this.writable(id, user);
        const result = await this.submissions.softDeleteFolder(
            id,
            user.role === 'student',
            new Date(),
        );
        if (result === 'GONE') throw folderNotFound();
        if (result === 'HAS_VERSIONS') {
            throw conflict(
                'FOLDER_HAS_VERSIONS',
                'Folder yang sudah memiliki versi tidak dapat dihapus oleh mahasiswa',
            );
        }
    }

    // ---- access: not visible -> 404 ----

    async readable(id: string, user: AuthUser) {
        const folder = await this.submissions.findFolder(id);
        if (!folder || !(await this.canRead(folder, user)))
            throw folderNotFound();
        return folder;
    }

    // a removed student loses access; the lecturer keeps the history
    async canRead(folder: FolderRow, user: AuthUser) {
        if (user.role === 'lecturer') {
            return folder.project.lecturer.id === user.id;
        }
        if (isIndividual(folder.project.type) && folder.studentId !== user.id) {
            return false;
        }
        return this.submissions.isMember(folder.projectId, user.id);
    }

    // lecturer owner: any folder; student: only folders they created
    private async writable(id: string, user: AuthUser) {
        const folder = await this.readable(id, user);
        if (user.role === 'student' && folder.createdBy !== user.id) {
            throw forbidden(
                'NOT_FOLDER_CREATOR',
                'Hanya pembuat folder yang dapat melakukan aksi ini',
            );
        }
        return folder;
    }

    // who owns the track of a new folder
    private async trackOwner(
        project: { id: string; type: ProjectType },
        user: AuthUser,
        studentId: string | undefined,
    ) {
        if (!isIndividual(project.type)) {
            if (studentId) {
                throw badRequest(
                    'STUDENT_NOT_ALLOWED',
                    'Folder project shared tidak dimiliki satu mahasiswa',
                );
            }
            return null;
        }
        if (user.role === 'student') return user.id;
        if (!studentId) {
            throw badRequest(
                'STUDENT_REQUIRED',
                'studentId wajib diisi untuk project individual',
            );
        }
        if (!(await this.submissions.isMember(project.id, studentId))) {
            throw badRequest(
                'STUDENT_NOT_MEMBER',
                'Mahasiswa bukan anggota project ini',
            );
        }
        return studentId;
    }

    private assertDeadline(value: string | null | undefined, now: Date) {
        if (value && new Date(value) <= now) {
            throw badRequest(
                'DEADLINE_IN_PAST',
                'Deadline harus di masa depan',
            );
        }
    }

    private lecturerOnly() {
        return forbidden(
            'LECTURER_ONLY',
            'Hanya dosen yang dapat menentukan pemilik track dan deadline',
        );
    }
}
