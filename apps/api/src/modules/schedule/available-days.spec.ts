import { calculateAvailableDays } from './available-days';

// 2026-11-23 07:00 WIB
const NOW = new Date('2026-11-23T00:00:00Z');
const base = {
    from: '2026-11-23',
    to: '2026-11-25',
    blackoutDates: [],
    now: NOW,
};
const available = (input: Parameters<typeof calculateAvailableDays>[0]) =>
    calculateAvailableDays(input)
        .filter((d) => d.status === 'available')
        .map((d) => d.date);

describe('calculateAvailableDays', () => {
    it('setiap tanggal dalam rentang punya status; akhir pekan tersedia', () => {
        expect(
            calculateAvailableDays({
                ...base,
                from: '2026-11-28',
                to: '2026-11-29',
            }),
        ).toEqual([
            { date: '2026-11-28', status: 'available' },
            { date: '2026-11-29', status: 'available' },
        ]);
    });

    it('hari ini tersedia; tanggal lampau tidak tersedia', () => {
        expect(
            calculateAvailableDays({
                ...base,
                from: '2026-11-22',
                to: '2026-11-23',
            }),
        ).toEqual([
            { date: '2026-11-22', status: 'unavailable' },
            { date: '2026-11-23', status: 'available' },
        ]);
    });

    it('hari ini dihitung WIB (17:30 UTC = 00:30 WIB besoknya)', () => {
        const now = new Date('2026-11-23T17:30:00Z');
        expect(available({ ...base, now })).toEqual([
            '2026-11-24',
            '2026-11-25',
        ]);
    });

    it('tanggal blacklist tidak tersedia', () => {
        expect(available({ ...base, blackoutDates: ['2026-11-24'] })).toEqual([
            '2026-11-23',
            '2026-11-25',
        ]);
    });

    it('BR-06: maksimal 60 hari ke depan (inklusif)', () => {
        // 2026-11-23 + 60 days = 2027-01-22
        expect(
            available({ ...base, from: '2027-01-21', to: '2027-01-24' }),
        ).toEqual(['2027-01-21', '2027-01-22']);
    });
});
