# Monitoring module

One read-only list for the lecturer: every student they supervise, across all their projects,
with the few numbers that show who needs attention (last meeting, open revisions, deadlines).
It owns no tables; it aggregates consultation, submission and feedback data in one SQL query.

## Personas

| Persona  | Goal                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------- |
| Lecturer | Spot students who have not met for a while, have unresolved revisions, or missed a deadline, at a glance. |

## User stories

**US-09 Monitoring supervised students**

- One endpoint lists the students of the lecturer's projects with: last consultation, completed consultations,
  open revisions, overdue folders and the nearest deadline.
- Filters: project, project type, **study program, degree, cohort**, has open revisions, overdue, no consultation
  since a date. Search by name/NRP. Pagination and sorting.
- Every number follows BR-26.

## Business rules

| ID    | Rule                                                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-26 | One row per student who is still an active member of the lecturer's projects (project not deleted, account active); numbers are combined over those projects. `projectId` / `projectType` limit which projects count (`projectId` not owned → 404). See the metric table below. |

### Metrics

| Field                    | Definition                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `projects`               | The counted projects the student is in: `{ id, title, type }`, sorted by title.                                                                                                |
| `lastConsultationAt`     | `start_at` of the latest `completed` consultation, or `null`.                                                                                                                  |
| `completedConsultations` | Number of `completed` consultations. A consultation counts for its requester; on `shared` projects also for every other member who had joined before it started (`joined_at`). |
| `openRevisions`          | Revision items `open` + `reopened` in the student's own track folders and in the `shared` folders of their projects (shared folders count for every member).                   |
| `overdueFolders`         | Folders with status `overdue` (BR-24: deadline passed, no version) among the same folders.                                                                                     |
| `nearestDeadline`        | The soonest deadline still ahead among those folders without a version: `{ folderId, title, projectId, deadlineAt }`, or `null`.                                               |

Deleted folders, folders of deleted projects and projects the student has left are never counted.

## Access

| Action                     | Student | Lecturer          |
| -------------------------- | ------- | ----------------- |
| `GET /monitoring/students` | 403     | own students only |

No token → 401. A lecturer without projects gets an empty list.

## Endpoints

All responses are wrapped as `{ data, meta }`; errors are `{ statusCode, error, message, code }`.

### GET /monitoring/students (lecturer)

1. `projectId` given → must be owned and not deleted → else 404 `PROJECT_NOT_FOUND`.
2. Run one query (below) with the filters, sort and page; a second `count(*)` over the same query gives `meta.total`.
3. Each row: `id, name, nrp, email, cohortYear, studyProgram { id, name, degree }, projects, lastConsultationAt,
completedConsultations, openRevisions, overdueFolders, nearestDeadline`.

**Query parameters**

| Parameter             | Meaning                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `q`                   | name or NRP, case-insensitive; `%` and `_` matched literally                                                |
| `projectId`           | count only this project                                                                                     |
| `projectType`         | count only projects of this type                                                                            |
| `studyProgramId`      | student's study program                                                                                     |
| `degree`              | `S1` / `S2` / `S3` (from the study program name)                                                            |
| `cohortYear`          | student's cohort                                                                                            |
| `hasOpenRevisions`    | `true`: `openRevisions > 0`; `false`: `= 0`                                                                 |
| `overdue`             | `true`: `overdueFolders > 0`; `false`: `= 0`                                                                |
| `noConsultationSince` | `YYYY-MM-DD`: last completed consultation before that date 00:00 WIB, or none at all                        |
| `sort`                | `name` (default), `nrp`, `lastConsultationAt`, `completedConsultations`, `openRevisions`, `nearestDeadline` |
| `order`               | `asc` (default) / `desc`; empty values always last; ties broken by id                                       |
| `page`, `limit`       | pagination (limit ≤ 100); a page past the end returns no rows and the full total                            |

## Data and concurrency

The query in `monitoring.repository.ts` is raw SQL built with `Prisma.sql` (parameters bound, the sort column taken
from a whitelist). Its CTEs:

| CTE         | Content                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `scope`     | (student, project) pairs counted: members of the lecturer's live projects with active accounts, narrowed by `projectId` / `projectType` |
| `meetings`  | per student: latest `start_at` and count of `completed` consultations (requester, or shared member after joining)                       |
| `folders`   | per student: own track folders + shared folders of their projects (not deleted), with whether any version exists                        |
| `revisions` | per student: `open` + `reopened` items on versions of those folders                                                                     |
| `monitored` | one row per student with the profile, metrics and student filters (`q`, study program, degree, cohort)                                  |

Metric filters (`hasOpenRevisions`, `overdue`, `noConsultationSince`) apply on `monitored`. Read only; no locks.

## Emails

None.
