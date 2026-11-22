import {
    addDays,
    formatDateOnly,
    jakartaDateTime,
    parseDateOnly,
    toJakartaDate,
    toJakartaTime,
} from './time';

describe('time helpers (Asia/Jakarta)', () => {
    it('Convert UTC to Jakarta date & time (UTC+7)', () => {
        const d = new Date('2026-11-20T18:30:00Z');
        expect(toJakartaDate(d)).toBe('2026-11-21');
        expect(toJakartaTime(d)).toBe('01:30');
    });
});

describe('date-only helpers', () => {
    it('round-trip YYYY-MM-DD tanpa geser hari', () => {
        expect(formatDateOnly(parseDateOnly('2026-02-28'))).toBe('2026-02-28');
    });
});

describe('time & WIB helpers', () => {
    it('jam WIB → instant UTC (UTC+7)', () => {
        expect(jakartaDateTime('2026-12-01', '08:00').toISOString()).toBe(
            '2026-12-01T01:00:00.000Z',
        );
        expect(jakartaDateTime('2026-12-01', '03:00').toISOString()).toBe(
            '2026-11-30T20:00:00.000Z',
        );
    });

    it('addDays melewati akhir bulan/tahun', () => {
        expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    });
});
