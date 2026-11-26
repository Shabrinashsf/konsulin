# Konsulin web

React 19 + Vite + Tailwind CSS v4 + TanStack Query + React Router. The app only talks to the REST API in `apps/api`.

```bash
pnpm dev:api     # apps/api on :3000 (see apps/api/README.md for the database and .env)
pnpm dev:web     # http://localhost:5173, Vite proxies /api → :3000
pnpm build:web   # type-check + production build into dist/
```

The API's `FRONTEND_ORIGIN` must be this app's address: CORS and every email button point at it.

## Pages

| Path                   | Who      | Page                                                                          |
| ---------------------- | -------- | ----------------------------------------------------------------------------- |
| `/login`, `/register`  | all      | sign in; students register themselves (lecturers are created in the database) |
| `/`                    | all      | Beranda: "Perlu tindakan Anda" across projects and the next 7 days            |
| `/kalender`            | all      | Kalender Bimbingan: month and agenda view of every consultation               |
| `/projects`            | all      | project list                                                                  |
| `/projects/:id?tab=…`  | all      | project detail, tabs `bimbingan` · `submission` · `logbook` · `anggota`       |
| `/consultations/:id`   | all      | one consultation: status banner, negotiation, approve, reschedule, complete   |
| `/folders/:id?versi=…` | all      | one folder: versions, feedback and revision checklist per version             |
| `/undangan`            | student  | invitations to accept or decline                                              |
| `/jadwal`              | lecturer | Hari Berhalangan (blackout dates)                                             |
| `/monitoring`          | lecturer | every supervised student with meetings, open revisions and deadlines          |

## Code

```
src/
├─ main.tsx          router and providers
├─ lib/
│  ├─ api.ts         the only place that calls the API: /api/v1, Bearer token, single-flight refresh, listAll
│  ├─ auth.tsx       session boot (refresh → me), login, logout
│  ├─ use-action.ts  mutation + toast + refetch
│  ├─ types.ts       response shapes (mirror apps/api DTOs)
│  └─ time.ts        WIB date helpers
├─ components/       ui.tsx (design system), layout, status badges, day picker, consultation and revision pieces
└─ routes/           one file per page; routes/tabs/ for the project detail tabs
```

- **Auth.** The access token lives in memory; the refresh token is the API's httpOnly cookie on `/api/v1/auth`. A 401
  triggers one `POST /auth/refresh` (single-flight per tab, `navigator.locks` across tabs, because reusing a rotated
  token revokes every session) and the request is retried once; if refresh fails the user goes back to `/login` and
  returns to the same page (query included) after signing in.
- **Lists.** Tables page through the API (`page`, `limit`). Views that count or group on the client (revisions,
  calendar, home) use `api.listAll`, which reads every page.
- **Forms** check the same limits as the API DTOs before sending (lengths, time windows, deadlines, file type and
  50 MB), so most mistakes never reach the API; errors that do come back are shown as one-line toasts with the
  API's message.
