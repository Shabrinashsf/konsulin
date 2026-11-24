import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import type { Env } from '../../config/env.schema';
import {
    CONSULTATION_CANCELLED,
    ConsultationCancelledEvent,
} from '../../shared/consultation/consultation-cancelled.event';
import {
    addDays,
    jakartaDateTime,
    toJakartaDate,
} from '../../shared/time/time';
import {
    CONSULTATION_EVENTS,
    ConsultationEvent,
} from '../consultation/consultation-events';
import {
    FEEDBACK_CREATED,
    FeedbackCreatedEvent,
} from '../feedback/feedback-events';
import {
    INVITATION_CREATED,
    InvitationCreatedEvent,
} from '../project/invitation-created.event';
import { isIndividual } from '../project/project-type-rules';
import {
    SUBMISSION_UPLOADED,
    SubmissionUploadedEvent,
} from '../submission/submission-events';
import { MailService } from './mail.service';
import { NotificationRepository } from './notification.repository';
import {
    type ConsultationExtra,
    type ConsultationInfo,
    type ConsultationKind,
    consultationMail,
    feedbackMail,
    invitationMail,
    uploadMail,
} from './templates';

const ASYNC = { async: true } as const;

// turns domain events into emails; runs after the request, so a failure here is logged and never reaches the user
@Injectable()
export class NotificationListener {
    private readonly logger = new Logger(NotificationListener.name);
    private readonly web: string;

    constructor(
        private readonly recipients: NotificationRepository,
        private readonly mail: MailService,
        config: ConfigService<Env, true>,
    ) {
        this.web = config.get('FRONTEND_ORIGIN', { infer: true });
    }

    // E1
    @OnEvent(INVITATION_CREATED, ASYNC)
    invitation(e: InvitationCreatedEvent) {
        return this.safely('E1', () =>
            this.mail.send(invitationMail(this.web, e)),
        );
    }

    // E2: the lecturer only
    @OnEvent(CONSULTATION_EVENTS.requested, ASYNC)
    requested(e: ConsultationEvent) {
        return this.safely('E2', () =>
            this.mail.send(
                consultationMail(this.web, 'requested', info(e), e.lecturer, {
                    note: e.extra.note,
                }),
            ),
        );
    }

    // E11: everyone but the proposer
    @OnEvent(CONSULTATION_EVENTS.proposed, ASYNC)
    proposed(e: ConsultationEvent) {
        return this.consultation('proposed', info(e), {
            exclude: actorOf(e),
            extra: { actorName: actorOf(e).name },
        });
    }

    // E3: everyone, with the calendar invite
    @OnEvent(CONSULTATION_EVENTS.approved, ASYNC)
    approved(e: ConsultationEvent) {
        return this.consultation('approved', info(e), {
            extra: { calendar: 'REQUEST' },
        });
    }

    // E4: everyone but the lecturer
    @OnEvent(CONSULTATION_EVENTS.rejected, ASYNC)
    rejected(e: ConsultationEvent) {
        return this.consultation('rejected', info(e), {
            exclude: e.lecturer,
            extra: { actorName: e.lecturer.name, reason: e.extra.reason },
        });
    }

    // E5
    @OnEvent(CONSULTATION_EVENTS.scheduled, ASYNC)
    scheduled(e: ConsultationEvent) {
        return this.consultation('scheduled', info(e), {
            extra: { actorName: e.lecturer.name, calendar: 'REQUEST' },
        });
    }

    // E6: same UID, sequence already bumped
    @OnEvent(CONSULTATION_EVENTS.rescheduled, ASYNC)
    rescheduled(e: ConsultationEvent) {
        return this.consultation('rescheduled', info(e), {
            extra: {
                actorName: e.lecturer.name,
                calendar: 'REQUEST',
                previousStartAt: e.extra.previousStartAt,
                previousEndAt: e.extra.previousEndAt,
            },
        });
    }

    // E7: everyone, the removed requester included; CANCEL only if it was in calendars
    @OnEvent(CONSULTATION_CANCELLED, ASYNC)
    cancelled(e: ConsultationCancelledEvent) {
        return this.consultation(
            'cancelled',
            { ...e, id: e.consultationId },
            {
                extra: {
                    actorName:
                        e.cancelledBy === 'lecturer'
                            ? e.lecturer.name
                            : e.student.name,
                    reason: e.reason,
                    calendar: e.wasApproved ? 'CANCEL' : undefined,
                },
            },
        );
    }

    // E8: 08.00 WIB, consultations starting tomorrow
    @Cron('0 8 * * *', {
        name: 'consultation-reminder',
        timeZone: 'Asia/Jakarta',
    })
    remind(now = new Date()) {
        return this.safely('E8', async () => {
            const tomorrow = addDays(toJakartaDate(now), 1);
            const due = await this.recipients.claimReminders(
                jakartaDateTime(tomorrow, '00:00'),
                jakartaDateTime(addDays(tomorrow, 1), '00:00'),
            );
            for (const c of due) {
                await this.consultation('reminder', c, { extra: {} });
            }
        });
    }

    // E9: the lecturer only
    @OnEvent(SUBMISSION_UPLOADED, ASYNC)
    uploaded(e: SubmissionUploadedEvent) {
        return this.safely('E9', () => this.mail.send(uploadMail(this.web, e)));
    }

    // E10: the track owner, or every active member on shared projects
    @OnEvent(FEEDBACK_CREATED, ASYNC)
    feedback(e: FeedbackCreatedEvent) {
        return this.safely('E10', async () => {
            const to = await this.recipients.members(
                e.project.id,
                isIndividual(e.project.type) ? e.folder.studentId : undefined,
            );
            for (const person of to) {
                await this.mail.send(feedbackMail(this.web, person, e));
            }
        });
    }

    private consultation(
        kind: ConsultationKind,
        c: ConsultationInfo,
        o: { exclude?: { id: string }; extra: ConsultationExtra },
    ) {
        return this.safely(kind, async () => {
            const people = await this.recipients.participants(c);
            for (const person of people) {
                if (person.id === o.exclude?.id) continue;
                await this.mail.send(
                    consultationMail(this.web, kind, c, person, o.extra),
                );
            }
        });
    }

    private async safely(what: string, task: () => Promise<unknown>) {
        try {
            await task();
        } catch (e) {
            this.logger.error(
                `notification ${what} failed`,
                e instanceof Error ? e.stack : String(e),
            );
        }
    }
}

const info = (e: ConsultationEvent): ConsultationInfo => ({
    ...e,
    id: e.consultationId,
});

// writes are owner-only, so a student actor is always the requester
const actorOf = (e: ConsultationEvent) =>
    e.actor === 'lecturer' ? e.lecturer : e.student;
