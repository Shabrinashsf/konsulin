import { toJakartaDate, toJakartaTime } from './time';

describe('time helpers (Asia/Jakarta)', () => {
    it('Convert UTC to Jakarta date & time (UTC+7)', () => {
        const d = new Date('2026-11-20T18:30:00Z');
        expect(toJakartaDate(d)).toBe('2026-11-21');
        expect(toJakartaTime(d)).toBe('01:30');
    });
});
