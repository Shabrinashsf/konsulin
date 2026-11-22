export const CONSULTATION_CANCELLED = 'consultation.cancelled';

// email (+ .ics CANCEL) is sent by the notification module listener;
// in shared projects it goes to every member except the actor
export class ConsultationCancelledEvent {
    constructor(
        readonly consultationId: string,
        readonly project: { id: string; title: string },
        readonly lecturer: { id: string; name: string },
        readonly student: { id: string; name: string; email: string },
        readonly requestedDate: string,
        readonly startAt: Date | null,
        readonly endAt: Date | null,
        readonly reason: string | null,
        readonly cancelledBy: 'lecturer' | 'student',
    ) {}
}
