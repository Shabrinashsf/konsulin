# Konsulin

Konsulin is a web app for academic supervision: the back-and-forth between a lecturer and their students on
final projects (undergraduate theses, master's theses, dissertations and their proposals) and on other work such as
research, publications, competitions and external projects. It keeps the whole cycle in one place: invitation →
scheduling → draft → feedback → revision → logbook.

## Why

| Today                                         | What goes wrong                                           | In Konsulin                                                                        |
| --------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Drafts are sent over chat or email            | Nobody knows which file is the latest; old notes get lost | Submission folders with immutable versions (v1, v2, …)                             |
| Feedback is scattered across chats            | Students forget revision points                           | Feedback on a specific version with a **revision checklist** the lecturer verifies |
| Meetings are arranged by hand                 | Double bookings, meetings on days the lecturer is away    | Blackout dates, time negotiation, overlap detection                                |
| The supervision logbook is filled in manually | Often forgotten or incomplete                             | Logbook built automatically from completed meetings                                |

## Who uses it

| Role         | Account                               | Does                                                                                        |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Student**  | registers themselves                  | joins projects by invitation, requests meetings, uploads drafts, works through revisions    |
| **Lecturer** | created by the developer (no sign-up) | creates projects, invites students, manages the schedule, gives feedback, monitors progress |

A project has exactly one lecturer (its owner) and any number of students. One department, with S1, S2 and S3
study programs.

## Features

- **Projects and invitations.** Ten project types. Final-project types (S1/S2/S3 thesis or dissertation and their
  proposals) only accept students of that degree and keep each student's work **private** (`individual`); general
  types (research, publication, competition, external project) are open to every degree and **shared** by the team.
  Invitations expire after 7 days.
- **Lecturer availability.** No fixed office hours: the lecturer blocks the days they are away, and students see the
  remaining available days up to 60 days ahead. Blocking a day that already has meetings cancels them after the lecturer
  confirms.
- **Consultations.** A student asks for a date; lecturer and student then **negotiate the time** by proposing and
  counter-proposing until one side accepts. The lecturer can also schedule, reschedule, reject or cancel, and closes each
  meeting with a summary that becomes the **logbook**. Approved meetings of one lecturer can never overlap.
- **Submissions.** Folders per deliverable with an optional deadline; every upload (PDF, DOCX or ZIP, up to 50 MB) is a
  new version. Deadline status (upcoming, submitted, late, overdue) is shown on every folder; late uploads are allowed
  and labelled.
- **Feedback and revision checklist.** The lecturer comments on a version and lists revision items; the student marks
  each one done by pointing at the newer version that fixes it; the lecturer verifies or reopens it.
- **Monitoring.** One list of every supervised student across all projects: last meeting, completed meetings, open
  revisions, overdue folders and the nearest deadline, with filters by project, study program, degree and cohort.
- **Email notifications.** Eleven emails (invitations, every meeting change, uploads, feedback) plus a reminder the day
  before each meeting. Meeting emails carry a calendar invite (`.ics`) and an "Add to Google Calendar" link, so
  reschedules move the event and cancellations remove it.

## Tech stack

| Part     | Choice                                                                                     |
| -------- | ------------------------------------------------------------------------------------------ |
| Backend  | NestJS 11 (TypeScript), REST API with Swagger                                              |
| Database | PostgreSQL with Prisma 7                                                                   |
| Auth     | JWT access token + rotating refresh token in an httpOnly cookie, argon2id password hashing |
| Email    | SMTP (Gmail) with nodemailer, `.ics` calendar invites, daily reminder job                  |
| Files    | local disk or Cloudflare R2, switched with one environment variable                        |
| Frontend | React 19 + Vite + Tailwind CSS v4 + TanStack Query + React Router                          |
| Tests    | Jest unit tests and Jest + Supertest end-to-end tests against a real database (API)        |
| Tooling  | pnpm workspace monorepo                                                                    |

## Repository

```
konsulin/
├─ apps/
│  ├─ api/            NestJS backend
│  └─ web/            React frontend (talks only to the API)
├─ docs/modules/      one document per backend module
└─ package.json       workspace scripts
```

## Getting started

```bash
pnpm install
pnpm dev:api          # http://localhost:3000/api/v1, Swagger at /api/docs
pnpm dev:web          # http://localhost:5173 (Vite proxies /api to :3000)
```

- The API needs a PostgreSQL database and an `.env` file first; the full setup (Docker database, environment,
  migrations, seed, tests) is in [`apps/api/README.md`](apps/api/README.md).
- Students register themselves; lecturer accounts are created by hand, see
  [Lecturer accounts](apps/api/README.md#lecturer-accounts).
- Emails are only logged until `SMTP_USER` / `SMTP_PASS` are set in `apps/api/.env`; their buttons link to
  `FRONTEND_ORIGIN` (the web app's address).
- The web app's pages and conventions are in [`apps/web/README.md`](apps/web/README.md).
