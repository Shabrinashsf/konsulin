import { Badge, type Tone } from "./ui";
import type {
  ConsultationView,
  DeadlineStatus,
  InvitationStatus,
  RevisionStatus,
} from "../lib/types";

const make =
  <K extends string>(map: Record<K, [string, Tone]>) =>
  ({ value }: { value: K }) => {
    const [label, tone] = map[value];
    return <Badge tone={tone}>{label}</Badge>;
  };

export const consultationLabel: Record<ConsultationView, [string, Tone]> = {
  requested: ["Ajuan", "warning"],
  approved: ["Disetujui", "success"],
  completed: ["Selesai", "secondary"],
  rejected: ["Ditolak", "danger"],
  cancelled: ["Dibatalkan", "danger"],
  expired: ["Kedaluwarsa", "secondary"],
};
export const ConsultationBadge = make(consultationLabel);
export const InvitationBadge = make<InvitationStatus>({
  pending: ["Menunggu", "warning"],
  accepted: ["Diterima", "success"],
  declined: ["Ditolak", "danger"],
  revoked: ["Ditarik", "secondary"],
  expired: ["Kedaluwarsa", "secondary"],
});
export const DeadlineBadge = make<DeadlineStatus>({
  none: ["Tanpa deadline", "secondary"],
  upcoming: ["Belum dikumpulkan", "info"],
  submitted: ["Tepat waktu", "success"],
  late: ["Terlambat", "orange"],
  overdue: ["Lewat deadline", "danger"],
});
export const RevisionBadge = make<RevisionStatus>({
  open: ["Belum dikerjakan", "warning"],
  addressed: ["Menunggu review", "info"],
  verified: ["Terverifikasi", "success"],
  reopened: ["Perlu perbaikan ulang", "danger"],
});
export const ModeBadge = ({ mode }: { mode: "offline" | "online" }) => (
  <Badge tone="navy" icon={mode === "online" ? "videocam" : "location_on"}>
    {mode === "online" ? "Online" : "Offline"}
  </Badge>
);
