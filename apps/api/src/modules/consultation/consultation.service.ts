import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../../shared/auth/auth.decorators';
import { toCancelledEvent } from '../../shared/consultation/cancellation';
import { CONSULTATION_CANCELLED } from '../../shared/consultation/consultation-cancelled.event';
import { paginate } from '../../shared/http/pagination-query.dto';
import { formatDateOnly } from '../../shared/time/time';
import { ProjectAccessService } from '../project/project-access.service';
import {
    PROJECT_TYPE_RULES,
    PROJECT_TYPES,
} from '../project/project-type-rules';
import { calculateAvailableDays } from '../schedule/available-days';
import { CONSULTATION_EVENTS, ConsultationEvent } from './consultation-events';
import {
    acceptError,
    cancelError,
    completeError,
    type Party,
    proposeError,
    rejectError,
    rescheduleError,
    type StateError,
    type TimeError,
    timeError,
    turnOf,
    viewStatus,
} from './consultation-state';
import {
    type ConsultationRow,
    ConsultationRepository,
    filterWhere,
    type TimeData,
    type WriteResult,
} from './consultation.repository';
import { AcceptProposalDto } from './dto/accept-proposal.dto';
import { CancelConsultationDto } from './dto/cancel-consultation.dto';
import { CompleteConsultationDto } from './dto/complete-consultation.dto';
import { ConsultationQueryDto } from './dto/consultation-query.dto';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { LogbookQueryDto } from './dto/logbook-query.dto';
import { MyConsultationQueryDto } from './dto/my-consultation-query.dto';
import { ProposeTimeDto } from './dto/propose-time.dto';
import { RejectConsultationDto } from './dto/reject-consultation.dto';
import { RescheduleConsultationDto } from './dto/reschedule-consultation.dto';
import { ScheduleConsultationDto } from './dto/schedule-consultation.dto';

const SHARED_TYPES = PROJECT_TYPES.filter(
    (t) => PROJECT_TYPE_RULES[t].trackMode === 'shared',
);
const trackModeOf = (c: ConsultationRow) =>
    PROJECT_TYPE_RULES[c.project.type].trackMode;

// change raw database response to a response form that can be send to client
const toView = (c: ConsultationRow, now: Date) => ({
    id: c.id,
    status: viewStatus(c, now),
    turn: turnOf(c, now),
    proposedBy: c.proposedBy,
    mode: c.mode,
    topic: c.topic,
    agenda: c.agenda,
    note: c.note,
    requestedDate: formatDateOnly(c.requestedDate),
    startAt: c.startAt,
    endAt: c.endAt,
    location: c.location,
    statusReason: c.statusReason,
    summary: c.summary,
    project: {
        id: c.project.id,
        title: c.project.title,
        trackMode: trackModeOf(c),
    },
    lecturer: { id: c.lecturer.id, name: c.lecturer.name },
    student: { id: c.student.id, name: c.student.name, nrp: c.student.nrp },
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
});

const MESSAGES: Record<StateError | TimeError, string> = {
    INVALID_TRANSITION: 'Status bimbingan tidak mengizinkan aksi ini',
    CONSULTATION_EXPIRED: 'Pengajuan bimbingan sudah kedaluwarsa',
    NOT_YOUR_TURN: 'Bukan giliran Anda dalam negosiasi jam',
    NO_PROPOSAL: 'Belum ada usulan jam untuk diterima',
    PROPOSAL_EXPIRED: 'Usulan jam sudah lewat; usulkan jam baru',
    CONSULTATION_STARTED: 'Bimbingan sudah dimulai',
    CONSULTATION_NOT_STARTED: 'Bimbingan belum dimulai',
    INVALID_TIME_RANGE:
        'Durasi bimbingan 15 menit–4 jam, mulai dan selesai di tanggal yang sama',
    OUTSIDE_BOOKING_WINDOW:
        'Waktu bimbingan minimal 1 jam dari sekarang dan maksimal 60 hari ke depan',
};

const conflict = (code: StateError) =>
    new ConflictException({ message: MESSAGES[code], code });
const badRequest = (code: string, message: string) =>
    new BadRequestException({ message, code });
const notFound = () =>
    new NotFoundException({
        message: 'Bimbingan tidak ditemukan',
        code: 'CONSULTATION_NOT_FOUND',
    });

@Injectable()
export class ConsultationService {
    constructor(
        private readonly consultations: ConsultationRepository,
        private readonly access: ProjectAccessService,
        private readonly events: EventEmitter2,
    ) {}

    // ---- reads ----
    async listMine(user: AuthUser, q: MyConsultationQueryDto) {
        const now = new Date();
        const scope: Prisma.ConsultationWhereInput =
            user.role === 'lecturer'
                ? { lecturerId: user.id }
                : {
                      // only projects the student is still in -> own consultations + team meetings of shared projects
                      project: { members: { some: { studentId: user.id } } },
                      OR: [
                          { studentId: user.id },
                          { project: { type: { in: SHARED_TYPES } } },
                      ],
                  };
        return this.page(
            {
                AND: [
                    scope,
                    q.projectId ? { projectId: q.projectId } : {},
                    ...filterWhere(q, now),
                ],
            },
            { sortAt: q.order },
            q,
            now,
        );
    }

    async listForProject(
        projectId: string,
        user: AuthUser,
        q: ConsultationQueryDto,
    ) {
        const now = new Date();
        const scope = await this.projectScope(projectId, user);
        return this.page(
            {
                AND: [
                    scope,
                    q.studentId ? { studentId: q.studentId } : {},
                    ...filterWhere({ ...q, topic: q.q }, now),
                ],
            },
            q.sort === 'date' ? { sortAt: q.order } : { createdAt: q.order },
            q,
            now,
        );
    }

    async logbook(projectId: string, user: AuthUser, q: LogbookQueryDto) {
        const now = new Date();
        const scope = await this.projectScope(projectId, user);
        return this.page(
            {
                AND: [
                    scope,
                    { status: 'completed' },
                    q.studentId ? { studentId: q.studentId } : {},
                    ...filterWhere({ ...q, topicOrSummary: q.q }, now),
                ],
            },
            { sortAt: 'desc' },
            q,
            now,
        );
    }

    async get(id: string, user: AuthUser) {
        return toView(await this.readable(id, user), new Date());
    }

    // ---- student request ----

    async create(
        projectId: string,
        user: AuthUser,
        dto: CreateConsultationDto,
    ) {
        const now = new Date();
        const project = await this.access.getVisibleProject(projectId, user);
        // today + 60 days (the blacklist is checked under the lock)
        const [day] = calculateAvailableDays({
            from: dto.requestedDate,
            to: dto.requestedDate,
            blackoutDates: [],
            now,
        });
        if (day.status !== 'available') throw this.dateNotAvailable();

        const result = await this.consultations.create(
            {
                projectId,
                lecturerId: project.lecturer.id,
                studentId: user.id,
                requestedDate: dto.requestedDate,
                topic: dto.topic,
                agenda: dto.agenda,
                mode: dto.mode,
                note: dto.note || null,
            },
            now,
        );
        if (result === 'PENDING_EXISTS') {
            throw new ConflictException({
                message:
                    'Masih ada pengajuan bimbingan yang menunggu di project ini',
                code: 'CONSULTATION_PENDING_EXISTS',
            });
        }
        if (result === 'DATE_BLACKLISTED') throw this.dateNotAvailable();
        return this.done(this.written(result), 'requested', 'student', now, {
            note: dto.note || null,
        });
    }

    // ---- negotiation ----

    async propose(id: string, user: AuthUser, dto: ProposeTimeDto) {
        const now = new Date();
        const c = await this.writable(id, user);
        const actor = user.role;
        if (actor === 'student' && (dto.location || dto.mode)) {
            throw this.lecturerOnly();
        }
        this.assertState(proposeError(c, actor, now));
        const time = this.time(dto.startAt, dto.endAt, now);

        // the lecturer's proposal must carry a location
        if (actor === 'lecturer' && !dto.location && !c.location) {
            throw this.locationRequired();
        }
        // a student's location/mode was rejected above; undefined is ignored
        const data: TimeData = {
            ...time,
            location: dto.location,
            mode: dto.mode,
        };
        const result = await this.consultations.propose(c, actor, data);
        return this.done(this.written(result), 'proposed', actor, now);
    }

    async accept(id: string, user: AuthUser, dto: AcceptProposalDto) {
        const now = new Date();
        const c = await this.writable(id, user);
        const actor = user.role;
        if (actor === 'student' && dto.location) throw this.lecturerOnly();
        this.assertState(acceptError(c, actor, now));
        const location = dto.location ?? c.location;
        if (!location) throw this.locationRequired();
        const result = await this.consultations.accept(c, location);
        return this.done(this.written(result), 'approved', actor, now);
    }

    async reject(id: string, user: AuthUser, dto: RejectConsultationDto) {
        const now = new Date();
        const c = await this.writable(id, user);
        this.assertState(rejectError(c, now));
        const result = await this.consultations.reject(c, dto.reason);
        return this.done(this.written(result), 'rejected', 'lecturer', now, {
            reason: dto.reason,
        });
    }

    // ---- lecturer scheduling ----

    async schedule(
        projectId: string,
        user: AuthUser,
        dto: ScheduleConsultationDto,
    ) {
        const now = new Date();
        await this.access.getOwnedProject(projectId, user.id);
        if (!(await this.consultations.isMember(projectId, dto.studentId))) {
            throw badRequest(
                'STUDENT_NOT_MEMBER',
                'Mahasiswa bukan anggota project ini',
            );
        }
        const time = this.time(dto.startAt, dto.endAt, now);
        const result = await this.consultations.schedule({
            projectId,
            lecturerId: user.id,
            studentId: dto.studentId,
            topic: dto.topic,
            agenda: dto.agenda,
            mode: dto.mode,
            location: dto.location,
            ...time,
        });
        return this.done(this.written(result), 'scheduled', 'lecturer', now);
    }

    async reschedule(
        id: string,
        user: AuthUser,
        dto: RescheduleConsultationDto,
    ) {
        const now = new Date();
        const c = await this.writable(id, user);
        this.assertState(rescheduleError(c));
        const data: TimeData = {
            ...this.time(dto.startAt, dto.endAt, now),
            location: dto.location,
            mode: dto.mode,
        };
        const result = await this.consultations.reschedule(c, data);
        return this.done(this.written(result), 'rescheduled', 'lecturer', now, {
            previousStartAt: c.startAt,
            previousEndAt: c.endAt,
        });
    }

    async cancel(id: string, user: AuthUser, dto: CancelConsultationDto) {
        const now = new Date();
        const c = await this.writable(id, user);
        this.assertState(cancelError(c, now));
        const reason = dto.reason || null;
        const row = await this.consultations.cancel(id, reason, now);
        if (!row) throw conflict('INVALID_TRANSITION');
        this.events.emit(
            CONSULTATION_CANCELLED,
            toCancelledEvent(row, reason, user.role),
        );
        return toView((await this.consultations.findById(id))!, now);
    }

    async complete(id: string, user: AuthUser, dto: CompleteConsultationDto) {
        const now = new Date();
        const c = await this.writable(id, user);
        this.assertState(completeError(c, now));
        const result = await this.consultations.complete(c, dto.summary, now);
        return toView(this.written(result), now);
    }

    // ---- access ----

    // Lecturer: own projects. Student: current member; individual = own only
    private async readable(id: string, user: AuthUser) {
        const c = await this.consultations.findById(id);
        if (!c) throw notFound();
        if (user.role === 'lecturer') {
            if (c.lecturerId !== user.id) throw notFound();
            return c;
        }
        if (!(await this.consultations.isMember(c.projectId, user.id))) {
            throw notFound();
        }
        if (trackModeOf(c) === 'individual' && c.studentId !== user.id) {
            throw notFound();
        }
        return c;
    }

    // write actions follow ownership -> a shared-project member sees but cannot act
    private async writable(id: string, user: AuthUser) {
        const c = await this.readable(id, user);
        if (user.role === 'student' && c.studentId !== user.id) {
            throw new ForbiddenException({
                message:
                    'Hanya mahasiswa pengaju yang dapat melakukan aksi ini',
                code: 'NOT_CONSULTATION_OWNER',
            });
        }
        return c;
    }

    private async projectScope(
        projectId: string,
        user: AuthUser,
    ): Promise<Prisma.ConsultationWhereInput> {
        const project = await this.access.getVisibleProject(projectId, user);
        const individual =
            PROJECT_TYPE_RULES[project.type].trackMode === 'individual';
        return user.role === 'student' && individual
            ? { projectId, studentId: user.id }
            : { projectId };
    }

    // ---- helpers ----

    private async page(
        where: Prisma.ConsultationWhereInput,
        orderBy: Prisma.ConsultationOrderByWithRelationInput,
        q: { skip: number; limit: number; order: 'asc' | 'desc'; page: number },
        now: Date,
    ) {
        const [rows, total] = await this.consultations.findPage(
            where,
            orderBy,
            q,
        );
        return paginate(
            rows.map((r) => toView(r, now)),
            total,
            q,
        );
    }

    private time(start: string, end: string, now: Date) {
        const startAt = new Date(start);
        const endAt = new Date(end);
        const error = timeError(startAt, endAt, now);
        if (error) throw badRequest(error, MESSAGES[error]);
        return { startAt, endAt };
    }

    private assertState(error: StateError | null) {
        if (error) throw conflict(error);
    }

    // maps a repository write result to the row or an HTTP error
    private written(result: WriteResult): ConsultationRow {
        if (result === 'DATE_BLACKLISTED') {
            throw badRequest(
                'DATE_BLACKLISTED',
                'Dosen berhalangan pada tanggal tersebut',
            );
        }
        if (result === 'OVERLAP') {
            throw new ConflictException({
                message: 'Jadwal bentrok dengan bimbingan lain',
                code: 'CONSULTATION_OVERLAP',
            });
        }
        if (result === 'STALE' || result === 'PENDING_EXISTS') {
            throw conflict('INVALID_TRANSITION');
        }
        return result;
    }

    private done(
        c: ConsultationRow,
        event: keyof typeof CONSULTATION_EVENTS,
        actor: Party,
        now: Date,
        extra: ConsultationEvent['extra'] = {},
    ) {
        this.events.emit(
            CONSULTATION_EVENTS[event],
            new ConsultationEvent(
                c.id,
                actor,
                { ...c.project, trackMode: trackModeOf(c) },
                c.lecturer,
                c.student,
                c.topic,
                c.mode,
                formatDateOnly(c.requestedDate),
                c.startAt,
                c.endAt,
                c.location,
                c.icsSequence,
                extra,
            ),
        );
        return toView(c, now);
    }

    private dateNotAvailable() {
        return badRequest(
            'DATE_NOT_AVAILABLE',
            'Tanggal tidak tersedia (lampau, lebih dari 60 hari, atau dosen berhalangan)',
        );
    }

    private lecturerOnly() {
        return badRequest(
            'FIELD_NOT_ALLOWED',
            'Lokasi dan mode hanya dapat ditentukan dosen',
        );
    }

    private locationRequired() {
        return badRequest(
            'LOCATION_REQUIRED',
            'Lokasi bimbingan wajib diisi dosen',
        );
    }
}
