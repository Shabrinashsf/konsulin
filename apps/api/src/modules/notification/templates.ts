import { jakartaDateTime } from '../../shared/time/time';
import type { TrackMode } from '../project/project-type-rules';
import {
    buildIcs,
    googleCalendarLink,
    type Person,
    wibDate,
    wibRange,
} from './ics';
import type { Mail } from './mail.service';

// user text is never trusted as HTML
const esc = (s: string) =>
    s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const multiline = (s: string) => esc(s).replace(/\r?\n/g, '<br>');

interface Section {
    label: string;
    value: string; // already escaped
}

function layout(o: {
    to: Person;
    title: string;
    intro: string; // already escaped
    details?: Section[];
    button?: { label: string; url: string };
    footer?: string; // already escaped
}) {
    const rows = (o.details ?? [])
        .map(
            (d) =>
                `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(d.label)}</td><td style="padding:4px 0">${d.value}</td></tr>`,
        )
        .join('');
    return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.5">
<p>Halo ${esc(o.to.name)},</p>
<h2 style="font-size:18px">${esc(o.title)}</h2>
<p>${o.intro}</p>
${rows ? `<table style="border-collapse:collapse">${rows}</table>` : ''}
${o.button ? `<p><a href="${esc(o.button.url)}" style="display:inline-block;padding:10px 16px;background:#1f6feb;color:#fff;text-decoration:none;border-radius:6px">${esc(o.button.label)}</a></p>` : ''}
${o.footer ? `<p>${o.footer}</p>` : ''}
<p style="color:#888;font-size:12px">Email ini dikirim otomatis oleh Konsulin.</p>
</body></html>`;
}

const subject = (s: string) => `[Konsulin] ${s}`;

// ---- E1 ----

export const invitationMail = (
    web: string,
    e: {
        project: { title: string };
        lecturer: { name: string };
        student: Person;
        expiresAt: Date;
    },
): Mail => ({
    to: e.student.email,
    subject: subject(`Undangan bergabung ke project ${e.project.title}`),
    html: layout({
        to: e.student,
        title: 'Undangan project bimbingan',
        intro: `${esc(e.lecturer.name)} mengundang Anda bergabung ke project <b>${esc(e.project.title)}</b>.`,
        details: [
            { label: 'Berlaku sampai', value: esc(wibDate(e.expiresAt)) },
        ],
        button: { label: 'Buka undangan', url: `${web}/invitations` },
    }),
});

// ---- E2–E8, E11: one "consultation update" template ----

export type ConsultationKind =
    | 'requested'
    | 'proposed'
    | 'approved'
    | 'rejected'
    | 'scheduled'
    | 'rescheduled'
    | 'cancelled'
    | 'reminder';

export interface ConsultationInfo {
    id: string;
    project: { id: string; title: string; trackMode: TrackMode };
    lecturer: Person & { id: string };
    student: Person & { id: string };
    topic: string;
    requestedDate: string;
    startAt: Date | null;
    endAt: Date | null;
    location: string | null;
    icsSequence: number;
}

export interface ConsultationExtra {
    actorName?: string;
    note?: string | null;
    reason?: string | null;
    previousStartAt?: Date | null;
    previousEndAt?: Date | null;
    calendar?: 'REQUEST' | 'CANCEL';
}

const TITLES: Record<ConsultationKind, string> = {
    requested: 'Pengajuan bimbingan baru',
    proposed: 'Usulan jam bimbingan',
    approved: 'Jadwal bimbingan disepakati',
    rejected: 'Pengajuan bimbingan ditolak',
    scheduled: 'Bimbingan dijadwalkan',
    rescheduled: 'Jadwal bimbingan diubah',
    cancelled: 'Bimbingan dibatalkan',
    reminder: 'Pengingat: bimbingan besok',
};

function intro(
    kind: ConsultationKind,
    c: ConsultationInfo,
    x: ConsultationExtra,
) {
    const who = esc(x.actorName ?? '');
    switch (kind) {
        case 'requested':
            return `${esc(c.student.name)} mengajukan bimbingan pada ${esc(wibDate(jakartaDateTime(c.requestedDate, '12:00')))}.`;
        case 'proposed':
            return `${who} mengusulkan jam bimbingan. Terima usulan ini atau usulkan jam lain.`;
        case 'approved':
            return 'Jam bimbingan sudah disepakati. Undangan kalender terlampir.';
        case 'rejected':
            return `${who} menolak pengajuan bimbingan.`;
        case 'scheduled':
            return `${who} menjadwalkan bimbingan. Undangan kalender terlampir.`;
        case 'rescheduled':
            return `${who} mengubah jadwal bimbingan. Undangan kalender terlampir.`;
        case 'cancelled':
            return `Bimbingan dibatalkan oleh ${who}.`;
        case 'reminder':
            return 'Bimbingan Anda dijadwalkan besok.';
    }
}

export function consultationMail(
    web: string,
    kind: ConsultationKind,
    c: ConsultationInfo,
    to: Person,
    x: ConsultationExtra = {},
    now = new Date(),
): Mail {
    const time = c.startAt && c.endAt ? wibRange(c.startAt, c.endAt) : null;
    const details: Section[] = [
        { label: 'Project', value: esc(c.project.title) },
        { label: 'Topik', value: esc(c.topic) },
    ];
    if (kind === 'rescheduled' && x.previousStartAt && x.previousEndAt) {
        details.push({
            label: 'Jadwal lama',
            value: esc(wibRange(x.previousStartAt, x.previousEndAt)),
        });
    }
    if (time) {
        details.push({
            label: kind === 'rescheduled' ? 'Jadwal baru' : 'Waktu',
            value: esc(time),
        });
    }
    if (c.location) details.push({ label: 'Lokasi', value: esc(c.location) });
    if (x.note) details.push({ label: 'Catatan', value: multiline(x.note) });
    if (x.reason) details.push({ label: 'Alasan', value: multiline(x.reason) });

    const summary = `Bimbingan: ${c.topic}`;
    const description = `Bimbingan ${c.project.title} (Konsulin)`;
    const scheduled = x.calendar === 'REQUEST' && c.startAt && c.endAt;
    const footer = scheduled
        ? `<a href="${esc(
              googleCalendarLink({
                  summary,
                  start: c.startAt!,
                  end: c.endAt!,
                  details: description,
                  location: c.location,
              }),
          )}">Tambah ke Google Calendar</a>`
        : undefined;

    const mail: Mail = {
        to: to.email,
        subject: subject(`${TITLES[kind]}: ${c.topic}`),
        html: layout({
            to,
            title: TITLES[kind],
            intro: intro(kind, c, x),
            details,
            button: {
                label:
                    kind === 'proposed' ? 'Tanggapi usulan' : 'Lihat bimbingan',
                url: `${web}/consultations/${c.id}`,
            },
            footer,
        }),
    };
    if (x.calendar && c.startAt && c.endAt) {
        const method = x.calendar;
        mail.icalEvent = {
            method,
            filename: 'bimbingan.ics',
            content: buildIcs({
                uid: `${c.id}@konsulin`,
                // a cancel must outrank the invite it cancels
                sequence:
                    method === 'CANCEL' ? c.icsSequence + 1 : c.icsSequence,
                method,
                start: c.startAt,
                end: c.endAt,
                summary,
                description,
                location: c.location,
                organizer: c.lecturer,
                attendee: to,
                now,
            }),
        };
    }
    return mail;
}

// ---- E9 ----

export const uploadMail = (
    web: string,
    e: {
        versionNumber: number;
        note: string | null;
        folder: { id: string; title: string };
        project: { title: string };
        lecturer: Person;
        uploader: { name: string };
    },
): Mail => ({
    to: e.lecturer.email,
    subject: subject(`Versi baru: ${e.folder.title} v${e.versionNumber}`),
    html: layout({
        to: e.lecturer,
        title: 'Draft baru diunggah',
        intro: `${esc(e.uploader.name)} mengunggah versi ${e.versionNumber} di folder <b>${esc(e.folder.title)}</b>.`,
        details: [
            { label: 'Project', value: esc(e.project.title) },
            ...(e.note ? [{ label: 'Catatan', value: multiline(e.note) }] : []),
        ],
        button: { label: 'Lihat folder', url: `${web}/folders/${e.folder.id}` },
    }),
});

// ---- E10 ----

export const feedbackMail = (
    web: string,
    to: Person,
    e: {
        content: string;
        revisionItems: string[];
        version: { id: string; versionNumber: number };
        folder: { title: string };
        project: { title: string };
        lecturer: { name: string };
    },
): Mail => ({
    to: to.email,
    subject: subject(
        `Feedback baru: ${e.folder.title} v${e.version.versionNumber}`,
    ),
    html: layout({
        to,
        title: 'Feedback baru',
        intro: `${esc(e.lecturer.name)} memberi feedback pada versi ${e.version.versionNumber} folder <b>${esc(e.folder.title)}</b>.`,
        details: [
            { label: 'Project', value: esc(e.project.title) },
            { label: 'Feedback', value: multiline(e.content) },
            ...(e.revisionItems.length
                ? [
                      {
                          label: 'Revisi',
                          value: `<ol style="margin:0;padding-left:18px">${e.revisionItems
                              .map((i) => `<li>${esc(i)}</li>`)
                              .join('')}</ol>`,
                      },
                  ]
                : []),
        ],
        button: {
            label: 'Lihat feedback',
            url: `${web}/versions/${e.version.id}`,
        },
    }),
});
