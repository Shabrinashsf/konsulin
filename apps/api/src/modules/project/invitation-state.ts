import type { InvitationStatus } from '../../generated/prisma/client';

export const INVITATION_TTL_DAYS = 7;

export type InvitationView = InvitationStatus | 'expired';
export const INVITATION_VIEWS: InvitationView[] = [
    'pending',
    'accepted',
    'declined',
    'revoked',
    'expired',
];

interface InvitationState {
    status: InvitationStatus;
    expiresAt: Date;
}

export const isExpired = (inv: InvitationState, now = new Date()) =>
    inv.status === 'pending' && inv.expiresAt <= now;

export const viewStatus = (
    inv: InvitationState,
    now = new Date(),
): InvitationView => (isExpired(inv, now) ? 'expired' : inv.status);

export const invitationExpiresAt = (now = new Date()) =>
    new Date(now.getTime() + INVITATION_TTL_DAYS * 86_400_000);

export function transitionError(
    inv: InvitationState,
    now = new Date(),
): 'INVITATION_EXPIRED' | 'INVITATION_NOT_PENDING' | null {
    if (inv.status !== 'pending') return 'INVITATION_NOT_PENDING';
    if (isExpired(inv, now)) return 'INVITATION_EXPIRED';
    return null;
}
