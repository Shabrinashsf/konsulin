import {
    canAddress,
    canReview,
    isNewerFix,
    reviewedStatus,
} from './revision-state';

describe('revision state (BR-13, BR-14)', () => {
    it('the student addresses open and reopened items only', () => {
        expect(canAddress('open')).toBe(true);
        expect(canAddress('reopened')).toBe(true);
        expect(canAddress('addressed')).toBe(false);
        expect(canAddress('verified')).toBe(false);
    });

    it('the lecturer reviews addressed items only', () => {
        expect(canReview('addressed')).toBe(true);
        for (const s of ['open', 'reopened', 'verified'] as const) {
            expect(canReview(s)).toBe(false);
        }
        expect(reviewedStatus('verify')).toBe('verified');
        expect(reviewedStatus('reopen')).toBe('reopened');
    });

    it('the fix must be newer than the feedback version', () => {
        const open = { addressedInVersion: null };
        expect(isNewerFix(open, 2, 3)).toBe(true);
        expect(isNewerFix(open, 2, 2)).toBe(false);
        expect(isNewerFix(open, 2, 1)).toBe(false);
    });

    it('after a reopen, newer than the last claimed fix', () => {
        const reopened = { addressedInVersion: { versionNumber: 3 } };
        expect(isNewerFix(reopened, 1, 3)).toBe(false);
        expect(isNewerFix(reopened, 1, 4)).toBe(true);
    });
});
