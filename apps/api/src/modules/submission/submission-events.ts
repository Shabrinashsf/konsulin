export const SUBMISSION_UPLOADED = 'submission.uploaded';

// the notification module emails the project lecturer only
export class SubmissionUploadedEvent {
    constructor(
        readonly versionId: string,
        readonly versionNumber: number,
        readonly note: string | null,
        readonly folder: { id: string; title: string },
        readonly project: { id: string; title: string },
        readonly lecturer: { id: string; name: string; email: string },
        readonly uploader: { id: string; name: string },
    ) {}
}
