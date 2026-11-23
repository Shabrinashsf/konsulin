import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import {
    CANCEL_REASON,
    type CancelledRow,
    toCancelledEvent,
} from '../../shared/consultation/cancellation';
import { CONSULTATION_CANCELLED } from '../../shared/consultation/consultation-cancelled.event';
import { paginate } from '../../shared/http/pagination-query.dto';
import { formatDateOnly, parseDateOnly, toDate } from '../../shared/time/time';
import { withDegree } from '../identity/degree';
import { CreateProjectDto } from './dto/create-project.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { ProjectQueryDto } from './dto/project-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { InvitationRepository } from './invitation.repository';
import { ProjectAccessService } from './project-access.service';
import { PROJECT_TYPE_RULES, typesForDegree } from './project-type-rules';
import {
    type MemberRow,
    ProjectRepository,
    type ProjectRow,
} from './project.repository';
import {
    badRequest,
    conflict,
    notFound,
} from '../../shared/http/http-exception.filter';

// change raw database response to a response form that can be send to client
export const toProjectView = ({ _count, ...p }: ProjectRow) => ({
    ...p,
    ...PROJECT_TYPE_RULES[p.type],
    startDate: p.startDate && formatDateOnly(p.startDate),
    endDate: p.endDate && formatDateOnly(p.endDate),
    memberCount: _count.members,
});

// change raw database response to a response form that can be send to client
const toMemberView = ({ joinedAt, student }: MemberRow) => ({
    ...student,
    studyProgram: withDegree(student.studyProgram),
    joinedAt,
});

// make sure end date are not before start date
function assertDateRange(start: Date | null, end: Date | null) {
    if (start && end && end < start) {
        throw badRequest(
            'INVALID_DATE_RANGE',
            'Tanggal selesai tidak boleh sebelum tanggal mulai',
        );
    }
}

@Injectable()
export class ProjectService {
    constructor(
        private readonly projects: ProjectRepository,
        private readonly invitations: InvitationRepository,
        private readonly access: ProjectAccessService,
        private readonly events: EventEmitter2,
    ) {}

    async list(user: AuthUser, q: ProjectQueryDto) {
        const [rows, total] = await this.projects.findPage(
            user,
            {
                q: q.q,
                type: q.type,
                types: q.degree && typesForDegree(q.degree),
                startFrom: q.startFrom ? parseDateOnly(q.startFrom) : undefined,
                startTo: q.startTo ? parseDateOnly(q.startTo) : undefined,
            },
            q,
        );
        return paginate(rows.map(toProjectView), total, q);
    }

    async create(lecturerId: string, dto: CreateProjectDto) {
        const startDate = parseDateOnly(dto.startDate);
        const endDate = toDate(dto.endDate) ?? null;
        assertDateRange(startDate, endDate);
        const project = await this.projects.create(lecturerId, {
            title: dto.title,
            description: dto.description,
            type: dto.type,
            startDate,
            endDate,
        });
        return toProjectView(project);
    }

    async get(projectId: string, user: AuthUser) {
        // check access and take project
        const project = await this.access.getVisibleProject(projectId, user);

        // check the role of user for this project
        const isOwner = project.lecturer.id === user.id;

        return {
            ...toProjectView(project),
            summary: {
                memberCount: project._count.members,

                // only visible to Lecturer
                pendingInvitationCount: isOwner
                    ? await this.invitations.countActivePending({ projectId })
                    : null,
            },
        };
    }

    async update(projectId: string, lecturerId: string, dto: UpdateProjectDto) {
        // check access and take project
        const project = await this.access.getOwnedProject(
            projectId,
            lecturerId,
        );

        // prevent type project changes when there's already have a memeber or a pending invitation
        if (dto.type && dto.type !== project.type) {
            const locked =
                project._count.members > 0 ||
                (await this.invitations.countActivePending({ projectId })) > 0;
            if (locked) {
                throw conflict(
                    'PROJECT_TYPE_LOCKED',
                    'Tipe project tidak dapat diubah karena sudah ada anggota atau undangan pending',
                );
            }
            // folders were created for the current track mode
            const trackChanges =
                PROJECT_TYPE_RULES[dto.type].trackMode !==
                PROJECT_TYPE_RULES[project.type].trackMode;
            if (trackChanges && (await this.projects.hasFolders(projectId))) {
                throw conflict(
                    'PROJECT_TYPE_LOCKED',
                    'Tipe project tidak dapat diubah karena sudah ada folder submission',
                );
            }
        }

        // startDate is required; the DTO validation already rejects null values.
        const startDate =
            dto.startDate === undefined
                ? undefined
                : parseDateOnly(dto.startDate);
        const endDate = toDate(dto.endDate);
        assertDateRange(
            startDate ?? project.startDate,
            endDate === undefined ? project.endDate : endDate,
        );

        const updated = await this.projects.update(projectId, {
            title: dto.title,
            description: dto.description,
            type: dto.type,
            startDate,
            endDate,
        });
        return toProjectView(updated);
    }

    async remove(projectId: string, lecturerId: string) {
        // check access
        await this.access.getOwnedProject(projectId, lecturerId);
        const cancelled = await this.projects.softDelete(
            projectId,
            lecturerId,
            new Date(),
        );
        this.emitCancelled(cancelled, CANCEL_REASON.projectDeleted);
    }

    async listMembers(projectId: string, user: AuthUser, q: MemberQueryDto) {
        // check access
        await this.access.getVisibleProject(projectId, user);
        const [rows, total] = await this.projects.findMembersPage(
            projectId,
            q.q,
            q,
        );
        return paginate(rows.map(toMemberView), total, q);
    }

    async removeMember(
        projectId: string,
        lecturerId: string,
        studentId: string,
    ) {
        // check access
        await this.access.getOwnedProject(projectId, lecturerId);
        const cancelled = await this.projects.removeMember(
            projectId,
            lecturerId,
            studentId,
            new Date(),
        );
        if (!cancelled) {
            throw notFound(
                'MEMBER_NOT_FOUND',
                'Mahasiswa bukan anggota project ini',
            );
        }
        this.emitCancelled(cancelled, CANCEL_REASON.memberRemoved);
    }

    // email for consultations cancelled
    private emitCancelled(rows: CancelledRow[], reason: string) {
        for (const c of rows) {
            this.events.emit(
                CONSULTATION_CANCELLED,
                toCancelledEvent(c, reason, 'lecturer'),
            );
        }
    }
}
