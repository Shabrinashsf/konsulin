// In-memory "database" for the demo, saved to localStorage so a demo survives a reload.
// Seed dates are relative to today so the demo always has upcoming and past items.
import type {
  ConsultationStatus,
  Mode,
  Party,
  ProjectType,
  RevisionStatus,
  Role,
  SentEmail,
} from "../lib/types";
import { addDays, todayWIB, wibIso } from "../lib/time";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  nrp: string | null;
  cohortYear: number | null;
  studyProgramId: string | null;
  createdAt: string;
}
export interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  type: ProjectType;
  startDate: string;
  endDate: string | null;
  lecturerId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface MemberRow {
  projectId: string;
  studentId: string;
  joinedAt: string;
}
export interface InvitationRow {
  id: string;
  projectId: string;
  studentId: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
}
export interface BlackoutRow {
  id: string;
  lecturerId: string;
  date: string;
  reason: string | null;
  createdAt: string;
}
export interface ConsultationRow {
  id: string;
  projectId: string;
  studentId: string;
  lecturerId: string;
  status: ConsultationStatus;
  proposedBy: Party | null;
  mode: Mode;
  topic: string;
  agenda: string | null;
  note: string | null;
  requestedDate: string;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  statusReason: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface FolderRow {
  id: string;
  projectId: string;
  studentId: string | null;
  createdBy: string;
  title: string;
  description: string | null;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
export interface VersionRow {
  id: string;
  folderId: string;
  versionNumber: number;
  note: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string;
  createdAt: string;
}
export interface FeedbackRow {
  id: string;
  versionId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
export interface ItemRow {
  id: string;
  feedbackId: string;
  position: number;
  description: string;
  status: RevisionStatus;
  addressedNote: string | null;
  addressedInVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Db {
  sessionUserId: string | null;
  studyPrograms: { id: string; name: string }[];
  users: UserRow[];
  projects: ProjectRow[];
  members: MemberRow[];
  invitations: InvitationRow[];
  blackouts: BlackoutRow[];
  consultations: ConsultationRow[];
  folders: FolderRow[];
  versions: VersionRow[];
  feedbacks: FeedbackRow[];
  items: ItemRow[];
  emails: SentEmail[];
}

const KEY = "konsulin-demo-db-v1";
export const DEMO_PASSWORD = "Password123";

function seed(): Db {
  const T = todayWIB();
  const d = (n: number) => addDays(T, n);
  const at = (n: number, hhmm: string) => wibIso(d(n), hhmm);
  const ago = (n: number) => at(-n, "09:00");
  const u = (
    id: string,
    name: string,
    email: string,
    role: Role,
    nrp: string | null = null,
    cohortYear: number | null = null,
    studyProgramId: string | null = null,
  ): UserRow => ({
    id,
    name,
    email,
    password: DEMO_PASSWORD,
    role,
    nrp,
    cohortYear,
    studyProgramId,
    createdAt: ago(200),
  });
  const p = (
    id: string,
    title: string,
    type: ProjectType,
    lecturerId: string,
    description: string,
  ): ProjectRow => ({
    id,
    title,
    description,
    type,
    startDate: d(-90),
    endDate: d(120),
    lecturerId,
    createdAt: ago(90),
    updatedAt: ago(90),
    deletedAt: null,
  });
  const c = (
    id: string,
    projectId: string,
    studentId: string,
    status: ConsultationStatus,
    topic: string,
    requestedDate: string,
    extra: Partial<ConsultationRow> = {},
  ): ConsultationRow => ({
    id,
    projectId,
    studentId,
    lecturerId: "l-budi",
    status,
    proposedBy: null,
    mode: "offline",
    topic,
    agenda: "Diskusi progres dan kendala",
    note: null,
    requestedDate,
    startAt: null,
    endAt: null,
    location: null,
    statusReason: null,
    summary: null,
    createdAt: ago(30),
    ...extra,
    updatedAt: extra.createdAt ?? ago(30),
  });
  const ver = (
    id: string,
    folderId: string,
    n: number,
    uploaderId: string,
    name: string,
    createdAt: string,
    note: string | null = null,
  ): VersionRow => ({
    id,
    folderId,
    versionNumber: n,
    note,
    originalName: name,
    mimeType: name.endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 380_000 + n * 51_200,
    uploaderId,
    createdAt,
  });
  const item = (
    id: string,
    feedbackId: string,
    position: number,
    description: string,
    status: RevisionStatus,
    addressedInVersionId: string | null = null,
    addressedNote: string | null = null,
  ): ItemRow => ({
    id,
    feedbackId,
    position,
    description,
    status,
    addressedNote,
    addressedInVersionId,
    createdAt: ago(12),
    updatedAt: ago(5),
  });

  return {
    sessionUserId: null,
    studyPrograms: [
      { id: "sp-ti", name: "S1 Teknik Informatika" },
      { id: "sp-rpl", name: "S1 Rekayasa Perangkat Lunak" },
      { id: "sp-rka", name: "S1 Rekayasa Kecerdasan Artifisial" },
      { id: "sp-mti", name: "S2 Magister Teknik Informatika" },
      { id: "sp-dik", name: "S3 Doktor Ilmu Komputer" },
    ],
    users: [
      u("l-budi", "Dr. Budi Santoso", "budi@konsulin.test", "lecturer"),
      u("l-rina", "Dr. Rina Wulandari", "rina@konsulin.test", "lecturer"),
      u(
        "s-andi",
        "Andi Pratama",
        "andi@konsulin.test",
        "student",
        "5025221001",
        2022,
        "sp-ti",
      ),
      u(
        "s-siti",
        "Siti Rahma",
        "siti@konsulin.test",
        "student",
        "5025221002",
        2022,
        "sp-rpl",
      ),
      u(
        "s-dewi",
        "Dewi Lestari",
        "dewi@konsulin.test",
        "student",
        "5025221003",
        2022,
        "sp-ti",
      ),
      u(
        "s-fajar",
        "Fajar Nugroho",
        "fajar@konsulin.test",
        "student",
        "5025231004",
        2023,
        "sp-rka",
      ),
      u(
        "s-rizky",
        "Rizky Maulana",
        "rizky@konsulin.test",
        "student",
        "6025241005",
        2024,
        "sp-mti",
      ),
      u(
        "s-nadia",
        "Nadia Putri",
        "nadia@konsulin.test",
        "student",
        "5025231006",
        2023,
        "sp-ti",
      ),
      u(
        "s-bagus",
        "Bagus Wicaksono",
        "bagus@konsulin.test",
        "student",
        "5025231007",
        2023,
        "sp-rpl",
      ),
      u(
        "s-laras",
        "Laras Ayu",
        "laras@konsulin.test",
        "student",
        "7025241008",
        2024,
        "sp-dik",
      ),
    ],
    projects: [
      p(
        "p-ta",
        "Tugas Akhir 2026 — Kelompok A",
        "s1_thesis",
        "l-budi",
        "Bimbingan Tugas Akhir mahasiswa S1 semester genap 2026.",
      ),
      p(
        "p-fl",
        "Riset Federated Learning",
        "research",
        "l-budi",
        "Riset privasi data pada federated learning untuk data kesehatan.",
      ),
      p(
        "p-gem",
        "Gemastik 2026",
        "competition",
        "l-budi",
        "Tim lomba Gemastik divisi pengembangan perangkat lunak.",
      ),
      p(
        "p-tesis",
        "Proposal Tesis 2026",
        "s2_thesis_proposal",
        "l-budi",
        "Bimbingan proposal tesis S2.",
      ),
      p(
        "p-rina",
        "Tugas Akhir — Bimbingan Dr. Rina",
        "s1_thesis",
        "l-rina",
        "Kelompok bimbingan TA Dr. Rina.",
      ),
    ],
    members: [
      { projectId: "p-ta", studentId: "s-andi", joinedAt: ago(85) },
      { projectId: "p-ta", studentId: "s-dewi", joinedAt: ago(84) },
      { projectId: "p-fl", studentId: "s-andi", joinedAt: ago(80) },
      { projectId: "p-fl", studentId: "s-siti", joinedAt: ago(80) },
      { projectId: "p-fl", studentId: "s-rizky", joinedAt: ago(79) },
      { projectId: "p-gem", studentId: "s-fajar", joinedAt: ago(60) },
      { projectId: "p-gem", studentId: "s-siti", joinedAt: ago(60) },
      { projectId: "p-tesis", studentId: "s-rizky", joinedAt: ago(70) },
      { projectId: "p-rina", studentId: "s-siti", joinedAt: ago(70) },
    ],
    invitations: [
      {
        id: "inv-1",
        projectId: "p-ta",
        studentId: "s-bagus",
        status: "pending",
        expiresAt: at(5, "09:00"),
        respondedAt: null,
        createdAt: ago(2),
      },
      {
        id: "inv-2",
        projectId: "p-ta",
        studentId: "s-nadia",
        status: "declined",
        expiresAt: at(-3, "09:00"),
        respondedAt: ago(8),
        createdAt: ago(10),
      },
      {
        id: "inv-3",
        projectId: "p-gem",
        studentId: "s-andi",
        status: "pending",
        expiresAt: at(6, "09:00"),
        respondedAt: null,
        createdAt: ago(1),
      },
      {
        id: "inv-4",
        projectId: "p-rina",
        studentId: "s-andi",
        status: "pending",
        expiresAt: at(-2, "09:00"),
        respondedAt: null,
        createdAt: ago(9),
      },
    ],
    blackouts: [
      {
        id: "bo-1",
        lecturerId: "l-budi",
        date: d(5),
        reason: "Konferensi di luar kota",
        createdAt: ago(3),
      },
      {
        id: "bo-2",
        lecturerId: "l-budi",
        date: d(6),
        reason: "Konferensi di luar kota",
        createdAt: ago(3),
      },
      {
        id: "bo-3",
        lecturerId: "l-budi",
        date: d(12),
        reason: "Rapat senat",
        createdAt: ago(1),
      },
    ],
    consultations: [
      c("c-1", "p-ta", "s-andi", "completed", "Rumusan masalah", d(-21), {
        proposedBy: "student",
        startAt: at(-21, "10:00"),
        endAt: at(-21, "11:00"),
        location: "Ruang Dosen 101",
        summary: "Rumusan masalah disetujui. Lanjut menyusun Bab 1 lengkap.",
      }),
      c("c-2", "p-ta", "s-andi", "completed", "Review Bab 1", d(-7), {
        proposedBy: "lecturer",
        startAt: at(-7, "13:00"),
        endAt: at(-7, "14:00"),
        location: "Ruang Dosen 101",
        summary: "Latar belakang perlu data pendukung. Revisi batasan masalah.",
      }),
      c("c-3", "p-ta", "s-andi", "requested", "Metodologi penelitian", d(3), {
        proposedBy: "lecturer",
        startAt: at(3, "13:00"),
        endAt: at(3, "14:00"),
        location: "Ruang Dosen 101",
        note: "Saya sudah menyiapkan draft Bab 3.",
        createdAt: ago(1),
      }),
      c("c-4", "p-ta", "s-dewi", "requested", "Konsultasi judul", d(2), {
        note: "Mohon arahan pemilihan dataset.",
        createdAt: ago(0),
      }),
      c("c-5", "p-fl", "s-siti", "approved", "Rapat mingguan riset", d(1), {
        proposedBy: "lecturer",
        mode: "online",
        startAt: at(1, "09:00"),
        endAt: at(1, "10:00"),
        location: "https://meet.google.com/kns-demo-fl",
      }),
      c("c-6", "p-fl", "s-andi", "approved", "Eksperimen awal FedAvg", d(-1), {
        proposedBy: "student",
        startAt: at(-1, "14:00"),
        endAt: at(-1, "15:00"),
        location: "Lab Pemrograman",
      }),
      c("c-7", "p-gem", "s-fajar", "rejected", "Pembagian tugas tim", d(4), {
        statusReason: "Silakan ajukan setelah proposal lomba diunggah.",
      }),
      c(
        "c-8",
        "p-tesis",
        "s-rizky",
        "cancelled",
        "Diskusi state of the art",
        d(-3),
        { statusReason: "Mahasiswa berhalangan" },
      ),
      c("c-9", "p-ta", "s-dewi", "completed", "Pemilihan topik", d(-14), {
        proposedBy: "lecturer",
        startAt: at(-14, "10:00"),
        endAt: at(-14, "10:45"),
        location: "Ruang Dosen 101",
        summary: "Topik klasifikasi citra medis disetujui.",
      }),
      c("c-10", "p-fl", "s-rizky", "completed", "Kajian pustaka FL", d(-10), {
        proposedBy: "lecturer",
        mode: "online",
        startAt: at(-10, "15:00"),
        endAt: at(-10, "16:00"),
        location: "https://meet.google.com/kns-demo-fl",
        summary: "Kajian 15 paper; fokus pada differential privacy.",
      }),
    ],
    folders: [
      {
        id: "f-1",
        projectId: "p-ta",
        studentId: "s-andi",
        createdBy: "l-budi",
        title: "Bab 1 Pendahuluan",
        description: "Latar belakang, rumusan masalah, tujuan, batasan.",
        deadlineAt: at(-10, "23:59"),
        createdAt: ago(30),
        updatedAt: ago(30),
        deletedAt: null,
      },
      {
        id: "f-2",
        projectId: "p-ta",
        studentId: "s-andi",
        createdBy: "l-budi",
        title: "Bab 2 Tinjauan Pustaka",
        description: null,
        deadlineAt: at(5, "23:59"),
        createdAt: ago(5),
        updatedAt: ago(5),
        deletedAt: null,
      },
      {
        id: "f-3",
        projectId: "p-ta",
        studentId: "s-dewi",
        createdBy: "l-budi",
        title: "Bab 1 Pendahuluan",
        description: null,
        deadlineAt: at(-2, "23:59"),
        createdAt: ago(20),
        updatedAt: ago(20),
        deletedAt: null,
      },
      {
        id: "f-4",
        projectId: "p-fl",
        studentId: null,
        createdBy: "s-siti",
        title: "Draft Paper",
        description: "Draft paper untuk konferensi.",
        deadlineAt: null,
        createdAt: ago(25),
        updatedAt: ago(25),
        deletedAt: null,
      },
      {
        id: "f-5",
        projectId: "p-gem",
        studentId: null,
        createdBy: "l-budi",
        title: "Proposal Lomba",
        description: null,
        deadlineAt: at(-1, "12:00"),
        createdAt: ago(15),
        updatedAt: ago(15),
        deletedAt: null,
      },
      {
        id: "f-6",
        projectId: "p-tesis",
        studentId: "s-rizky",
        createdBy: "l-budi",
        title: "Proposal Tesis Bab 1–3",
        description: null,
        deadlineAt: at(10, "23:59"),
        createdAt: ago(10),
        updatedAt: ago(10),
        deletedAt: null,
      },
    ],
    versions: [
      ver("v-1", "f-1", 1, "s-andi", "Bab1-Andi.pdf", ago(15)),
      ver(
        "v-2",
        "f-1",
        2,
        "s-andi",
        "Bab1-Andi-revisi.pdf",
        ago(8),
        "Revisi sesuai feedback v1",
      ),
      ver("v-3", "f-4", 1, "s-siti", "draft-paper-fl.docx", ago(12)),
      ver("v-4", "f-5", 1, "s-fajar", "proposal-gemastik.pdf", at(0, "08:00")),
    ],
    feedbacks: [
      {
        id: "fb-1",
        versionId: "v-1",
        content:
          "Secara umum sudah baik. Perbaiki poin-poin berikut sebelum lanjut ke Bab 2.",
        createdAt: ago(12),
        updatedAt: ago(12),
      },
      {
        id: "fb-2",
        versionId: "v-3",
        content:
          "Struktur paper sudah jelas, tetapi bagian eksperimen masih kurang.",
        createdAt: ago(9),
        updatedAt: ago(9),
      },
    ],
    items: [
      item(
        "it-1",
        "fb-1",
        0,
        "Perjelas batasan masalah",
        "addressed",
        "v-2",
        "Sudah diperbaiki di subbab 1.4",
      ),
      item(
        "it-2",
        "fb-1",
        1,
        "Tambahkan data pendukung pada latar belakang",
        "verified",
        "v-2",
        "Ditambahkan data BPS 2025",
      ),
      item("it-3", "fb-1", 2, "Rapikan format sitasi (IEEE)", "open"),
      item("it-4", "fb-2", 0, "Tambahkan baseline pembanding", "open"),
      item("it-5", "fb-2", 1, "Lengkapi tabel hasil eksperimen", "open"),
    ],
    emails: [],
  };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  return seed();
}

export const db: Db = load();
export const save = () => {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full or blocked */
  }
};
export function resetDb() {
  const keepSession = db.sessionUserId;
  Object.assign(db, seed(), { sessionUserId: keepSession });
  save();
}
export const uid = () => crypto.randomUUID();
