// calendar invites and the Google Calendar fallback link

export interface Person {
    name: string;
    email: string;
}

export interface IcsInput {
    uid: string;
    sequence: number;
    method: 'REQUEST' | 'CANCEL';
    start: Date;
    end: Date;
    summary: string;
    description: string;
    location: string | null;
    organizer: Person;
    attendee: Person;
    now: Date;
}

// 2026-12-01T02:00:00.000Z -> 20261201T020000Z
const stamp = (d: Date) =>
    d
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');

const text = (s: string) =>
    s
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\r?\n/g, '\\n');

const cn = (name: string) => `"${name.replace(/"/g, "'")}"`;

export function buildIcs(e: IcsInput) {
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Konsulin//ID',
        'CALSCALE:GREGORIAN',
        `METHOD:${e.method}`,
        'BEGIN:VEVENT',
        `UID:${e.uid}`,
        `SEQUENCE:${e.sequence}`,
        `DTSTAMP:${stamp(e.now)}`,
        `DTSTART:${stamp(e.start)}`,
        `DTEND:${stamp(e.end)}`,
        `SUMMARY:${text(e.summary)}`,
        `DESCRIPTION:${text(e.description)}`,
        ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
        `ORGANIZER;CN=${cn(e.organizer.name)}:mailto:${e.organizer.email}`,
        `ATTENDEE;CN=${cn(e.attendee.name)};ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${e.attendee.email}`,
        `STATUS:${e.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
        'END:VEVENT',
        'END:VCALENDAR',
        '',
    ].join('\r\n');
}

export const googleCalendarLink = (e: {
    summary: string;
    start: Date;
    end: Date;
    details: string;
    location: string | null;
}) =>
    `https://calendar.google.com/calendar/render?${new URLSearchParams({
        action: 'TEMPLATE',
        text: e.summary,
        dates: `${stamp(e.start)}/${stamp(e.end)}`,
        details: e.details,
        ...(e.location ? { location: e.location } : {}),
    }).toString()}`;

const WIB = { timeZone: 'Asia/Jakarta' } as const;
const dateFormat = new Intl.DateTimeFormat('id-ID', {
    ...WIB,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('id-ID', {
    ...WIB,
    hour: '2-digit',
    minute: '2-digit',
});

// "Senin, 1 Desember 2026"
export const wibDate = (d: Date) => dateFormat.format(d);

// "Senin, 1 Desember 2026, 09.00–10.00 WIB"
export const wibRange = (start: Date, end: Date) =>
    `${wibDate(start)}, ${timeFormat.format(start)}–${timeFormat.format(end)} WIB`;
