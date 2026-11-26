# Notification module

Every email the system sends. Other modules never send mail: they emit a domain event, and
this module decides who receives it, renders the template (with a calendar invite where it
makes sense) and sends one email per recipient. It also runs the daily H-1 reminder.

## Personas

| Persona  | Goal                                                                                 |
| -------- | ------------------------------------------------------------------------------------ |
| Student  | Hear about invitations, meeting changes and new feedback without polling the app.    |
| Lecturer | Hear about new requests, proposals and uploads; keep meetings in their own calendar. |

## User stories

**US-10 Email notifications**

- Each event below sends an email in Indonesian, with times in WIB (e.g. "Senin, 1 Desember 2026, 09.00–10.00 WIB")
  and a button back to the right page.
- Emails that set or move a meeting carry an `.ics` invite and a "Tambah ke Google Calendar" link, so the meeting
  lands in any calendar; a cancellation removes it again.
- The day before a meeting, everyone involved gets a reminder.
- A failed email never breaks the action that caused it.

## Business rules

| ID    | Rule                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| BR-05 | On `shared` projects a consultation is a team meeting, so its emails go to every active member (see recipients below).                     |
| BR-16 | The H-1 reminder is sent once per consultation: the job claims rows atomically by setting `consultations.reminder_sent_at` before sending. |
| BR-25 | E10 goes to the track owner (`individual`) or every active member (`shared`); no email for editing feedback, addressing or reviewing.      |

## Email catalogue

| #   | Trigger (event)            | Emitted by                                                                            | Recipients                       | Subject (`[Konsulin] …`)              | Button → page                             | Attachment                                |
| --- | -------------------------- | ------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| E1  | `invitation.created`       | project (send invitation)                                                             | the invited student              | Undangan bergabung ke project {title} | `/invitations`                            | –                                         |
| E2  | `consultation.requested`   | consultation (ask for a date)                                                         | lecturer                         | Pengajuan bimbingan baru: {topic}     | `/consultations/{id}`                     | –                                         |
| E3  | `consultation.approved`    | consultation (accept)                                                                 | all participants                 | Jadwal bimbingan disepakati: {topic}  | `/consultations/{id}`                     | `.ics` REQUEST + Google link              |
| E4  | `consultation.rejected`    | consultation (reject)                                                                 | participants except the lecturer | Pengajuan bimbingan ditolak: {topic}  | `/consultations/{id}`                     | –                                         |
| E5  | `consultation.scheduled`   | consultation (schedule directly)                                                      | all participants                 | Bimbingan dijadwalkan: {topic}        | `/consultations/{id}`                     | `.ics` REQUEST + Google link              |
| E6  | `consultation.rescheduled` | consultation (reschedule)                                                             | all participants                 | Jadwal bimbingan diubah: {topic}      | `/consultations/{id}`                     | `.ics` REQUEST, sequence + 1, Google link |
| E7  | `consultation.cancelled`   | consultation (cancel), schedule (blackout), project (member removed, project deleted) | all participants                 | Bimbingan dibatalkan: {topic}         | `/consultations/{id}`                     | `.ics` CANCEL if it was `approved`        |
| E8  | cron 08:00 WIB             | notification                                                                          | all participants                 | Pengingat: bimbingan besok: {topic}   | `/consultations/{id}`                     | –                                         |
| E9  | `submission.uploaded`      | submission (upload)                                                                   | lecturer                         | Versi baru: {folder} v{n}             | `/folders/{id}`                           | –                                         |
| E10 | `feedback.created`         | feedback (create)                                                                     | track owner / all active members | Feedback baru: {folder} v{n}          | `/folders/{folderId}?versi={versionId}`   | –                                         |
| E11 | `consultation.proposed`    | consultation (propose)                                                                | participants except the actor    | Usulan jam bimbingan: {topic}         | `/consultations/{id}` ("Tanggapi usulan") | –                                         |

Buttons point at `FRONTEND_ORIGIN` + the path. E2–E8 and E11 share one "consultation update" template whose intro and
details vary per kind (requested date and note, proposed time, reason, old → new time, location, mode).

## Recipients

- **Consultation participants** = the lecturer + the requester, plus every active member on a `shared` project.
  Resolved when the email is sent, so they reflect the current members.
- **All participants includes the actor** for emails with a calendar invite and for the reminder, so everyone's
  calendar stays the same. E4 and E11 skip the actor (the lecturer for E4); E2 goes to the lecturer only.
- A requester removed from the project (BR-22) still gets the E7 for their own meeting.
- Deleted accounts never get mail. E10 skips a track owner who is no longer a member.
- One email per recipient: addresses are never shared between members.

## Calendar invites

- Built by hand in `ics.ts` (RFC 5545, CRLF): `METHOD` REQUEST or CANCEL, `UID {consultationId}@konsulin`,
  `SEQUENCE`, `DTSTART`/`DTEND` in UTC, `SUMMARY`, `DESCRIPTION`, `LOCATION`, `ORGANIZER` the lecturer, `ATTENDEE` the
  recipient, `STATUS` CONFIRMED or CANCELLED. Text is escaped (`\ ; , newline`).
- **Same UID, higher sequence:** a reschedule increments `consultations.ics_sequence`, so calendars move the event
  instead of adding a second one. A cancellation sends `ics_sequence + 1` with `METHOD:CANCEL`.
- CANCEL is attached only if the consultation was `approved` (only then was it ever in a calendar).
- The Google Calendar link (`calendar.google.com/calendar/render?action=TEMPLATE…`) is added to every email that
  carries a REQUEST invite.

## Flows

### Event-driven email

```
Service (after commit) → EventEmitter2.emit(event)
  → NotificationListener @OnEvent(event, { async: true })     runs after the response
  → resolve recipients (NotificationRepository)
  → render the TypeScript template (+ .ics)
  → MailService.send() per recipient
  → any error is logged (Logger.error), never thrown to the request
```

### H-1 reminder

```
@Cron('0 8 * * *', timeZone 'Asia/Jakarta')
  → tomorrow = WIB date + 1
  → UPDATE consultations SET reminder_sent_at = now()
      WHERE status = 'approved' AND reminder_sent_at IS NULL
        AND start_at in [tomorrow 00:00 WIB, the day after 00:00 WIB)
        AND project not deleted
      RETURNING id
  → load the claimed rows → E8 to all participants of each
```

- Only rows returned by `RETURNING` are mailed, so running the job twice sends nothing new.
- A reschedule clears `reminder_sent_at`, so a moved meeting is reminded again.
- A meeting approved after 08:00 for the next day gets no E8 (its participants just got E3/E5).

## Templates and sending

- Templates are TypeScript functions in `templates.ts` (no template engine); every user-supplied value is HTML-escaped,
  multi-line text keeps its line breaks.
- `MailService` uses nodemailer over SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`; Gmail on
  port 465 with an app password). Without `SMTP_USER` (development, tests) nothing is sent; the email is only logged
  at debug level.
- `send` never throws. Gmail allows about 500 emails a day, enough for one department.
- Not in scope: an email log table and automatic retries (see the PRD TODO list).
