import {
    invitationExpiresAt,
    transitionError,
    viewStatus,
} from './invitation-state';

const now = new Date('2026-11-20T10:00:00Z');
const later = new Date('2026-11-21T10:00:00Z');
const earlier = new Date('2026-11-19T10:00:00Z');

describe('invitation state', () => {
    it('kedaluwarsa 7 hari setelah dibuat', () => {
        expect(invitationExpiresAt(now).toISOString()).toBe(
            '2026-11-27T10:00:00.000Z',
        );
    });

    it('pending yang lewat expires_at dibaca sebagai expired', () => {
        expect(viewStatus({ status: 'pending', expiresAt: later }, now)).toBe(
            'pending',
        );
        expect(viewStatus({ status: 'pending', expiresAt: earlier }, now)).toBe(
            'expired',
        );
        expect(viewStatus({ status: 'pending', expiresAt: now }, now)).toBe(
            'expired',
        );
        expect(
            viewStatus({ status: 'accepted', expiresAt: earlier }, now),
        ).toBe('accepted');
    });

    it('hanya pending aktif yang boleh berpindah status', () => {
        expect(
            transitionError({ status: 'pending', expiresAt: later }, now),
        ).toBe(null);
        expect(
            transitionError({ status: 'pending', expiresAt: earlier }, now),
        ).toBe('INVITATION_EXPIRED');
        for (const status of ['accepted', 'declined', 'revoked'] as const) {
            expect(transitionError({ status, expiresAt: later }, now)).toBe(
                'INVITATION_NOT_PENDING',
            );
        }
    });
});
