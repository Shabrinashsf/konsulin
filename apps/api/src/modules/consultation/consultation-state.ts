import type { ConsultationStatus } from '../../generated/prisma/client';
import { formatDateOnly, toJakartaDate } from '../../shared/time/time';
import { MAX_AHEAD_DAYS } from '../schedule/available-days';

export type Party = 'lecturer' | 'student';
export type ConsultationView = ConsultationStatus | 'expired';
export const CONSULTATION_VIEWS: ConsultationView[] = [
    'requested',
    'approved',
    'rejected',
    'completed',
    'cancelled',
    'expired',
];

export const MIN_LEAD_MINUTES = 60;
export const MIN_DURATION_MINUTES = 15;
export const MAX_DURATION_MINUTES = 240;

export interface ConsultationState {
    status: ConsultationStatus;
    requestedDate: Date; // DATE value (UTC midnight)
    proposedBy: Party | null;
    startAt: Date | null;
}

// requested date passed and no proposal, or the last one passed
export function isExpired(c: ConsultationState, now: Date) {
    if (c.status !== 'requested') return false;
    if (formatDateOnly(c.requestedDate) >= toJakartaDate(now)) return false;
    return !c.startAt || c.startAt < now;
}

export const viewStatus = (
    c: ConsultationState,
    now: Date,
): ConsultationView => (isExpired(c, now) ? 'expired' : c.status);

// who acts next on a live request; null otherwise
export function turnOf(c: ConsultationState, now: Date): Party | null {
    if (c.status !== 'requested' || isExpired(c, now)) return null;
    return c.proposedBy === 'lecturer' ? 'student' : 'lecturer';
}

export type StateError =
    | 'INVALID_TRANSITION'
    | 'CONSULTATION_EXPIRED'
    | 'NOT_YOUR_TURN'
    | 'NO_PROPOSAL'
    | 'PROPOSAL_EXPIRED'
    | 'CONSULTATION_STARTED'
    | 'CONSULTATION_NOT_STARTED';

function negotiationError(
    c: ConsultationState,
    actor: Party,
    now: Date,
): StateError | null {
    if (c.status !== 'requested') return 'INVALID_TRANSITION';
    if (isExpired(c, now)) return 'CONSULTATION_EXPIRED';
    if (turnOf(c, now) !== actor) return 'NOT_YOUR_TURN';
    return null;
}

export const proposeError = negotiationError;

export const rejectError = (c: ConsultationState, now: Date) =>
    negotiationError(c, 'lecturer', now);

export function acceptError(
    c: ConsultationState,
    actor: Party,
    now: Date,
): StateError | null {
    const error = negotiationError(c, actor, now);
    if (error) return error;
    if (!c.startAt) return 'NO_PROPOSAL';
    if (c.startAt < now) return 'PROPOSAL_EXPIRED';
    return null;
}

export function cancelError(
    c: ConsultationState,
    now: Date,
): StateError | null {
    if (c.status === 'requested') {
        return isExpired(c, now) ? 'CONSULTATION_EXPIRED' : null;
    }
    if (c.status === 'approved') {
        return c.startAt! <= now ? 'CONSULTATION_STARTED' : null;
    }
    return 'INVALID_TRANSITION';
}

export const rescheduleError = (c: ConsultationState): StateError | null =>
    c.status === 'approved' ? null : 'INVALID_TRANSITION';

// only an approved consultation whose start has passed
export function completeError(
    c: ConsultationState,
    now: Date,
): StateError | null {
    if (c.status !== 'approved') return 'INVALID_TRANSITION';
    return c.startAt! > now ? 'CONSULTATION_NOT_STARTED' : null;
}

export type TimeError = 'INVALID_TIME_RANGE' | 'OUTSIDE_BOOKING_WINDOW';

// (15 min – 4 h, same WIB date) and (1 hour – 60 days ahead)
export function timeError(start: Date, end: Date, now: Date): TimeError | null {
    const minutes = (end.getTime() - start.getTime()) / 60_000;
    if (
        minutes < MIN_DURATION_MINUTES ||
        minutes > MAX_DURATION_MINUTES ||
        toJakartaDate(start) !== toJakartaDate(end)
    ) {
        return 'INVALID_TIME_RANGE';
    }
    const earliest = now.getTime() + MIN_LEAD_MINUTES * 60_000;
    const latest = now.getTime() + MAX_AHEAD_DAYS * 86_400_000;
    if (start.getTime() < earliest || start.getTime() > latest) {
        return 'OUTSIDE_BOOKING_WINDOW';
    }
    return null;
}
