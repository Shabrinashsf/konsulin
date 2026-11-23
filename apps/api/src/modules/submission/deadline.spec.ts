import { deadlineStatus, isLate } from './deadline';

const at = (h: number) =>
    new Date(`2026-12-01T${String(h).padStart(2, '0')}:00:00Z`);

describe('deadlineStatus', () => {
    const deadline = at(10);

    it('none without a deadline', () => {
        expect(deadlineStatus(null, at(9), at(12))).toBe('none');
    });

    it('upcoming / overdue while nothing is uploaded', () => {
        expect(deadlineStatus(deadline, null, at(9))).toBe('upcoming');
        expect(deadlineStatus(deadline, null, at(10))).toBe('upcoming');
        expect(deadlineStatus(deadline, null, at(11))).toBe('overdue');
    });

    it('submitted when the first upload is on time, late otherwise', () => {
        expect(deadlineStatus(deadline, at(9), at(12))).toBe('submitted');
        expect(deadlineStatus(deadline, at(10), at(12))).toBe('submitted');
        expect(deadlineStatus(deadline, at(11), at(12))).toBe('late');
    });

    it('isLate labels versions after the deadline', () => {
        expect(isLate(at(11), deadline)).toBe(true);
        expect(isLate(at(10), deadline)).toBe(false);
        expect(isLate(at(11), null)).toBe(false);
    });
});
