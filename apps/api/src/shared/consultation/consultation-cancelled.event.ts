import type { TrackMode } from '../../modules/project/project-type-rules';

export const CONSULTATION_CANCELLED = 'consultation.cancelled';

// .ics CANCEL when it was approved is sent by the notification module
export class ConsultationCancelledEvent {
    constructor(
        readonly consultationId: string,
        readonly project: { id: string; title: string; trackMode: TrackMode },
        readonly lecturer: { id: string; name: string; email: string },
        readonly student: { id: string; name: string; email: string },
        readonly topic: string,
        readonly requestedDate: string,
        readonly startAt: Date | null,
        readonly endAt: Date | null,
        readonly location: string | null,
        readonly wasApproved: boolean,
        readonly icsSequence: number,
        readonly reason: string | null,
        readonly cancelledBy: 'lecturer' | 'student',
    ) {}
}
