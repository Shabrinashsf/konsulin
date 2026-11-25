// Mock of the Konsulin REST API (/api/v1). Same paths, bodies, response shapes, status codes and
// error codes as docs/modules/*.md, so the UI can switch to the real API by changing lib/api.ts only.
import {
  PROJECT_TYPE_RULES,
  type ApiErrorBody,
  type ConsultationView,
  type DeadlineStatus,
  type Degree,
  type Party,
  type ProjectType,
} from "../lib/types";
import {
  addDays,
  daysBetween,
  startOfWibDay,
  todayWIB,
  wibDate,
} from "../lib/time";
import {
  db,
  save,
  uid,
  type ConsultationRow,
  type FolderRow,
  type ItemRow,
  type ProjectRow,
  type UserRow,
  type VersionRow,
} from "./db";

export class HttpError extends Error {
  constructor(public body: ApiErrorBody) {
    super(body.message);
  }
}
const TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  413: "Payload Too Large",
  429: "Too Many Requests",
};
const fail = (
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): never => {
  throw new HttpError({
    statusCode,
    error: TEXT[statusCode],
    message,
    code,
    details,
  });
};

type Body = Record<string, any>;
interface Req {
  query: URLSearchParams;
  body: Body;
  params: Record<string, string>;
}
type Handler = (req: Req) => unknown;

// ---------- helpers ----------
const now = () => new Date();
const iso = () => now().toISOString();
const userById = (id: string) => db.users.find((u) => u.id === id)!;
const ref = (u: UserRow) => ({ id: u.id, name: u.name });
const degreeOf = (name: string) => name.slice(0, 2) as Degree;
const program = (id: string | null) => {
  const sp = db.studyPrograms.find((s) => s.id === id);
  return sp ? { ...sp, degree: degreeOf(sp.name) } : null;
};
const studentDegree = (u: UserRow) => program(u.studyProgramId)?.degree ?? null;
const studentDto = (u: UserRow) => ({
  id: u.id,
  name: u.name,
  nrp: u.nrp,
  cohortYear: u.cohortYear,
  studyProgram: program(u.studyProgramId),
});
const profile = (u: UserRow) => ({
  ...studentDto(u),
  email: u.email,
  role: u.role,
});
const bool = (v: string | null) => (v === null ? undefined : v === "true");
const required = (b: Body, keys: string[]) => {
  const missing = keys.filter(
    (k) => b[k] === undefined || b[k] === null || String(b[k]).trim() === "",
  );
  if (missing.length)
    fail(400, "VALIDATION_FAILED", `${missing.join(", ")} wajib diisi`);
};

function paginate<T>(rows: T[], q: URLSearchParams) {
  const limit = Math.min(Math.max(Number(q.get("limit")) || 10, 1), 100);
  const page = Math.max(Number(q.get("page")) || 1, 1);
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    meta: {
      page,
      limit,
      total: rows.length,
      totalPages: Math.ceil(rows.length / limit),
    },
  };
}
const by =
  <T>(f: (x: T) => string | number, order: "asc" | "desc" = "asc") =>
  (a: T, b: T) => {
    const r = f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0;
    return order === "asc" ? r : -r;
  };
const ord = (q: URLSearchParams, dflt: "asc" | "desc") =>
  (q.get("order") === "asc" || q.get("order") === "desc"
    ? q.get("order")
    : dflt) as "asc" | "desc";
const has = (hay: string | null | undefined, needle: string | null) =>
  !needle || (hay ?? "").toLowerCase().includes(needle.toLowerCase());

// ---------- auth ----------
function me(): UserRow {
  const u = db.users.find((x) => x.id === db.sessionUserId);
  if (!u) fail(401, "UNAUTHORIZED", "Sesi berakhir, silakan login kembali");
  return u!;
}
function asRole(role: "student" | "lecturer") {
  const u = me();
  if (u.role !== role)
    fail(
      403,
      "FORBIDDEN",
      role === "lecturer"
        ? "Hanya dosen yang dapat melakukan aksi ini"
        : "Hanya mahasiswa yang dapat melakukan aksi ini",
    );
  return u;
}

// ---------- emails (notification module) ----------
function email(
  code: string,
  to: string[],
  subject: string,
  ics: "REQUEST" | "CANCEL" | null = null,
) {
  for (const id of new Set(to)) {
    const u = db.users.find((x) => x.id === id);
    if (u)
      db.emails.unshift({
        id: uid(),
        code,
        to: `${u.name} <${u.email}>`,
        subject,
        ics,
        createdAt: iso(),
      });
  }
}

// ---------- projects ----------
const rules = (p: ProjectRow) => PROJECT_TYPE_RULES[p.type];
const live = (p: ProjectRow | undefined) => (p && !p.deletedAt ? p : undefined);
const isMember = (projectId: string, studentId: string) =>
  db.members.some(
    (m) => m.projectId === projectId && m.studentId === studentId,
  );
const memberIds = (projectId: string) =>
  db.members.filter((m) => m.projectId === projectId).map((m) => m.studentId);
function visibleProject(user: UserRow, id: string) {
  const p = live(db.projects.find((x) => x.id === id));
  if (
    !p ||
    (user.role === "lecturer"
      ? p.lecturerId !== user.id
      : !isMember(p.id, user.id))
  )
    fail(404, "PROJECT_NOT_FOUND", "Project tidak ditemukan");
  return p!;
}
function ownedProject(id: string) {
  const user = asRole("lecturer");
  const p = visibleProject(user, id);
  return { user, p };
}
const projectDto = (p: ProjectRow) => ({
  id: p.id,
  title: p.title,
  description: p.description,
  type: p.type,
  label: rules(p).label,
  requiredDegree: rules(p).degree,
  trackMode: rules(p).trackMode,
  startDate: p.startDate,
  endDate: p.endDate,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  lecturer: ref(userById(p.lecturerId)),
  memberCount: memberIds(p.id).length,
});
const invitationStatus = (i: (typeof db.invitations)[number]) =>
  i.status === "pending" && new Date(i.expiresAt) <= now()
    ? "expired"
    : i.status;
const livePending = (i: (typeof db.invitations)[number]) =>
  invitationStatus(i) === "pending";
const invitationDto = (i: (typeof db.invitations)[number]) => {
  const p = db.projects.find((x) => x.id === i.projectId)!;
  return {
    id: i.id,
    status: invitationStatus(i),
    expiresAt: i.expiresAt,
    respondedAt: i.respondedAt,
    createdAt: i.createdAt,
    student: studentDto(userById(i.studentId)),
    project: {
      id: p.id,
      title: p.title,
      type: p.type,
      typeLabel: rules(p).label,
      lecturer: ref(userById(p.lecturerId)),
    },
  };
};
function validateProject(b: Body, partial = false) {
  if (!partial) required(b, ["title", "type", "startDate"]);
  if (
    b.title !== undefined &&
    (String(b.title).trim().length < 3 || String(b.title).length > 200)
  )
    fail(400, "VALIDATION_FAILED", "Judul 3–200 karakter");
  if (b.type !== undefined && !(b.type in PROJECT_TYPE_RULES))
    fail(400, "VALIDATION_FAILED", "Tipe project tidak valid");
  if (b.description && String(b.description).length > 5000)
    fail(400, "VALIDATION_FAILED", "Deskripsi maksimal 5000 karakter");
}

// ---------- consultations ----------
function consultationStatus(c: ConsultationRow): ConsultationView {
  if (c.status !== "requested") return c.status;
  const datePassed = c.requestedDate < todayWIB();
  return datePassed && (!c.startAt || new Date(c.startAt) <= now())
    ? "expired"
    : "requested";
}
const turnOf = (c: ConsultationRow): Party | null =>
  consultationStatus(c) !== "requested"
    ? null
    : c.proposedBy === "lecturer"
      ? "student"
      : "lecturer";
const consultationDto = (c: ConsultationRow) => {
  const p = db.projects.find((x) => x.id === c.projectId)!;
  const s = userById(c.studentId);
  return {
    ...c,
    status: consultationStatus(c),
    turn: turnOf(c),
    project: { id: p.id, title: p.title, trackMode: rules(p).trackMode },
    lecturer: ref(userById(c.lecturerId)),
    student: { ...ref(s), nrp: s.nrp },
    projectId: undefined,
    studentId: undefined,
    lecturerId: undefined,
  };
};
function canReadConsultation(u: UserRow, c: ConsultationRow) {
  const p = live(db.projects.find((x) => x.id === c.projectId));
  if (!p) return false;
  if (u.role === "lecturer") return p.lecturerId === u.id;
  return (
    isMember(p.id, u.id) &&
    (rules(p).trackMode === "shared" || c.studentId === u.id)
  );
}
function readConsultation(id: string) {
  const u = me();
  const c = db.consultations.find((x) => x.id === id);
  if (!c || !canReadConsultation(u, c))
    fail(404, "CONSULTATION_NOT_FOUND", "Bimbingan tidak ditemukan");
  return { u, c: c! };
}
function writeConsultation(id: string) {
  const { u, c } = readConsultation(id);
  if (u.role === "student" && c.studentId !== u.id)
    fail(
      403,
      "NOT_REQUESTER",
      "Hanya mahasiswa pengaju yang dapat mengubah bimbingan ini",
    );
  return { u, c, party: u.role as Party };
}
const participants = (c: ConsultationRow) => {
  const p = db.projects.find((x) => x.id === c.projectId)!;
  return [
    c.lecturerId,
    c.studentId,
    ...(rules(p).trackMode === "shared" ? memberIds(p.id) : []),
  ];
};
const isBlackout = (lecturerId: string, date: string) =>
  db.blackouts.some((b) => b.lecturerId === lecturerId && b.date === date);
/** BR-06 / BR-20 for proposals, direct scheduling and reschedules. */
function validateTime(
  lecturerId: string,
  startAt: string,
  endAt: string,
  selfId?: string,
) {
  const s = new Date(startAt),
    e = new Date(endAt);
  if (isNaN(+s) || isNaN(+e))
    fail(400, "VALIDATION_FAILED", "Waktu mulai/selesai tidak valid");
  const minutes = (+e - +s) / 60000;
  if (minutes < 15 || minutes > 240 || wibDate(s) !== wibDate(e))
    fail(
      400,
      "INVALID_TIME_RANGE",
      "Durasi 15 menit–4 jam pada tanggal yang sama",
    );
  if (+s < +now() + 3600_000 || daysBetween(todayWIB(), wibDate(s)) > 60)
    fail(
      400,
      "OUTSIDE_BOOKING_WINDOW",
      "Waktu mulai harus 1 jam sampai 60 hari dari sekarang",
    );
  if (isBlackout(lecturerId, wibDate(s)))
    fail(400, "DATE_BLACKLISTED", "Dosen berhalangan pada tanggal tersebut");
  checkOverlap(lecturerId, startAt, endAt, selfId);
}
function checkOverlap(
  lecturerId: string,
  startAt: string,
  endAt: string,
  selfId?: string,
) {
  const clash = db.consultations.find(
    (x) =>
      x.id !== selfId &&
      x.lecturerId === lecturerId &&
      x.status === "approved" &&
      x.startAt &&
      x.endAt &&
      new Date(x.startAt) < new Date(endAt) &&
      new Date(x.endAt) > new Date(startAt),
  );
  if (clash)
    fail(
      409,
      "CONSULTATION_OVERLAP",
      "Bentrok dengan bimbingan lain yang sudah disetujui",
    );
}
function requireRequested(c: ConsultationRow) {
  const s = consultationStatus(c);
  if (s === "expired")
    fail(409, "CONSULTATION_EXPIRED", "Pengajuan sudah kedaluwarsa");
  if (s !== "requested")
    fail(
      409,
      "INVALID_TRANSITION",
      "Status bimbingan tidak memungkinkan aksi ini",
    );
}
function cancelConsultation(c: ConsultationRow, reason: string | null) {
  const wasApproved = c.status === "approved";
  Object.assign(c, {
    status: "cancelled",
    statusReason: reason,
    updatedAt: iso(),
  });
  email(
    "E7",
    participants(c),
    `Bimbingan dibatalkan: ${c.topic}`,
    wasApproved ? "CANCEL" : null,
  );
}
const isActive = (c: ConsultationRow) =>
  consultationStatus(c) === "requested" ||
  (c.status === "approved" && !!c.startAt && new Date(c.startAt) > now());

// ---------- submissions ----------
const firstVersion = (folderId: string) =>
  db.versions
    .filter((v) => v.folderId === folderId)
    .sort(by((v) => v.versionNumber))[0];
function deadlineStatus(f: FolderRow): DeadlineStatus {
  if (!f.deadlineAt) return "none";
  const first = firstVersion(f.id);
  if (first)
    return new Date(first.createdAt) <= new Date(f.deadlineAt)
      ? "submitted"
      : "late";
  return new Date(f.deadlineAt) > now() ? "upcoming" : "overdue";
}
const openItemsOf = (versionIds: string[]) =>
  db.items.filter((i) => {
    const fb = db.feedbacks.find((f) => f.id === i.feedbackId);
    return (
      fb &&
      versionIds.includes(fb.versionId) &&
      (i.status === "open" || i.status === "reopened")
    );
  }).length;
const versionDto = (v: VersionRow) => {
  const f = db.folders.find((x) => x.id === v.folderId)!;
  return {
    ...v,
    uploaderId: undefined,
    uploader: ref(userById(v.uploaderId)),
    feedbackCount: db.feedbacks.filter((x) => x.versionId === v.id).length,
    late: !!f.deadlineAt && new Date(v.createdAt) > new Date(f.deadlineAt),
    openRevisions: openItemsOf([v.id]),
  };
};
const folderDto = (f: FolderRow) => {
  const p = db.projects.find((x) => x.id === f.projectId)!;
  const lec = userById(p.lecturerId);
  const st = f.studentId ? userById(f.studentId) : null;
  const cr = userById(f.createdBy);
  return {
    id: f.id,
    projectId: f.projectId,
    studentId: f.studentId,
    createdBy: f.createdBy,
    title: f.title,
    description: f.description,
    deadlineAt: f.deadlineAt,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    project: {
      title: p.title,
      type: p.type,
      lecturer: { ...ref(lec), email: lec.email },
    },
    student: st ? { ...ref(st), nrp: st.nrp } : null,
    creator: { ...ref(cr), role: cr.role },
    versionCount: db.versions.filter((v) => v.folderId === f.id).length,
    deadlineStatus: deadlineStatus(f),
  };
};
function canReadFolder(u: UserRow, f: FolderRow) {
  const p = live(db.projects.find((x) => x.id === f.projectId));
  if (!p || f.deletedAt) return false;
  if (u.role === "lecturer") return p.lecturerId === u.id;
  return (
    isMember(p.id, u.id) &&
    (rules(p).trackMode === "shared" || f.studentId === u.id)
  );
}
function readFolder(id: string) {
  const u = me();
  const f = db.folders.find((x) => x.id === id);
  if (!f || !canReadFolder(u, f))
    fail(404, "FOLDER_NOT_FOUND", "Folder tidak ditemukan");
  return { u, f: f! };
}
function readVersion(id: string) {
  const u = me();
  const v = db.versions.find((x) => x.id === id);
  const f = v && db.folders.find((x) => x.id === v.folderId);
  if (!v || !f || !canReadFolder(u, f))
    fail(404, "VERSION_NOT_FOUND", "Versi tidak ditemukan");
  return { u, v: v!, f: f! };
}
function validateDeadline(d: unknown) {
  if (d && new Date(String(d)) <= now())
    fail(400, "DEADLINE_IN_PAST", "Deadline harus di masa depan");
}

// ---------- feedback ----------
const itemDto = (i: ItemRow) => {
  const v = i.addressedInVersionId
    ? db.versions.find((x) => x.id === i.addressedInVersionId)
    : null;
  return {
    ...i,
    addressedInVersionId: undefined,
    addressedInVersion: v ? { id: v.id, versionNumber: v.versionNumber } : null,
  };
};
const feedbackDto = (fb: (typeof db.feedbacks)[number]) => ({
  ...fb,
  revisionItems: db.items
    .filter((i) => i.feedbackId === fb.id)
    .sort(by((i) => i.position))
    .map(itemDto),
});
function readItem(id: string) {
  const u = me();
  const i = db.items.find((x) => x.id === id);
  const fb = i && db.feedbacks.find((x) => x.id === i.feedbackId);
  const v = fb && db.versions.find((x) => x.id === fb.versionId);
  const f = v && db.folders.find((x) => x.id === v.folderId);
  if (!i || !fb || !v || !f || !canReadFolder(u, f))
    fail(404, "REVISION_ITEM_NOT_FOUND", "Item revisi tidak ditemukan");
  return { u, i: i!, fb: fb!, v: v!, f: f! };
}
function readFeedback(id: string) {
  const u = asRole("lecturer");
  const fb = db.feedbacks.find((x) => x.id === id);
  const v = fb && db.versions.find((x) => x.id === fb.versionId);
  const f = v && db.folders.find((x) => x.id === v.folderId);
  if (!fb || !f || !canReadFolder(u, f))
    fail(404, "FEEDBACK_NOT_FOUND", "Feedback tidak ditemukan");
  return fb!;
}

// ---------- routes ----------
const routes: [string, string, Handler][] = [
  // identity
  [
    "GET",
    "/study-programs",
    ({ query }) => ({
      data: db.studyPrograms
        .map((s) => program(s.id)!)
        .filter((s) => !query.get("degree") || s.degree === query.get("degree"))
        .sort(by((s) => s.name)),
    }),
  ],
  [
    "POST",
    "/auth/register",
    ({ body }) => {
      required(body, [
        "name",
        "nrp",
        "email",
        "password",
        "studyProgramId",
        "cohortYear",
      ]);
      const name = String(body.name).trim(),
        email = String(body.email).trim().toLowerCase();
      if (name.length < 3 || name.length > 100)
        fail(400, "VALIDATION_FAILED", "Nama 3–100 karakter");
      if (!/^\d{10}$/.test(body.nrp))
        fail(400, "VALIDATION_FAILED", "NRP harus 10 digit angka");
      if (!/^\S+@\S+\.\S+$/.test(email))
        fail(400, "VALIDATION_FAILED", "Format email tidak valid");
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(body.password))
        fail(
          400,
          "VALIDATION_FAILED",
          "Password minimal 8 karakter dengan huruf besar, huruf kecil, dan angka",
        );
      const year = Number(body.cohortYear);
      if (!(year >= 2000 && year <= Number(todayWIB().slice(0, 4))))
        fail(400, "VALIDATION_FAILED", "Angkatan antara 2000 dan tahun ini");
      if (!program(body.studyProgramId))
        fail(400, "STUDY_PROGRAM_NOT_FOUND", "Program studi tidak ditemukan");
      if (db.users.some((u) => u.email === email))
        fail(409, "EMAIL_TAKEN", "Email sudah terdaftar");
      if (db.users.some((u) => u.nrp === body.nrp))
        fail(409, "NRP_TAKEN", "NRP sudah terdaftar");
      const u: UserRow = {
        id: uid(),
        name,
        email,
        password: body.password,
        role: "student",
        nrp: body.nrp,
        cohortYear: year,
        studyProgramId: body.studyProgramId,
        createdAt: iso(),
      };
      db.users.push(u);
      return { data: profile(u) };
    },
  ],
  [
    "POST",
    "/auth/login",
    ({ body }) => {
      const u = db.users.find(
        (x) =>
          x.email ===
          String(body.email ?? "")
            .trim()
            .toLowerCase(),
      );
      if (!u || u.password !== body.password)
        fail(401, "INVALID_CREDENTIALS", "Email atau password salah");
      db.sessionUserId = u!.id;
      return { data: { accessToken: `demo.${u!.id}` } };
    },
  ],
  [
    "POST",
    "/auth/refresh",
    () => {
      me();
      return { data: { accessToken: `demo.${db.sessionUserId}` } };
    },
  ],
  [
    "POST",
    "/auth/logout",
    () => {
      db.sessionUserId = null;
      return null;
    },
  ],
  ["GET", "/auth/me", () => ({ data: profile(me()) })],
  [
    "GET",
    "/students",
    ({ query }) => {
      const lecturer = asRole("lecturer");
      let rows = db.users.filter((u) => u.role === "student");
      const pid = query.get("eligibleForProjectId");
      if (pid) {
        const p = visibleProject(lecturer, pid);
        const deg = rules(p).degree;
        rows = rows.filter(
          (u) => !isMember(p.id, u.id) && (!deg || studentDegree(u) === deg),
        );
      }
      rows = rows.filter(
        (u) =>
          (has(u.name, query.get("q")) || has(u.nrp, query.get("q"))) &&
          (!query.get("studyProgramId") ||
            u.studyProgramId === query.get("studyProgramId")) &&
          (!query.get("degree") || studentDegree(u) === query.get("degree")) &&
          (!query.get("cohortYear") ||
            String(u.cohortYear) === query.get("cohortYear")),
      );
      return paginate(rows.sort(by((u) => u.name)).map(studentDto), query);
    },
  ],

  // project
  [
    "GET",
    "/projects",
    ({ query }) => {
      const u = me();
      let rows = db.projects.filter(
        (p) =>
          !p.deletedAt &&
          (u.role === "lecturer"
            ? p.lecturerId === u.id
            : isMember(p.id, u.id)),
      );
      rows = rows.filter(
        (p) =>
          has(p.title, query.get("q")) &&
          (!query.get("type") || p.type === query.get("type")) &&
          (!query.get("degree") || rules(p).degree === query.get("degree")) &&
          (!query.get("startFrom") || p.startDate >= query.get("startFrom")!) &&
          (!query.get("startTo") || p.startDate <= query.get("startTo")!),
      );
      const sort = query.get("sort") ?? "createdAt";
      rows.sort(
        by(
          (p) =>
            sort === "title"
              ? p.title.toLowerCase()
              : sort === "startDate"
                ? p.startDate
                : p.createdAt,
          ord(query, "desc"),
        ),
      );
      return paginate(rows.map(projectDto), query);
    },
  ],
  [
    "POST",
    "/projects",
    ({ body }) => {
      const u = asRole("lecturer");
      validateProject(body);
      if (body.endDate && body.endDate < body.startDate)
        fail(
          400,
          "INVALID_DATE_RANGE",
          "Tanggal selesai sebelum tanggal mulai",
        );
      const p: ProjectRow = {
        id: uid(),
        title: String(body.title).trim(),
        description: body.description || null,
        type: body.type,
        startDate: body.startDate,
        endDate: body.endDate || null,
        lecturerId: u.id,
        createdAt: iso(),
        updatedAt: iso(),
        deletedAt: null,
      };
      db.projects.push(p);
      return { data: projectDto(p) };
    },
  ],
  [
    "GET",
    "/projects/:projectId",
    ({ params }) => {
      const u = me();
      const p = visibleProject(u, params.projectId);
      const pending = db.invitations.filter(
        (i) => i.projectId === p.id && livePending(i),
      ).length;
      return {
        data: {
          ...projectDto(p),
          summary: {
            memberCount: memberIds(p.id).length,
            pendingInvitationCount: u.role === "lecturer" ? pending : null,
          },
        },
      };
    },
  ],
  [
    "PATCH",
    "/projects/:projectId",
    ({ params, body }) => {
      const { p } = ownedProject(params.projectId);
      validateProject(body, true);
      if (body.type && body.type !== p.type) {
        const hasPending = db.invitations.some(
          (i) => i.projectId === p.id && livePending(i),
        );
        const modeChanges =
          PROJECT_TYPE_RULES[body.type as ProjectType].trackMode !==
          rules(p).trackMode;
        const hasFolders = db.folders.some(
          (f) => f.projectId === p.id && !f.deletedAt,
        );
        if (memberIds(p.id).length || hasPending || (modeChanges && hasFolders))
          fail(
            409,
            "PROJECT_TYPE_LOCKED",
            "Tipe project terkunci karena sudah ada anggota, undangan aktif, atau folder",
          );
      }
      const start = body.startDate ?? p.startDate,
        end = body.endDate === undefined ? p.endDate : body.endDate;
      if (end && end < start)
        fail(
          400,
          "INVALID_DATE_RANGE",
          "Tanggal selesai sebelum tanggal mulai",
        );
      Object.assign(p, {
        title: body.title?.trim() ?? p.title,
        description:
          body.description === undefined
            ? p.description
            : body.description || null,
        type: body.type ?? p.type,
        startDate: start,
        endDate: end || null,
        updatedAt: iso(),
      });
      return { data: projectDto(p) };
    },
  ],
  [
    "DELETE",
    "/projects/:projectId",
    ({ params }) => {
      const { p } = ownedProject(params.projectId);
      p.deletedAt = iso();
      db.consultations
        .filter((c) => c.projectId === p.id && isActive(c))
        .forEach((c) =>
          cancelConsultation(c, "Project telah dihapus oleh dosen"),
        );
      return null;
    },
  ],
  [
    "GET",
    "/projects/:projectId/members",
    ({ params, query }) => {
      const p = visibleProject(me(), params.projectId);
      const rows = db.members
        .filter((m) => m.projectId === p.id)
        .map((m) => ({
          ...studentDto(userById(m.studentId)),
          joinedAt: m.joinedAt,
        }))
        .filter(
          (m) => has(m.name, query.get("q")) || has(m.nrp, query.get("q")),
        )
        .sort(by((m) => m.name));
      return paginate(rows, query);
    },
  ],
  [
    "DELETE",
    "/projects/:projectId/members/:studentId",
    ({ params }) => {
      const { p } = ownedProject(params.projectId);
      const idx = db.members.findIndex(
        (m) => m.projectId === p.id && m.studentId === params.studentId,
      );
      if (idx < 0)
        fail(404, "MEMBER_NOT_FOUND", "Mahasiswa bukan anggota project");
      db.members.splice(idx, 1);
      db.consultations
        .filter(
          (c) =>
            c.projectId === p.id &&
            c.studentId === params.studentId &&
            isActive(c),
        )
        .forEach((c) =>
          cancelConsultation(c, "Mahasiswa tidak lagi menjadi anggota project"),
        );
      return null;
    },
  ],
  [
    "GET",
    "/projects/:projectId/invitations",
    ({ params, query }) => {
      const { p } = ownedProject(params.projectId);
      const rows = db.invitations
        .filter(
          (i) =>
            i.projectId === p.id &&
            (!query.get("status") ||
              invitationStatus(i) === query.get("status")),
        )
        .sort(by((i) => i.createdAt, "desc"))
        .map(invitationDto);
      return paginate(rows, query);
    },
  ],
  [
    "POST",
    "/projects/:projectId/invitations",
    ({ params, body }) => {
      const { p } = ownedProject(params.projectId);
      const s = db.users.find(
        (u) => u.id === body.studentId && u.role === "student",
      );
      if (!s) fail(404, "STUDENT_NOT_FOUND", "Mahasiswa tidak ditemukan");
      const deg = rules(p).degree;
      if (deg && studentDegree(s!) !== deg)
        fail(
          400,
          "DEGREE_MISMATCH",
          `Tipe ${rules(p).label} hanya untuk mahasiswa ${deg}`,
        );
      if (isMember(p.id, s!.id))
        fail(409, "ALREADY_MEMBER", "Mahasiswa sudah menjadi anggota");
      const pairs = db.invitations.filter(
        (i) =>
          i.projectId === p.id &&
          i.studentId === s!.id &&
          i.status === "pending",
      );
      if (pairs.some(livePending))
        fail(
          409,
          "INVITATION_ALREADY_PENDING",
          "Masih ada undangan aktif untuk mahasiswa ini",
        );
      pairs.forEach((i) => {
        i.status = "revoked";
      });
      const inv = {
        id: uid(),
        projectId: p.id,
        studentId: s!.id,
        status: "pending" as const,
        expiresAt: new Date(+now() + 7 * 86_400_000).toISOString(),
        respondedAt: null,
        createdAt: iso(),
      };
      db.invitations.push(inv);
      email("E1", [s!.id], `Undangan bergabung ke project ${p.title}`);
      return { data: invitationDto(inv) };
    },
  ],
  [
    "DELETE",
    "/projects/:projectId/invitations/:invitationId",
    ({ params }) => {
      const { p } = ownedProject(params.projectId);
      const inv = db.invitations.find(
        (i) => i.id === params.invitationId && i.projectId === p.id,
      );
      if (!inv) fail(404, "INVITATION_NOT_FOUND", "Undangan tidak ditemukan");
      if (invitationStatus(inv!) === "expired")
        fail(409, "INVITATION_EXPIRED", "Undangan sudah kedaluwarsa");
      if (inv!.status !== "pending")
        fail(409, "INVITATION_NOT_PENDING", "Undangan sudah tidak pending");
      inv!.status = "revoked";
      return { data: invitationDto(inv!) };
    },
  ],
  [
    "GET",
    "/invitations/me",
    ({ query }) => {
      const u = asRole("student");
      const rows = db.invitations
        .filter(
          (i) =>
            i.studentId === u.id &&
            live(db.projects.find((p) => p.id === i.projectId)) &&
            (!query.get("status") ||
              invitationStatus(i) === query.get("status")),
        )
        .sort(by((i) => i.createdAt, "desc"))
        .map(invitationDto);
      return paginate(rows, query);
    },
  ],
  [
    "POST",
    "/invitations/:invitationId/respond",
    ({ params, body }) => {
      const u = asRole("student");
      const inv = db.invitations.find(
        (i) => i.id === params.invitationId && i.studentId === u.id,
      );
      if (!inv || !live(db.projects.find((p) => p.id === inv.projectId)))
        fail(404, "INVITATION_NOT_FOUND", "Undangan tidak ditemukan");
      if (body.action !== "accept" && body.action !== "decline")
        fail(400, "VALIDATION_FAILED", "action harus accept atau decline");
      if (invitationStatus(inv!) === "expired")
        fail(409, "INVITATION_EXPIRED", "Undangan sudah kedaluwarsa");
      if (inv!.status !== "pending")
        fail(409, "INVITATION_NOT_PENDING", "Undangan sudah dijawab");
      Object.assign(inv!, {
        status: body.action === "accept" ? "accepted" : "declined",
        respondedAt: iso(),
      });
      if (body.action === "accept")
        db.members.push({
          projectId: inv!.projectId,
          studentId: u.id,
          joinedAt: iso(),
        });
      return { data: invitationDto(inv!) };
    },
  ],

  // schedule
  [
    "GET",
    "/me/blackout-dates",
    ({ query }) => {
      const u = asRole("lecturer");
      const rows = db.blackouts
        .filter(
          (b) =>
            b.lecturerId === u.id &&
            (!query.get("from") || b.date >= query.get("from")!) &&
            (!query.get("to") || b.date <= query.get("to")!),
        )
        .sort(by((b) => b.date, ord(query, "desc")))
        .map(({ lecturerId: _, ...b }) => b);
      return paginate(rows, query);
    },
  ],
  [
    "POST",
    "/me/blackout-dates",
    ({ body }) => {
      const u = asRole("lecturer");
      required(body, ["from", "to"]);
      const span = daysBetween(body.from, body.to);
      if (span < 0 || span > 89)
        fail(
          400,
          "INVALID_DATE_RANGE",
          "Rentang tanggal tidak valid (maksimal 90 hari)",
        );
      if (body.from < todayWIB())
        fail(400, "DATE_IN_PAST", "Tanggal tidak boleh di masa lalu");
      const inRange = (d: string) => d >= body.from && d <= body.to;
      const affected = db.consultations.filter((c) => {
        const p = live(db.projects.find((x) => x.id === c.projectId));
        if (!p || c.lecturerId !== u.id) return false;
        if (c.status === "approved")
          return (
            !!c.startAt &&
            new Date(c.startAt) > now() &&
            inRange(wibDate(c.startAt))
          );
        if (consultationStatus(c) !== "requested") return false;
        return c.startAt
          ? inRange(wibDate(c.startAt))
          : inRange(c.requestedDate);
      });
      const brief = (c: ConsultationRow) => ({
        id: c.id,
        status: c.status,
        topic: c.topic,
        requestedDate: c.requestedDate,
        startAt: c.startAt,
        endAt: c.endAt,
        project: {
          id: c.projectId,
          title: db.projects.find((p) => p.id === c.projectId)!.title,
        },
        student: ref(userById(c.studentId)),
      });
      if (affected.length && body.cancelConsultations !== true)
        fail(
          409,
          "BLACKOUT_HAS_CONSULTATION",
          "Ada bimbingan aktif pada rentang tanggal ini",
          { consultations: affected.map(brief) },
        );
      const cancelled = affected.map((c) => {
        const b = brief(c);
        cancelConsultation(c, "Dosen berhalangan pada tanggal tersebut");
        return b;
      });
      const created: string[] = [],
        skipped: string[] = [];
      for (let i = 0; i <= span; i++) {
        const date = addDays(body.from, i);
        if (isBlackout(u.id, date)) skipped.push(date);
        else {
          db.blackouts.push({
            id: uid(),
            lecturerId: u.id,
            date,
            reason: body.reason || null,
            createdAt: iso(),
          });
          created.push(date);
        }
      }
      return { data: { created, skipped, cancelledConsultations: cancelled } };
    },
  ],
  [
    "DELETE",
    "/me/blackout-dates",
    ({ query }) => {
      const u = asRole("lecturer");
      const from = query.get("from")!,
        to = query.get("to")!;
      const span = from && to ? daysBetween(from, to) : -1;
      if (span < 0 || span > 89)
        fail(
          400,
          "INVALID_DATE_RANGE",
          "Rentang tanggal tidak valid (maksimal 90 hari)",
        );
      const gone = db.blackouts.filter(
        (b) => b.lecturerId === u.id && b.date >= from && b.date <= to,
      );
      db.blackouts = db.blackouts.filter((b) => !gone.includes(b));
      return { data: { deleted: gone.map((b) => b.date).sort() } };
    },
  ],
  [
    "DELETE",
    "/me/blackout-dates/:id",
    ({ params }) => {
      const u = asRole("lecturer");
      const b = db.blackouts.find(
        (x) => x.id === params.id && x.lecturerId === u.id,
      );
      if (!b)
        fail(404, "BLACKOUT_NOT_FOUND", "Tanggal blackout tidak ditemukan");
      db.blackouts = db.blackouts.filter((x) => x !== b);
      const { lecturerId: _, ...row } = b!;
      return { data: row };
    },
  ],
  [
    "GET",
    "/projects/:projectId/available-days",
    ({ params, query }) => {
      const p = visibleProject(me(), params.projectId);
      const from = query.get("from")!,
        to = query.get("to")!;
      const span = from && to ? daysBetween(from, to) : -1;
      if (span < 0 || span > 41)
        fail(400, "INVALID_DATE_RANGE", "Rentang maksimal 42 hari");
      const today = todayWIB(),
        last = addDays(today, 60);
      return {
        data: Array.from({ length: span + 1 }, (_, i) => {
          const date = addDays(from, i);
          return {
            date,
            status:
              date >= today && date <= last && !isBlackout(p.lecturerId, date)
                ? "available"
                : "unavailable",
          };
        }),
      };
    },
  ],

  // consultation
  [
    "GET",
    "/consultations",
    ({ query }) => {
      const u = me();
      const rows = db.consultations
        .filter((c) => canReadConsultation(u, c))
        .filter((c) => {
          const sortAt =
            c.startAt ?? startOfWibDay(c.requestedDate).toISOString();
          return (
            (!query.get("status") ||
              consultationStatus(c) === query.get("status")) &&
            (!query.get("projectId") ||
              c.projectId === query.get("projectId")) &&
            (!query.get("from") || wibDate(sortAt) >= query.get("from")!) &&
            (!query.get("to") || wibDate(sortAt) <= query.get("to")!)
          );
        })
        .sort(
          by(
            (c) => c.startAt ?? startOfWibDay(c.requestedDate).toISOString(),
            ord(query, "asc"),
          ),
        );
      return paginate(rows.map(consultationDto), query);
    },
  ],
  [
    "GET",
    "/projects/:projectId/consultations",
    ({ params, query }) => {
      const u = me();
      const p = visibleProject(u, params.projectId);
      const rows = db.consultations
        .filter((c) => c.projectId === p.id && canReadConsultation(u, c))
        .filter(
          (c) =>
            has(c.topic, query.get("q")) &&
            (!query.get("status") ||
              consultationStatus(c) === query.get("status")) &&
            (!query.get("studentId") ||
              c.studentId === query.get("studentId")) &&
            (!query.get("from") || c.requestedDate >= query.get("from")!) &&
            (!query.get("to") || c.requestedDate <= query.get("to")!),
        );
      rows.sort(
        query.get("sort") === "date"
          ? by((c) => c.startAt ?? c.requestedDate, ord(query, "asc"))
          : by((c) => c.createdAt, ord(query, "desc")),
      );
      return paginate(rows.map(consultationDto), query);
    },
  ],
  [
    "POST",
    "/projects/:projectId/consultations",
    ({ params, body }) => {
      const u = asRole("student");
      const p = visibleProject(u, params.projectId);
      required(body, ["requestedDate", "topic", "agenda", "mode"]);
      const d = body.requestedDate;
      if (d < todayWIB() || daysBetween(todayWIB(), d) > 60)
        fail(
          400,
          "DATE_NOT_AVAILABLE",
          "Tanggal harus hari ini sampai 60 hari ke depan",
        );
      if (
        db.consultations.some(
          (c) =>
            c.projectId === p.id &&
            c.studentId === u.id &&
            consultationStatus(c) === "requested",
        )
      )
        fail(
          409,
          "CONSULTATION_PENDING_EXISTS",
          "Masih ada pengajuan bimbingan yang menunggu di project ini",
        );
      if (isBlackout(p.lecturerId, d))
        fail(
          400,
          "DATE_NOT_AVAILABLE",
          "Dosen tidak tersedia pada tanggal tersebut",
        );
      const c: ConsultationRow = {
        id: uid(),
        projectId: p.id,
        studentId: u.id,
        lecturerId: p.lecturerId,
        status: "requested",
        proposedBy: null,
        mode: body.mode,
        topic: body.topic,
        agenda: body.agenda,
        note: body.note || null,
        requestedDate: d,
        startAt: null,
        endAt: null,
        location: null,
        statusReason: null,
        summary: null,
        createdAt: iso(),
        updatedAt: iso(),
      };
      db.consultations.push(c);
      email("E2", [p.lecturerId], `Pengajuan bimbingan baru: ${c.topic}`);
      return { data: consultationDto(c) };
    },
  ],
  [
    "POST",
    "/projects/:projectId/consultations/schedule",
    ({ params, body }) => {
      const { user: u, p } = ownedProject(params.projectId);
      required(body, [
        "studentId",
        "startAt",
        "endAt",
        "topic",
        "agenda",
        "mode",
        "location",
      ]);
      if (!isMember(p.id, body.studentId))
        fail(400, "STUDENT_NOT_MEMBER", "Mahasiswa bukan anggota project");
      validateTime(u.id, body.startAt, body.endAt);
      const c: ConsultationRow = {
        id: uid(),
        projectId: p.id,
        studentId: body.studentId,
        lecturerId: u.id,
        status: "approved",
        proposedBy: "lecturer",
        mode: body.mode,
        topic: body.topic,
        agenda: body.agenda,
        note: null,
        requestedDate: wibDate(body.startAt),
        startAt: body.startAt,
        endAt: body.endAt,
        location: body.location,
        statusReason: null,
        summary: null,
        createdAt: iso(),
        updatedAt: iso(),
      };
      db.consultations.push(c);
      email(
        "E5",
        participants(c),
        `Bimbingan dijadwalkan: ${c.topic}`,
        "REQUEST",
      );
      return { data: consultationDto(c) };
    },
  ],
  [
    "GET",
    "/consultations/:id",
    ({ params }) => ({ data: consultationDto(readConsultation(params.id).c) }),
  ],
  [
    "POST",
    "/consultations/:id/propose",
    ({ params, body }) => {
      const { c, party } = writeConsultation(params.id);
      if (party === "student" && (body.location || body.mode))
        fail(400, "FIELD_NOT_ALLOWED", "Lokasi dan mode hanya diatur dosen");
      requireRequested(c);
      if (turnOf(c) !== party) fail(409, "NOT_YOUR_TURN", "Belum giliran Anda");
      required(body, ["startAt", "endAt"]);
      if (party === "lecturer" && !c.location && !body.location)
        fail(400, "LOCATION_REQUIRED", "Lokasi wajib diisi");
      validateTime(c.lecturerId, body.startAt, body.endAt, c.id);
      Object.assign(c, {
        startAt: body.startAt,
        endAt: body.endAt,
        proposedBy: party,
        location: body.location || c.location,
        mode: body.mode || c.mode,
        updatedAt: iso(),
      });
      email(
        "E11",
        participants(c).filter((id) => id !== me().id),
        `Usulan waktu bimbingan: ${c.topic}`,
      );
      return { data: consultationDto(c) };
    },
  ],
  [
    "POST",
    "/consultations/:id/accept",
    ({ params, body }) => {
      const { c, party } = writeConsultation(params.id);
      if (party === "student" && body.location)
        fail(400, "FIELD_NOT_ALLOWED", "Lokasi hanya diatur dosen");
      requireRequested(c);
      if (turnOf(c) !== party) fail(409, "NOT_YOUR_TURN", "Belum giliran Anda");
      if (!c.startAt || !c.endAt)
        fail(409, "NO_PROPOSAL", "Belum ada usulan waktu");
      if (new Date(c.startAt!) <= now())
        fail(
          409,
          "PROPOSAL_EXPIRED",
          "Usulan waktu sudah lewat, ajukan waktu baru",
        );
      const location = body.location || c.location;
      if (!location) fail(400, "LOCATION_REQUIRED", "Lokasi wajib diisi");
      checkOverlap(c.lecturerId, c.startAt!, c.endAt!, c.id);
      Object.assign(c, { status: "approved", location, updatedAt: iso() });
      email(
        "E3",
        participants(c),
        `Bimbingan disetujui: ${c.topic}`,
        "REQUEST",
      );
      return { data: consultationDto(c) };
    },
  ],
  [
    "POST",
    "/consultations/:id/reject",
    ({ params, body }) => {
      asRole("lecturer");
      const { c } = writeConsultation(params.id);
      requireRequested(c);
      if (turnOf(c) !== "lecturer")
        fail(409, "NOT_YOUR_TURN", "Belum giliran Anda");
      required(body, ["reason"]);
      Object.assign(c, {
        status: "rejected",
        statusReason: body.reason,
        updatedAt: iso(),
      });
      email(
        "E4",
        participants(c).filter((id) => id !== c.lecturerId),
        `Pengajuan bimbingan ditolak: ${c.topic}`,
      );
      return { data: consultationDto(c) };
    },
  ],
  [
    "POST",
    "/consultations/:id/reschedule",
    ({ params, body }) => {
      asRole("lecturer");
      const { c } = writeConsultation(params.id);
      if (c.status !== "approved")
        fail(
          409,
          "INVALID_TRANSITION",
          "Hanya bimbingan yang disetujui yang dapat dijadwal ulang",
        );
      required(body, ["startAt", "endAt"]);
      validateTime(c.lecturerId, body.startAt, body.endAt, c.id);
      Object.assign(c, {
        startAt: body.startAt,
        endAt: body.endAt,
        location: body.location || c.location,
        mode: body.mode || c.mode,
        updatedAt: iso(),
      });
      email(
        "E6",
        participants(c),
        `Bimbingan dijadwal ulang: ${c.topic}`,
        "REQUEST",
      );
      return { data: consultationDto(c) };
    },
  ],
  [
    "POST",
    "/consultations/:id/cancel",
    ({ params, body }) => {
      const { c } = writeConsultation(params.id);
      const s = consultationStatus(c);
      if (s === "expired")
        fail(409, "CONSULTATION_EXPIRED", "Pengajuan sudah kedaluwarsa");
      if (s === "approved" && new Date(c.startAt!) <= now())
        fail(409, "CONSULTATION_STARTED", "Bimbingan sudah dimulai");
      if (s !== "requested" && s !== "approved")
        fail(
          409,
          "INVALID_TRANSITION",
          "Status bimbingan tidak memungkinkan pembatalan",
        );
      cancelConsultation(c, body.reason || null);
      return { data: consultationDto(c) };
    },
  ],
  [
    "POST",
    "/consultations/:id/complete",
    ({ params, body }) => {
      asRole("lecturer");
      const { c } = writeConsultation(params.id);
      if (c.status !== "approved")
        fail(
          409,
          "INVALID_TRANSITION",
          "Hanya bimbingan yang disetujui yang dapat diselesaikan",
        );
      if (new Date(c.startAt!) > now())
        fail(409, "CONSULTATION_NOT_STARTED", "Bimbingan belum dimulai");
      required(body, ["summary"]);
      Object.assign(c, {
        status: "completed",
        summary: body.summary,
        updatedAt: iso(),
      });
      return { data: consultationDto(c) };
    },
  ],
  [
    "GET",
    "/projects/:projectId/logbook",
    ({ params, query }) => {
      const u = me();
      const p = visibleProject(u, params.projectId);
      const rows = db.consultations
        .filter(
          (c) =>
            c.projectId === p.id &&
            c.status === "completed" &&
            canReadConsultation(u, c) &&
            (!query.get("studentId") ||
              c.studentId === query.get("studentId")) &&
            (!query.get("from") || wibDate(c.startAt!) >= query.get("from")!) &&
            (!query.get("to") || wibDate(c.startAt!) <= query.get("to")!) &&
            (has(c.topic, query.get("q")) || has(c.summary, query.get("q"))),
        )
        .sort(by((c) => c.startAt!, "desc"));
      return paginate(rows.map(consultationDto), query);
    },
  ],

  // submission
  [
    "GET",
    "/projects/:projectId/folders",
    ({ params, query }) => {
      const u = me();
      const p = visibleProject(u, params.projectId);
      let rows = db.folders
        .filter((f) => f.projectId === p.id && canReadFolder(u, f))
        .filter(
          (f) =>
            has(f.title, query.get("q")) &&
            (!query.get("studentId") ||
              f.studentId === query.get("studentId")) &&
            (bool(query.get("hasDeadline")) === undefined ||
              !!f.deadlineAt === bool(query.get("hasDeadline"))) &&
            (query.get("overdue") !== "true" ||
              deadlineStatus(f) === "overdue"),
        );
      rows =
        query.get("sort") === "deadline"
          ? rows.sort(by((f) => f.deadlineAt ?? "9999", ord(query, "asc")))
          : rows.sort(by((f) => f.createdAt, ord(query, "desc")));
      return paginate(rows.map(folderDto), query);
    },
  ],
  [
    "POST",
    "/projects/:projectId/folders",
    ({ params, body }) => {
      const u = me();
      const p = visibleProject(u, params.projectId);
      required(body, ["title"]);
      if (u.role === "student" && (body.studentId || body.deadlineAt))
        fail(
          403,
          "LECTURER_ONLY",
          "Hanya dosen yang dapat mengatur pemilik folder atau deadline",
        );
      validateDeadline(body.deadlineAt);
      let studentId: string | null = null;
      if (rules(p).trackMode === "shared") {
        if (body.studentId)
          fail(
            400,
            "STUDENT_NOT_ALLOWED",
            "Project shared tidak memakai pemilik folder",
          );
      } else if (u.role === "student") studentId = u.id;
      else {
        if (!body.studentId)
          fail(400, "STUDENT_REQUIRED", "Pilih mahasiswa pemilik folder");
        if (!isMember(p.id, body.studentId))
          fail(400, "STUDENT_NOT_MEMBER", "Mahasiswa bukan anggota project");
        studentId = body.studentId;
      }
      const f: FolderRow = {
        id: uid(),
        projectId: p.id,
        studentId,
        createdBy: u.id,
        title: String(body.title).trim(),
        description: body.description || null,
        deadlineAt: body.deadlineAt || null,
        createdAt: iso(),
        updatedAt: iso(),
        deletedAt: null,
      };
      db.folders.push(f);
      return { data: folderDto(f) };
    },
  ],
  [
    "GET",
    "/folders/:folderId",
    ({ params }) => {
      const { f } = readFolder(params.folderId);
      const latest = db.versions
        .filter((v) => v.folderId === f.id)
        .sort(by((v) => v.versionNumber, "desc"))[0];
      return {
        data: {
          ...folderDto(f),
          latestVersion: latest ? versionDto(latest) : null,
        },
      };
    },
  ],
  [
    "PATCH",
    "/folders/:folderId",
    ({ params, body }) => {
      const { u, f } = readFolder(params.folderId);
      if (u.role === "student" && f.createdBy !== u.id)
        fail(
          403,
          "NOT_FOLDER_CREATOR",
          "Hanya pembuat folder yang dapat mengubahnya",
        );
      if (u.role === "student" && body.deadlineAt !== undefined)
        fail(403, "LECTURER_ONLY", "Hanya dosen yang dapat mengatur deadline");
      validateDeadline(body.deadlineAt);
      Object.assign(f, {
        title: body.title?.trim() || f.title,
        description:
          body.description === undefined
            ? f.description
            : body.description || null,
        deadlineAt:
          body.deadlineAt === undefined ? f.deadlineAt : body.deadlineAt,
        updatedAt: iso(),
      });
      return { data: folderDto(f) };
    },
  ],
  [
    "DELETE",
    "/folders/:folderId",
    ({ params }) => {
      const { u, f } = readFolder(params.folderId);
      if (u.role === "student" && f.createdBy !== u.id)
        fail(
          403,
          "NOT_FOLDER_CREATOR",
          "Hanya pembuat folder yang dapat menghapusnya",
        );
      if (u.role === "student" && db.versions.some((v) => v.folderId === f.id))
        fail(
          409,
          "FOLDER_HAS_VERSIONS",
          "Folder yang sudah berisi versi tidak dapat dihapus mahasiswa",
        );
      f.deletedAt = iso();
      return { data: folderDto(f) };
    },
  ],
  [
    "GET",
    "/folders/:folderId/versions",
    ({ params, query }) => {
      const { f } = readFolder(params.folderId);
      const rows = db.versions
        .filter((v) => v.folderId === f.id)
        .sort(by((v) => v.versionNumber, ord(query, "desc")));
      return paginate(rows.map(versionDto), query);
    },
  ],
  [
    "POST",
    "/folders/:folderId/versions",
    ({ params, body }) => {
      const u = asRole("student");
      const { f } = readFolder(params.folderId);
      const file = body.file as File | undefined;
      if (!file) fail(400, "FILE_REQUIRED", "File wajib diunggah");
      if (file!.size > 50 * 1_048_576)
        fail(413, "FILE_TOO_LARGE", "Ukuran file maksimal 50 MB");
      const ext = file!.name.toLowerCase().split(".").pop();
      const mime = {
        pdf: "application/pdf",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        zip: "application/zip",
      }[ext ?? ""];
      if (!mime || body.magicOk === false)
        fail(400, "INVALID_FILE_TYPE", "Hanya file PDF, DOCX, atau ZIP");
      if (body.note && String(body.note).length > 2000)
        fail(400, "VALIDATION_FAILED", "Catatan maksimal 2000 karakter");
      const n =
        Math.max(
          0,
          ...db.versions
            .filter((v) => v.folderId === f.id)
            .map((v) => v.versionNumber),
        ) + 1;
      const v: VersionRow = {
        id: uid(),
        folderId: f.id,
        versionNumber: n,
        note: body.note || null,
        originalName: file!.name.slice(0, 255),
        mimeType: mime!,
        sizeBytes: file!.size,
        uploaderId: u.id,
        createdAt: iso(),
      };
      db.versions.push(v);
      fileStore.set(v.id, file!);
      email(
        "E9",
        [db.projects.find((p) => p.id === f.projectId)!.lecturerId],
        `Versi baru diunggah: ${f.title} v${n}`,
      );
      return { data: versionDto(v) };
    },
  ],
  [
    "GET",
    "/versions/:versionId/download",
    ({ params }) => {
      const { v } = readVersion(params.versionId);
      const blob =
        fileStore.get(v.id) ??
        new Blob(
          [
            `Berkas demo Konsulin\n${v.originalName} (versi ${v.versionNumber})\n`,
          ],
          { type: "text/plain" },
        );
      return {
        blob,
        filename: fileStore.has(v.id)
          ? v.originalName
          : `${v.originalName}.txt`,
      };
    },
  ],

  // feedback
  [
    "GET",
    "/versions/:versionId/feedbacks",
    ({ params }) => {
      const { v } = readVersion(params.versionId);
      return {
        data: db.feedbacks
          .filter((fb) => fb.versionId === v.id)
          .sort(by((fb) => fb.createdAt, "desc"))
          .map(feedbackDto),
      };
    },
  ],
  [
    "POST",
    "/versions/:versionId/feedbacks",
    ({ params, body }) => {
      asRole("lecturer");
      const content = String(body.content ?? "").trim();
      const items: { description: string }[] = body.revisionItems ?? [];
      if (!content || content.length > 10_000)
        fail(400, "VALIDATION_FAILED", "Isi feedback 1–10.000 karakter");
      if (
        items.length > 50 ||
        items.some((i) => !i.description?.trim() || i.description.length > 1000)
      )
        fail(
          400,
          "VALIDATION_FAILED",
          "Maksimal 50 item, masing-masing 1–1000 karakter",
        );
      const { v, f } = readVersion(params.versionId);
      const fb = {
        id: uid(),
        versionId: v.id,
        content,
        createdAt: iso(),
        updatedAt: iso(),
      };
      db.feedbacks.push(fb);
      items.forEach((it, position) =>
        db.items.push({
          id: uid(),
          feedbackId: fb.id,
          position,
          description: it.description.trim(),
          status: "open",
          addressedNote: null,
          addressedInVersionId: null,
          createdAt: iso(),
          updatedAt: iso(),
        }),
      );
      const p = db.projects.find((x) => x.id === f.projectId)!;
      email(
        "E10",
        f.studentId ? [f.studentId] : memberIds(p.id),
        `Feedback baru: ${f.title} v${v.versionNumber}`,
      );
      return { data: feedbackDto(fb) };
    },
  ],
  [
    "PATCH",
    "/feedbacks/:feedbackId",
    ({ params, body }) => {
      const fb = readFeedback(params.feedbackId);
      if (body.revisionItems !== undefined)
        fail(400, "VALIDATION_FAILED", "Item revisi tidak dapat diubah");
      const content = String(body.content ?? "").trim();
      if (!content || content.length > 10_000)
        fail(400, "VALIDATION_FAILED", "Isi feedback 1–10.000 karakter");
      Object.assign(fb, { content, updatedAt: iso() });
      return { data: feedbackDto(fb) };
    },
  ],
  [
    "DELETE",
    "/feedbacks/:feedbackId",
    ({ params }) => {
      const fb = readFeedback(params.feedbackId);
      if (db.items.some((i) => i.feedbackId === fb.id && i.status !== "open"))
        fail(
          409,
          "FEEDBACK_HAS_PROGRESS",
          "Feedback tidak dapat dihapus karena item revisi sudah dikerjakan",
        );
      db.feedbacks = db.feedbacks.filter((x) => x !== fb);
      db.items = db.items.filter((i) => i.feedbackId !== fb.id);
      return { data: feedbackDto(fb) };
    },
  ],
  [
    "GET",
    "/projects/:projectId/revision-items",
    ({ params, query }) => {
      const u = me();
      const p = visibleProject(u, params.projectId);
      const rows = db.items
        .map((i) => {
          const fb = db.feedbacks.find((x) => x.id === i.feedbackId)!;
          const v = db.versions.find((x) => x.id === fb.versionId)!;
          const f = db.folders.find((x) => x.id === v.folderId)!;
          return { i, fb, v, f };
        })
        .filter(
          ({ i, f }) =>
            f.projectId === p.id &&
            canReadFolder(u, f) &&
            (!query.get("status") || i.status === query.get("status")) &&
            (!query.get("studentId") ||
              f.studentId === query.get("studentId")) &&
            (!query.get("folderId") || f.id === query.get("folderId")),
        )
        .sort(
          (a, b) =>
            by<typeof a>((x) => x.fb.createdAt, ord(query, "desc"))(a, b) ||
            a.i.position - b.i.position,
        )
        .map(({ i, v, f }) => ({
          ...itemDto(i),
          version: { id: v.id, versionNumber: v.versionNumber },
          folder: { id: f.id, title: f.title, studentId: f.studentId },
        }));
      return paginate(rows, query);
    },
  ],
  [
    "POST",
    "/revision-items/:itemId/address",
    ({ params, body }) => {
      const u = asRole("student");
      const { i, v, f } = readItem(params.itemId);
      if (f.studentId && f.studentId !== u.id)
        fail(403, "FORBIDDEN", "Hanya pemilik track yang dapat menandai item");
      if (i.status !== "open" && i.status !== "reopened")
        fail(
          409,
          "INVALID_REVISION_TRANSITION",
          "Item tidak dapat ditandai selesai pada status ini",
        );
      const fix = db.versions.find((x) => x.id === body.versionId);
      if (!fix || fix.folderId !== f.id)
        fail(
          400,
          "VERSION_NOT_IN_FOLDER",
          "Versi perbaikan harus di folder yang sama",
        );
      const last = i.addressedInVersionId
        ? db.versions.find((x) => x.id === i.addressedInVersionId)!
            .versionNumber
        : 0;
      if (fix!.versionNumber <= Math.max(v.versionNumber, last))
        fail(400, "VERSION_NOT_NEWER", "Versi perbaikan harus lebih baru");
      Object.assign(i, {
        status: "addressed",
        addressedInVersionId: fix!.id,
        addressedNote: body.note || null,
        updatedAt: iso(),
      });
      return { data: itemDto(i) };
    },
  ],
  [
    "POST",
    "/revision-items/:itemId/review",
    ({ params, body }) => {
      asRole("lecturer");
      const { i } = readItem(params.itemId);
      if (body.decision !== "verify" && body.decision !== "reopen")
        fail(400, "VALIDATION_FAILED", "decision harus verify atau reopen");
      if (i.status !== "addressed")
        fail(
          409,
          "INVALID_REVISION_TRANSITION",
          "Hanya item berstatus addressed yang dapat direview",
        );
      Object.assign(i, {
        status: body.decision === "verify" ? "verified" : "reopened",
        updatedAt: iso(),
      });
      return { data: itemDto(i) };
    },
  ],

  // monitoring
  [
    "GET",
    "/monitoring/students",
    ({ query }) => {
      const u = asRole("lecturer");
      let projects = db.projects.filter(
        (p) => !p.deletedAt && p.lecturerId === u.id,
      );
      if (query.get("projectId")) {
        projects = projects.filter((p) => p.id === query.get("projectId"));
        if (!projects.length)
          fail(404, "PROJECT_NOT_FOUND", "Project tidak ditemukan");
      }
      if (query.get("projectType"))
        projects = projects.filter((p) => p.type === query.get("projectType"));
      const sinceRaw = query.get("noConsultationSince");
      const ids = [...new Set(projects.flatMap((p) => memberIds(p.id)))];
      let rows = ids.map((sid) => {
        const s = userById(sid);
        const mine = projects.filter((p) => isMember(p.id, sid));
        const joined = (pid: string) =>
          db.members.find((m) => m.projectId === pid && m.studentId === sid)!
            .joinedAt;
        const done = db.consultations.filter(
          (c) =>
            c.status === "completed" &&
            mine.some((p) => p.id === c.projectId) &&
            (c.studentId === sid ||
              (rules(mine.find((p) => p.id === c.projectId)!).trackMode ===
                "shared" &&
                joined(c.projectId) <= c.startAt!)),
        );
        const folders = db.folders.filter(
          (f) =>
            !f.deletedAt &&
            mine.some((p) => p.id === f.projectId) &&
            (f.studentId === sid || f.studentId === null),
        );
        const versionIds = db.versions
          .filter((v) => folders.some((f) => f.id === v.folderId))
          .map((v) => v.id);
        const upcoming = folders
          .filter(
            (f) =>
              f.deadlineAt &&
              !firstVersion(f.id) &&
              new Date(f.deadlineAt) > now(),
          )
          .sort(by((f) => f.deadlineAt!))[0];
        return {
          id: s.id,
          name: s.name,
          nrp: s.nrp!,
          email: s.email,
          cohortYear: s.cohortYear!,
          studyProgram: program(s.studyProgramId)!,
          projects: mine
            .map((p) => ({ id: p.id, title: p.title, type: p.type }))
            .sort(by((p) => p.title)),
          lastConsultationAt:
            done
              .map((c) => c.startAt!)
              .sort()
              .at(-1) ?? null,
          completedConsultations: done.length,
          openRevisions: openItemsOf(versionIds),
          overdueFolders: folders.filter((f) => deadlineStatus(f) === "overdue")
            .length,
          nearestDeadline: upcoming
            ? {
                folderId: upcoming.id,
                title: upcoming.title,
                projectId: upcoming.projectId,
                deadlineAt: upcoming.deadlineAt!,
              }
            : null,
        };
      });
      rows = rows.filter(
        (r) =>
          (has(r.name, query.get("q")) || has(r.nrp, query.get("q"))) &&
          (!query.get("studyProgramId") ||
            r.studyProgram.id === query.get("studyProgramId")) &&
          (!query.get("degree") ||
            r.studyProgram.degree === query.get("degree")) &&
          (!query.get("cohortYear") ||
            String(r.cohortYear) === query.get("cohortYear")) &&
          (bool(query.get("hasOpenRevisions")) === undefined ||
            r.openRevisions > 0 === bool(query.get("hasOpenRevisions"))) &&
          (bool(query.get("overdue")) === undefined ||
            r.overdueFolders > 0 === bool(query.get("overdue"))) &&
          (!sinceRaw ||
            !r.lastConsultationAt ||
            new Date(r.lastConsultationAt) < startOfWibDay(sinceRaw)),
      );
      const sort = query.get("sort") ?? "name";
      const key = (r: (typeof rows)[number]): string | number | null => {
        const keys: Record<string, string | number | null> = {
          name: r.name.toLowerCase(),
          nrp: r.nrp,
          lastConsultationAt: r.lastConsultationAt,
          completedConsultations: r.completedConsultations,
          openRevisions: r.openRevisions,
          nearestDeadline: r.nearestDeadline?.deadlineAt ?? null,
        };
        return sort in keys ? keys[sort] : keys.name;
      };
      const dir = ord(query, "asc") === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        // empty values always last, ties broken by id
        const ka = key(a),
          kb = key(b);
        if (ka === kb) return a.id.localeCompare(b.id);
        if (ka === null) return 1;
        if (kb === null) return -1;
        return (ka < kb ? -1 : 1) * dir;
      });
      return paginate(rows, query);
    },
  ],

  // demo only: the notification outbox
  [
    "GET",
    "/demo/emails",
    ({ query }) => {
      const u = me();
      return paginate(
        db.emails.filter((e) => e.to.includes(`<${u.email}>`)),
        query,
      );
    },
  ],
];

/** Uploaded files live only for this browser session; metadata is persisted. */
const fileStore = new Map<string, File>();

const compiled = routes.map(([method, path, handler]) => {
  const keys: string[] = [];
  const re = new RegExp(
    `^${path.replace(/:(\w+)/g, (_, k) => {
      keys.push(k);
      return "([^/]+)";
    })}$`,
  );
  return { method, re, keys, handler };
});

export async function handle(
  method: string,
  url: string,
  body?: unknown,
): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 150 + Math.random() * 200)); // network-ish latency
  const [path, qs] = url.split("?");
  for (const r of compiled) {
    const m = r.method === method && path.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(
      r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]),
    );
    let b = (body ?? {}) as Body;
    if (body instanceof FormData) {
      const file = body.get("file");
      b = {
        note: body.get("note") ?? undefined,
        file: file instanceof File ? file : undefined,
      };
      if (b.file) b.magicOk = await magicOk(b.file);
    }
    try {
      return r.handler({ query: new URLSearchParams(qs), body: b, params });
    } finally {
      save();
    }
  }
  return fail(404, "NOT_FOUND", `Endpoint ${method} ${path} tidak ada`);
}

/** Extension must match the content: %PDF- for .pdf, PK.. for .zip/.docx. */
async function magicOk(file: File) {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "pdf") return String.fromCharCode(...head) === "%PDF-";
  if (ext === "zip" || ext === "docx")
    return head[0] === 0x50 && head[1] === 0x4b;
  return false;
}
