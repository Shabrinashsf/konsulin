import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { paginate } from '../../shared/http/pagination-query.dto';
import { degreeOf, withDegree } from '../identity/degree';
import { InvitationQueryDto } from './dto/invitation-query.dto';
import {
    INVITATION_CREATED,
    InvitationCreatedEvent,
} from './invitation-created.event';
import {
    invitationExpiresAt,
    transitionError,
    viewStatus,
} from './invitation-state';
import {
    type InvitationRow,
    InvitationRepository,
} from './invitation.repository';
import { ProjectAccessService } from './project-access.service';
import { canJoin, PROJECT_TYPE_RULES } from './project-type-rules';
import { ProjectRepository } from './project.repository';

// change raw database response to a response form that can be send to client
const toInvitationView = (inv: InvitationRow, now: Date) => ({
    ...inv,
    status: viewStatus(inv, now),
    student: {
        ...inv.student,
        studyProgram: withDegree(inv.student.studyProgram),
    },
    project: {
        ...inv.project,
        typeLabel: PROJECT_TYPE_RULES[inv.project.type].label,
    },
});

const conflict = (code: string, message: string) =>
    new ConflictException({ message, code });

const TRANSITION_MESSAGES = {
    INVITATION_EXPIRED: 'Undangan sudah kedaluwarsa',
    INVITATION_NOT_PENDING: 'Undangan sudah tidak berstatus pending',
} as const;

@Injectable()
export class InvitationService {
    constructor(
        private readonly invitations: InvitationRepository,
        private readonly projects: ProjectRepository,
        private readonly access: ProjectAccessService,
        private readonly events: EventEmitter2,
    ) {}

    async listForProject(
        projectId: string,
        lecturerId: string,
        q: InvitationQueryDto,
    ) {
        await this.access.getOwnedProject(projectId, lecturerId);
        return this.list({ projectId }, q);
    }

    async create(projectId: string, lecturerId: string, studentId: string) {
        // check access and take projcect
        const project = await this.access.getOwnedProject(
            projectId,
            lecturerId,
        );

        // check student and take student
        const student = await this.invitations.findStudent(studentId);
        if (!student) {
            throw new NotFoundException({
                message: 'Mahasiswa tidak ditemukan',
                code: 'STUDENT_NOT_FOUND',
            });
        }

        // check student degree and match it to project type
        const degree =
            student.studyProgram && degreeOf(student.studyProgram.name);
        if (!degree || !canJoin(project.type, degree)) {
            throw new BadRequestException({
                message: 'Jenjang mahasiswa tidak sesuai dengan tipe project',
                code: 'DEGREE_MISMATCH',
            });
        }

        // make sure student are not a member yet
        const now = new Date();
        if (await this.projects.isMember(projectId, studentId)) {
            throw conflict('ALREADY_MEMBER', 'Mahasiswa sudah menjadi anggota');
        }

        // make sure that student have 0 pending invitation
        if (
            (await this.invitations.countActivePending(
                { projectId, studentId },
                now,
            )) > 0
        ) {
            throw conflict(
                'INVITATION_ALREADY_PENDING',
                'Mahasiswa masih punya undangan pending di project ini',
            );
        }

        // create invitation
        const invitation = await this.invitations.create(
            projectId,
            studentId,
            now,
            invitationExpiresAt(now),
        );

        // make email event
        this.events.emit(
            INVITATION_CREATED,
            new InvitationCreatedEvent(
                invitation.id,
                { id: project.id, title: project.title },
                project.lecturer,
                { id: student.id, name: student.name, email: student.email },
                invitation.expiresAt,
            ),
        );
        return toInvitationView(invitation, now);
    }

    async revoke(projectId: string, lecturerId: string, invitationId: string) {
        // check access
        await this.access.getOwnedProject(projectId, lecturerId);
        const invitation = await this.findOne(invitationId, { projectId });
        return this.transition(invitation, 'revoked');
    }

    listMine(studentId: string, q: InvitationQueryDto) {
        return this.list({ studentId }, q);
    }

    async respond(
        invitationId: string,
        studentId: string,
        action: 'accept' | 'decline',
    ) {
        const invitation = await this.findOne(invitationId, { studentId });
        return this.transition(
            invitation,
            action === 'accept' ? 'accepted' : 'declined',
        );
    }

    private async list(
        scope: { projectId: string } | { studentId: string },
        q: InvitationQueryDto,
    ) {
        const now = new Date();
        const [rows, total] = await this.invitations.findPage(
            scope,
            q.status,
            now,
            q,
        );
        return paginate(
            rows.map((r) => toInvitationView(r, now)),
            total,
            q,
        );
    }

    private async findOne(
        id: string,
        scope: { projectId: string } | { studentId: string },
    ) {
        const invitation = await this.invitations.findOne(id, scope);
        if (!invitation) {
            throw new NotFoundException({
                message: 'Undangan tidak ditemukan',
                code: 'INVITATION_NOT_FOUND',
            });
        }
        return invitation;
    }

    // machine state: only pending that are not expired yet that can only changed
    private async transition(
        invitation: InvitationRow,
        status: 'accepted' | 'declined' | 'revoked',
    ) {
        const now = new Date();
        const error = transitionError(invitation, now);
        if (error) throw conflict(error, TRANSITION_MESSAGES[error]);

        const updated = await this.invitations.transition(
            invitation,
            status,
            now,
        );
        if (!updated) {
            throw conflict(
                'INVITATION_NOT_PENDING',
                TRANSITION_MESSAGES.INVITATION_NOT_PENDING,
            );
        }
        return toInvitationView(updated, now);
    }
}
