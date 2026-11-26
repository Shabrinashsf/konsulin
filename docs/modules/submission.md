# Submission module

Drafts are collected in **folders** (one per deliverable, optionally with a deadline). Each
upload to a folder is a new immutable **version** (v1, v2, …), so the history of a draft is
never lost and feedback always points at the exact file it was given on.

## Personas

| Persona  | Goal                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| Student  | Upload each draft in the right place, keep every version, and see what is due and when. |
| Lecturer | Organise deliverables per student or per team, set deadlines, and download any version. |

## User stories

**US-07 Submission folders and draft versions**

- A folder has a title, a description and an optional deadline; only the lecturer sets deadlines. Both students
  and the lecturer can create folders.
- Uploading a new version: a file (PDF/DOCX/ZIP, ≤ 50 MB) and a note → email E9 to the lecturer. Version numbers
  count up per folder; versions are immutable.
- On `individual` projects a folder belongs to one student and is only visible to that student and the lecturer.
- Files are downloaded through an authorised endpoint.
- Folders can be searched by title and filtered by student, has-deadline and overdue, with pagination.
- The deadline status is derived on read (BR-24). Uploading after the deadline is allowed; the version is labelled `late`.

## Business rules

| ID    | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-04 | A project type change that switches the track mode is refused once the project has folders (see the project module).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| BR-05 | `individual`: a student only sees folders of their own track. `shared`: every member sees every folder; writes follow ownership.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| BR-11 | Versions are immutable; `version_number = max + 1` within the folder, computed in a transaction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| BR-12 | Only the lecturer sets or changes a deadline (403 `LECTURER_ONLY`). `deadlineAt` is an ISO date-time with offset and must be in the future when set (400 `DEADLINE_IN_PAST`); `null` clears it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| BR-23 | `individual`: a student's folder is for themselves; the lecturer must give `studentId` of an active member (400 `STUDENT_REQUIRED` / `STUDENT_NOT_MEMBER`). `shared`: no owner (400 `STUDENT_NOT_ALLOWED`). The owner never changes. Edit/delete: the lecturer for any folder, a student only for folders they created (403 `NOT_FOLDER_CREATOR`); a student cannot delete a folder with versions (409 `FOLDER_HAS_VERSIONS`). A deleted folder hides its versions, files, feedback and revision items (404) and is not counted in monitoring. A removed student's folders stay visible to the lecturer as history; the student gets 404 and nobody can upload to them. |
| BR-24 | Deadline status, derived on read: `none` (no deadline), `submitted` (a version uploaded on or before the deadline), `late` (first version after the deadline), `upcoming` (no version, deadline ahead), `overdue` (no version, deadline passed). Every version carries `late` when uploaded after the deadline. The `overdue` filter returns `overdue` folders only.                                                                                                                                                                                                                                                                                                    |

## Deadline status

| `deadlineAt` | First version         | Now vs deadline | `deadlineStatus` |
| ------------ | --------------------- | --------------- | ---------------- |
| `null`       | –                     | –               | `none`           |
| set          | at or before deadline | –               | `submitted`      |
| set          | after deadline        | –               | `late`           |
| set          | none                  | before          | `upcoming`       |
| set          | none                  | after           | `overdue`        |

Because it is derived, moving a deadline relabels the folder and its versions immediately.

## Access

| Action                        | Student                                                  | Lecturer      |
| ----------------------------- | -------------------------------------------------------- | ------------- |
| List / view folders, versions | own track (`individual`), all (`shared`); active members | project owner |
| Download a version            | same as viewing                                          | project owner |
| Create a folder               | member, for their own track; no `studentId`/`deadlineAt` | project owner |
| Edit / delete a folder        | folder creator (delete only while it has no versions)    | project owner |
| Set a deadline                | 403 `LECTURER_ONLY`                                      | project owner |
| Upload a version              | track owner (`individual`), any member (`shared`)        | 403           |

Folder not visible (deleted, other track, removed member, other lecturer) → **404** `FOLDER_NOT_FOUND` /
`VERSION_NOT_FOUND`. Wrong role or not the creator → **403**.

## Endpoints

All responses are wrapped as `{ data }` (lists: `{ data, meta }`); errors are `{ statusCode, error, message, code }`.
Folders carry `versionCount` and `deadlineStatus`; versions carry `versionNumber`, `late`, `feedbackCount`,
`openRevisions` (`open` + `reopened` items) and the uploader.

### GET /projects/:projectId/folders

- Project visible (404). A student on an `individual` project only gets their own track.
- Filters: `q` (title), `studentId`, `hasDeadline`, `overdue`; `sort` `createdAt` (default) or `deadline`
  (no deadline last), `order` (default `desc`).

### POST /projects/:projectId/folders

1. Project visible (404). A student sending `studentId` or `deadlineAt` → 403 `LECTURER_ONLY`.
2. `deadlineAt` in the past → 400 `DEADLINE_IN_PAST`.
3. Track owner: `shared` → `null` (a `studentId` → 400 `STUDENT_NOT_ALLOWED`); `individual` → the student
   themselves, or the lecturer's `studentId` (400 `STUDENT_REQUIRED` / `STUDENT_NOT_MEMBER`).
4. Insert with `created_by` = the caller → 201.

### GET /folders/:folderId

Readable folder (404) plus `latestVersion` (or `null`).

### PATCH /folders/:folderId

1. Readable (404); a student must be the creator (403 `NOT_FOLDER_CREATOR`).
2. A student sending `deadlineAt` → 403 `LECTURER_ONLY`; a past deadline → 400 `DEADLINE_IN_PAST`.
3. Update `title`, `description` (empty clears it), `deadlineAt` (`null` clears it) → 200. `studentId` is not accepted (400).

### DELETE /folders/:folderId

1. Readable; a student must be the creator (403).
2. Transaction: **lock the folder row** → gone meanwhile → 404; a student and the folder has versions → 409
   `FOLDER_HAS_VERSIONS` → set `deleted_at` → 200. Files are kept on disk.

### GET /folders/:folderId/versions

Readable folder; versions newest first (`order` to flip), with `late`, `feedbackCount`, `openRevisions`.

### POST /folders/:folderId/versions — upload (student)

`multipart/form-data`: `file`, `note?` (≤ 2000).

```
JwtAuthGuard → RolesGuard (student) → UploadAccessGuard (folder readable, else 404)   ← before any byte is stored
→ multer: write to UPLOAD_TMP_DIR, > MAX_UPLOAD_MB → 413
→ VersionService.upload
    1. no file → 400 FILE_REQUIRED
    2. extension + magic bytes match (.pdf %PDF-, .zip PK.., .docx PK.. + word/document.xml) → else 400 INVALID_FILE_TYPE
    3. key = projects/{projectId}/folders/{folderId}/{uuid}{ext}; store it with STORAGE_DRIVER
       (local: rename into UPLOAD_DIR; r2: PutObject with size and detected type)
    4. transaction: lock folder → still live? → version_number = max + 1 → insert
       (folder deleted meanwhile → stored file removed → 404; insert fails → stored file removed)
    5. event submission.uploaded → E9 to the lecturer
→ RemoveTmpFile: the tmp file is deleted whatever happened
→ 201 version
```

- The original name (cut to 255 characters, extension kept) is stored only as `original_name`, never used as a path.
- MIME type comes from detection, not from the browser.

### GET /versions/:versionId/download

1. Version of a readable, live folder → else 404 `VERSION_NOT_FOUND`.
2. Stream the file with `Content-Type` (detected), `Content-Length` and
   `Content-Disposition: attachment; filename*=UTF-8''…` (RFC 5987).
3. The file is read with the driver recorded on the version (local disk or R2 `GetObject`); a version on R2 while the
   R2 variables are not set → 503 `STORAGE_UNAVAILABLE`.

## Emails

| Event / trigger       | Email | Recipients        |
| --------------------- | ----- | ----------------- |
| `submission.uploaded` | E9    | the lecturer only |
