// name of event
export const INVITATION_CREATED = 'invitation.created';

// a notification sent to other modules whenever a new invitation is received,
// so that those modules are awareand can take action
// ex: sending an email
export class InvitationCreatedEvent {
    constructor(
        readonly invitationId: string,
        readonly project: { id: string; title: string },
        readonly lecturer: { id: string; name: string },
        readonly student: { id: string; name: string; email: string },
        readonly expiresAt: Date,
    ) {}
}
