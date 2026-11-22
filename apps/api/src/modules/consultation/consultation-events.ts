import type { ConsultationMode } from '../../generated/prisma/client';
import type { TrackMode } from '../project/project-type-rules';
import type { Party } from './consultation-state';

// emails are sent by the notification module listener; in shared projects they go to every member except the actor
// Cancellation uses CONSULTATION_CANCELLED from shared/consultation.
export const CONSULTATION_EVENTS = {
    requested: 'consultation.requested',
    proposed: 'consultation.proposed',
    approved: 'consultation.approved',
    rejected: 'consultation.rejected',
    scheduled: 'consultation.scheduled',
    rescheduled: 'consultation.rescheduled',
} as const;

export class ConsultationEvent {
    constructor(
        readonly consultationId: string,
        readonly actor: Party,
        readonly project: { id: string; title: string; trackMode: TrackMode },
        readonly lecturer: { id: string; name: string; email: string },
        readonly student: { id: string; name: string; email: string },
        readonly topic: string,
        readonly mode: ConsultationMode,
        readonly requestedDate: string,
        readonly startAt: Date | null,
        readonly endAt: Date | null,
        readonly location: string | null,
        readonly icsSequence: number,
        readonly extra: {
            note?: string | null;
            reason?: string;
            previousStartAt?: Date | null;
            previousEndAt?: Date | null;
        } = {},
    ) {}
}
