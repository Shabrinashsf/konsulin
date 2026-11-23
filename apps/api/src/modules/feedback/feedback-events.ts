export const FEEDBACK_CREATED = 'feedback.created';

// the notification module emails the track owner (individual) or every active member (shared)
export class FeedbackCreatedEvent {
    constructor(
        readonly feedbackId: string,
        readonly content: string,
        readonly revisionItems: string[],
        readonly version: { id: string; versionNumber: number },
        readonly folder: {
            id: string;
            title: string;
            studentId: string | null;
        },
        readonly project: { id: string; title: string; type: string },
        readonly lecturer: { id: string; name: string },
    ) {}
}
