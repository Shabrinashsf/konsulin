// Response shapes of the REST API (apps/api/src/modules/*/dto/*-response.dto.ts).
export type Role = "student" | "lecturer";
export type Degree = "S1" | "S2" | "S3";
export type TrackMode = "individual" | "shared";
export type ProjectType =
  | "s1_thesis_proposal"
  | "s1_thesis"
  | "s2_thesis_proposal"
  | "s2_thesis"
  | "s3_dissertation_proposal"
  | "s3_dissertation"
  | "research"
  | "publication"
  | "competition"
  | "external_project";

export const PROJECT_TYPE_RULES: Record<
  ProjectType,
  { label: string; degree: Degree | null; trackMode: TrackMode }
> = {
  s1_thesis_proposal: {
    label: "Proposal Tugas Akhir",
    degree: "S1",
    trackMode: "individual",
  },
  s1_thesis: { label: "Tugas Akhir", degree: "S1", trackMode: "individual" },
  s2_thesis_proposal: {
    label: "Proposal Tesis",
    degree: "S2",
    trackMode: "individual",
  },
  s2_thesis: { label: "Tesis", degree: "S2", trackMode: "individual" },
  s3_dissertation_proposal: {
    label: "Proposal Disertasi",
    degree: "S3",
    trackMode: "individual",
  },
  s3_dissertation: {
    label: "Disertasi",
    degree: "S3",
    trackMode: "individual",
  },
  research: { label: "Riset", degree: null, trackMode: "shared" },
  publication: { label: "Publikasi Ilmiah", degree: null, trackMode: "shared" },
  competition: { label: "Lomba", degree: null, trackMode: "shared" },
  external_project: {
    label: "Project Luar",
    degree: null,
    trackMode: "shared",
  },
};

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
export interface PersonRef {
  id: string;
  name: string;
}
export interface StudyProgram {
  id: string;
  name: string;
  degree: Degree;
}
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  nrp: string | null;
  cohortYear: number | null;
  studyProgram: StudyProgram | null;
}
export interface Student {
  id: string;
  name: string;
  nrp: string | null;
  cohortYear: number | null;
  studyProgram: StudyProgram | null;
}

export interface Project {
  id: string;
  title: string;
  description: string | null;
  type: ProjectType;
  label: string;
  requiredDegree: Degree | null;
  trackMode: TrackMode;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  lecturer: PersonRef;
  memberCount: number;
}
export interface ProjectDetail extends Project {
  summary: { memberCount: number; pendingInvitationCount: number | null };
}
export interface Member extends Student {
  joinedAt: string;
}

export type InvitationStatus =
  "pending" | "accepted" | "declined" | "revoked" | "expired";
export interface Invitation {
  id: string;
  status: InvitationStatus;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string;
  student: Student;
  project: {
    id: string;
    title: string;
    type: ProjectType;
    typeLabel: string;
    lecturer: PersonRef;
  };
}

export interface Blackout {
  id: string;
  date: string;
  reason: string | null;
  createdAt: string;
}
export interface AffectedConsultation {
  id: string;
  status: ConsultationStatus;
  topic: string;
  requestedDate: string;
  startAt: string | null;
  endAt: string | null;
  project: { id: string; title: string };
  student: PersonRef;
}
export interface DayStatus {
  date: string;
  status: "available" | "unavailable";
}

export type ConsultationStatus =
  "requested" | "approved" | "rejected" | "completed" | "cancelled";
export type ConsultationView = ConsultationStatus | "expired";
export type Party = "lecturer" | "student";
export type Mode = "offline" | "online";
export interface Consultation {
  id: string;
  status: ConsultationView;
  turn: Party | null;
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
  project: { id: string; title: string; trackMode: TrackMode };
  lecturer: PersonRef;
  student: PersonRef & { nrp: string | null };
  createdAt: string;
  updatedAt: string;
}

export type DeadlineStatus =
  "none" | "upcoming" | "submitted" | "late" | "overdue";
export interface Folder {
  id: string;
  projectId: string;
  studentId: string | null;
  createdBy: string;
  title: string;
  description: string | null;
  deadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: {
    title: string;
    type: ProjectType;
    lecturer: PersonRef & { email: string };
  };
  student: (PersonRef & { nrp: string | null }) | null;
  creator: PersonRef & { role: Role };
  versionCount: number;
  deadlineStatus: DeadlineStatus;
}
export interface Version {
  id: string;
  folderId: string;
  versionNumber: number;
  note: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploader: PersonRef;
  feedbackCount: number;
  late: boolean;
  openRevisions: number;
}
export interface FolderDetail extends Folder {
  latestVersion: Version | null;
}

export type RevisionStatus = "open" | "addressed" | "verified" | "reopened";
export interface RevisionItem {
  id: string;
  feedbackId: string;
  position: number;
  description: string;
  status: RevisionStatus;
  addressedNote: string | null;
  addressedInVersion: { id: string; versionNumber: number } | null;
  createdAt: string;
  updatedAt: string;
}
export interface Feedback {
  id: string;
  versionId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  revisionItems: RevisionItem[];
}
export interface RevisionItemContext extends RevisionItem {
  version: { id: string; versionNumber: number };
  folder: { id: string; title: string; studentId: string | null };
}

export interface MonitoredStudent {
  id: string;
  name: string;
  nrp: string;
  email: string;
  cohortYear: number;
  studyProgram: StudyProgram;
  projects: { id: string; title: string; type: ProjectType }[];
  lastConsultationAt: string | null;
  completedConsultations: number;
  openRevisions: number;
  overdueFolders: number;
  nearestDeadline: {
    folderId: string;
    title: string;
    projectId: string;
    deadlineAt: string;
  } | null;
}

/** Demo-only: the emails (E1–E11) the notification module would send. */
export interface SentEmail {
  id: string;
  code: string;
  to: string;
  subject: string;
  ics: "REQUEST" | "CANCEL" | null;
  createdAt: string;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: unknown;
}
