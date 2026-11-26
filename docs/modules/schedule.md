# Schedule module

The lecturer's availability. Meeting times are always negotiated in consultation module, so the only constraint a lecturer sets is a **blackout date**, a day on which no consultation can be requested, proposed or scheduled. Students see the result as **available days**.

## Personas

| Persona  | Goal                                                                                |
| -------- | ----------------------------------------------------------------------------------- |
| Lecturer | Block the days they are away, and clear the meetings that fall on them in one step. |
| Student  | See which days the lecturer can be asked for before requesting a consultation.      |

## User stories

**US-04 Lecturer availability**

- A lecturer blacklists a date range `from`–`to` (at most 90 days) with an optional reason that only they see.
- If the range hits active consultations, the API lists them first (409). The lecturer confirms, then the
  blackout is created and those consultations are cancelled with a generic reason → email E7.
- Blackouts are removed by date range (one day: `from = to`).
- Students see the lecturer's **available days**: today up to 60 days ahead, minus blackouts.

## Business rules

| ID    | Rule                                                                                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-06 | A requested date is today–60 days ahead (WIB) and not blacklisted. Proposals, direct scheduling and reschedules cannot fall on a blacklisted date (checked in the consultation module).                                                                                      |
| BR-10 | A blackout hitting active consultations needs confirmation: without it → 409 with the affected list; with `cancelConsultations: true` the blackout is created and they are all cancelled in one transaction, `status_reason` "Dosen berhalangan pada tanggal tersebut" → E7. |

**Affected** (BR-10), for the lecturer's live projects, dates in WIB:

- `approved` and not started, with its time in the range;
- `requested` (not expired) with a proposed time in the range;
- `requested` (not expired) without a proposed time, requested for a date in the range.

A request whose date is in the range but whose proposed time is outside it is not affected.

Other rules:

- Blackouts are per lecturer; another lecturer may block the same date.
- A blackout cannot start in the past (400 `DATE_IN_PAST`); today is allowed. Past dates can still be removed.
- Dates already blocked are skipped, not duplicated.
- Existing consultations do not make a day unavailable; only blackouts, the past and the 60-day window do.

## Access

| Action                                 | Student | Lecturer      |
| -------------------------------------- | ------- | ------------- |
| List / create / remove blackout dates  | 403     | own only      |
| Available days of a project's lecturer | member  | project owner |

Removing a range only touches the lecturer's own blackouts. Project not visible → **404**. Wrong role → **403**.

## Endpoints

All responses are wrapped as `{ data }` (lists: `{ data, meta }`); errors are `{ statusCode, error, message, code }`.
Dates are `YYYY-MM-DD` in WIB.

### GET /me/blackout-dates (lecturer)

Own blackouts `{ id, date, reason }`, newest date first by default. Filters: `from`/`to` (inclusive), `order`, pagination.

### POST /me/blackout-dates (lecturer)

Body `{ from, to, reason?, cancelConsultations? }` (one day: `from = to`).

1. `from ≤ to` and at most 90 days → else 400 `INVALID_DATE_RANGE`; `from` before today → 400 `DATE_IN_PAST`.
2. Transaction: **lock the lecturer row** → find the affected consultations.
3. Some affected and no `cancelConsultations: true` → 409 `BLACKOUT_HAS_CONSULTATION` with
   `details.consultations` (`id, status, topic, requestedDate, startAt, endAt, project, student`); nothing changes.
4. Otherwise cancel the affected ones, skip dates already blocked, insert the rest.
5. 201 `{ created: [dates], skipped: [dates], cancelledConsultations: [...] }`.
6. One `consultation.cancelled` event per cancellation → **E7**. A 409 emits nothing.

### DELETE /me/blackout-dates?from&to (lecturer)

Removes the lecturer's blackouts in the range (at most 90 days, else 400) → 200 `{ deleted: [dates] }` (empty when none).
The dates become available again.

### GET /projects/:projectId/available-days

1. `from ≤ to` and at most 42 days (a calendar month grid) → else 400 `INVALID_DATE_RANGE`.
2. Project visible (404); read the blackouts of the project's lecturer in the range.
3. 200 `[{ date, status }]` for every date: `available` when today ≤ date ≤ today + 60 and not blacklisted,
   otherwise `unavailable`. The reason is never shown.

## Emails

| Event / trigger          | Email | Recipients                                              |
| ------------------------ | ----- | ------------------------------------------------------- |
| `consultation.cancelled` | E7    | consultation participants (see the consultation module) |
