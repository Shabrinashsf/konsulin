import { buildIcs, googleCalendarLink, wibDate, wibRange } from './ics';

const start = new Date('2026-12-01T02:00:00Z'); // 09.00 WIB
const end = new Date('2026-12-01T03:00:00Z');

const input = {
    uid: 'c1@konsulin',
    sequence: 2,
    method: 'REQUEST' as const,
    start,
    end,
    summary: 'Bimbingan: Bab 1, revisi; final',
    description: 'Baris 1\nBaris 2',
    location: 'Ruang 101',
    organizer: { name: 'Dosen "A"', email: 'dosen@example.com' },
    attendee: { name: 'Andi', email: 'andi@example.com' },
    now: new Date('2026-11-23T00:00:00Z'),
};

describe('buildIcs', () => {
    it('writes a CRLF VCALENDAR with escaped text', () => {
        const ics = buildIcs(input);
        expect(ics.split('\r\n')).toEqual(
            expect.arrayContaining([
                'METHOD:REQUEST',
                'UID:c1@konsulin',
                'SEQUENCE:2',
                'DTSTAMP:20261123T000000Z',
                'DTSTART:20261201T020000Z',
                'DTEND:20261201T030000Z',
                'SUMMARY:Bimbingan: Bab 1\\, revisi\\; final',
                'DESCRIPTION:Baris 1\\nBaris 2',
                'LOCATION:Ruang 101',
                `ORGANIZER;CN="Dosen 'A'":mailto:dosen@example.com`,
                'ATTENDEE;CN="Andi";ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:andi@example.com',
                'STATUS:CONFIRMED',
            ]),
        );
        expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
        expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    });

    it('cancels without a location', () => {
        const ics = buildIcs({ ...input, method: 'CANCEL', location: null });
        expect(ics).toContain('METHOD:CANCEL');
        expect(ics).toContain('STATUS:CANCELLED');
        expect(ics).not.toContain('LOCATION');
    });
});

describe('googleCalendarLink', () => {
    it('builds a TEMPLATE link in UTC', () => {
        const url = new URL(
            googleCalendarLink({
                summary: 'Bimbingan',
                start,
                end,
                details: 'Project X',
                location: null,
            }),
        );
        expect(url.searchParams.get('action')).toBe('TEMPLATE');
        expect(url.searchParams.get('dates')).toBe(
            '20261201T020000Z/20261201T030000Z',
        );
        expect(url.searchParams.has('location')).toBe(false);
    });
});

describe('WIB formatting', () => {
    it('formats dates in Indonesian, Asia/Jakarta', () => {
        expect(wibDate(start)).toBe('Selasa, 1 Desember 2026');
        expect(wibRange(start, end)).toBe(
            'Selasa, 1 Desember 2026, 09.00–10.00 WIB',
        );
    });
});
