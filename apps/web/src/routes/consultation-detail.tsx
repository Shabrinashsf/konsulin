// US-05/US-06: GET /consultations/:id and propose / accept / reject / reschedule / cancel / complete.
import { useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Field,
  Icon,
  Input,
  Loading,
  Modal,
  PageHeader,
  Textarea,
} from "../components/ui";
import { ModeBadge } from "../components/status";
import {
  ConsultationState,
  LocationFields,
  useTimeFields,
} from "../components/consultation-bits";
import { api, errorMessage } from "../lib/api";
import { useMe } from "../lib/auth";
import { fmtDateTime, fmtLongDate, fmtRange } from "../lib/time";
import { useAction } from "../lib/use-action";
import type { Consultation, Mode } from "../lib/types";

type Dialog =
  null | "propose" | "accept" | "reject" | "reschedule" | "cancel" | "complete";

const gcal = (c: Consultation) => {
  const t = (s: string) =>
    new Date(s).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `Bimbingan: ${c.topic}`,
    dates: `${t(c.startAt!)}/${t(c.endAt!)}`,
    details: c.agenda ?? "",
    location: c.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
};

export function ConsultationDetailPage() {
  const { id = "" } = useParams();
  const me = useMe();
  const [dialog, setDialog] = useState<Dialog>(null);
  const q = useQuery({
    queryKey: ["consultations", "detail", id],
    queryFn: () => api.get<Consultation>(`/consultations/${id}`),
  });
  if (q.isLoading) return <Loading />;
  if (q.error)
    return (
      <>
        <PageHeader title="Bimbingan" back="/" />
        <Alert tone="danger" title="Bimbingan tidak ditemukan">
          {errorMessage(q.error)}
        </Alert>
      </>
    );
  const c = q.data!;
  const lecturer = me.role === "lecturer";
  const canWrite = lecturer || c.student.id === me.id; // shared project: other members only read
  const started = !!c.startAt && new Date(c.startAt) <= new Date();
  const myTurn = c.status === "requested" && c.turn === me.role && canWrite;
  const other = lecturer ? c.student.name : c.lecturer.name;
  const close = () => setDialog(null);

  const reject = () => setDialog("reject");
  const cancel = () => setDialog("cancel");

  return (
    <>
      <PageHeader
        title={c.topic}
        back={`/projects/${c.project.id}?tab=bimbingan`}
        subtitle={<span>{c.project.title}</span>}
        actions={
          <>
            <ModeBadge mode={c.mode} />
            <ConsultationState c={c} />
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <Banner
            c={c}
            lecturer={lecturer}
            canWrite={canWrite}
            myTurn={myTurn}
            started={started}
          />

          {c.status === "requested" && (
            <Card className="flex flex-col gap-4">
              {c.startAt ? (
                <div>
                  <p className="text-xs text-fg-muted">
                    Usulan{" "}
                    {c.proposedBy === "lecturer"
                      ? c.lecturer.name
                      : c.student.name}
                  </p>
                  <p className="text-title-sub font-medium">
                    {fmtRange(c.startAt, c.endAt)}
                  </p>
                  {c.location && <p className="text-fg-muted">{c.location}</p>}
                </div>
              ) : (
                <p className="text-fg-muted">
                  Tanggal diminta{" "}
                  <b className="text-fg">{fmtLongDate(c.requestedDate)}</b> ·
                  belum ada usulan jam
                </p>
              )}
              {canWrite && (
                <div className="flex flex-wrap gap-2">
                  {myTurn && c.startAt && !started && (
                    <Button icon="check" onClick={() => setDialog("accept")}>
                      Terima usulan
                    </Button>
                  )}
                  {myTurn && (
                    <Button
                      variant={c.startAt && !started ? "outline" : "primary"}
                      icon="update"
                      onClick={() => setDialog("propose")}
                    >
                      {c.startAt ? "Usulkan jam lain" : "Usulkan jam"}
                    </Button>
                  )}
                  {myTurn ? (
                    <More>
                      {lecturer ? (
                        <MenuItem icon="block" onClick={reject}>
                          Tolak ajuan
                        </MenuItem>
                      ) : (
                        <MenuItem icon="close" onClick={cancel}>
                          Batalkan ajuan
                        </MenuItem>
                      )}
                    </More>
                  ) : (
                    <Button variant="secondary" icon="close" onClick={cancel}>
                      Batalkan ajuan
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}

          {c.status === "approved" && (
            <Card className="flex flex-col gap-3">
              <p className="text-title-section font-medium">
                {fmtRange(c.startAt, c.endAt)}
              </p>
              <p className="flex items-center gap-1 text-fg-muted">
                <Icon
                  name={c.mode === "online" ? "videocam" : "location_on"}
                  className="text-[18px]"
                />
                {c.location}
              </p>
              <a
                href={gcal(c)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 self-start text-[13px] font-medium text-link"
              >
                <Icon name="calendar_add_on" className="text-[18px]" />
                Tambah ke Google Calendar
              </a>
              {canWrite && (lecturer || !started) && (
                <div className="flex flex-wrap gap-2">
                  {lecturer && started && (
                    <Button
                      icon="task_alt"
                      onClick={() => setDialog("complete")}
                    >
                      Selesaikan & isi logbook
                    </Button>
                  )}
                  {lecturer && !started && (
                    <>
                      <Button
                        variant="outline"
                        icon="edit_calendar"
                        onClick={() => setDialog("reschedule")}
                      >
                        Jadwal ulang
                      </Button>
                      <More>
                        <MenuItem icon="close" onClick={cancel}>
                          Batalkan bimbingan
                        </MenuItem>
                      </More>
                    </>
                  )}
                  {!lecturer && !started && (
                    <Button variant="secondary" icon="close" onClick={cancel}>
                      Batalkan bimbingan
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>

        <Card className="flex h-fit flex-col gap-4">
          <h2 className="text-title-sub font-medium">Detail</h2>
          <div className="flex items-center gap-2">
            <Avatar name={c.student.name} />
            <div>
              <p className="font-medium">{c.student.name}</p>
              <p className="text-xs text-fg-muted">Pengaju · {c.student.nrp}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Avatar name={c.lecturer.name} />
            <div>
              <p className="font-medium">{c.lecturer.name}</p>
              <p className="text-xs text-fg-muted">Dosen pembimbing</p>
            </div>
          </div>
          <dl className="grid gap-3 text-sm [&_dt]:text-xs [&_dt]:text-fg-muted">
            <div>
              <dt>Tanggal diminta</dt>
              <dd>{fmtLongDate(c.requestedDate)}</dd>
            </div>
            <div>
              <dt>Agenda</dt>
              <dd className="whitespace-pre-line">{c.agenda ?? "-"}</dd>
            </div>
            {c.note && (
              <div>
                <dt>Catatan mahasiswa</dt>
                <dd>{c.note}</dd>
              </div>
            )}
            <div>
              <dt>Diajukan</dt>
              <dd>{fmtDateTime(c.createdAt)}</dd>
            </div>
            <div>
              <dt>Terakhir diperbarui</dt>
              <dd>{fmtDateTime(c.updatedAt)}</dd>
            </div>
          </dl>
          <p className="text-xs text-fg-muted">
            Setiap perubahan dikirim lewat email ke {other}
            {c.project.trackMode === "shared" ? " dan anggota tim" : ""}.
          </p>
        </Card>
      </div>

      {dialog === "propose" && (
        <TimeDialog c={c} kind="propose" onClose={close} />
      )}
      {dialog === "reschedule" && (
        <TimeDialog c={c} kind="reschedule" onClose={close} />
      )}
      {dialog === "accept" && <AcceptDialog c={c} onClose={close} />}
      {dialog && ["reject", "cancel", "complete"].includes(dialog) && (
        <TextDialog
          c={c}
          kind={dialog as "reject" | "cancel" | "complete"}
          onClose={close}
        />
      )}
    </>
  );
}

const STAGES = ["Ajuan", "Disetujui", "Selesai"];

/** One banner: where the consultation stands and, in one sentence, what happens next. */
function Banner({
  c,
  lecturer,
  canWrite,
  myTurn,
  started,
}: {
  c: Consultation;
  lecturer: boolean;
  canWrite: boolean;
  myTurn: boolean;
  started: boolean;
}) {
  const dosen = c.lecturer.name,
    mhs = c.student.name;
  const [tone, title, body]: [
    "info" | "warning" | "success" | "danger",
    string,
    string?,
  ] = (() => {
    switch (c.status) {
      case "completed":
        return ["success", "Bimbingan selesai · ringkasan logbook", c.summary ?? ""];
      case "rejected":
        return ["danger", "Ajuan ditolak", c.statusReason ?? "Tanpa alasan."];
      case "cancelled":
        return ["danger", "Bimbingan dibatalkan", c.statusReason ?? "Tanpa alasan."];
      case "expired":
        return [
          "warning",
          "Ajuan kedaluwarsa: tanggalnya lewat tanpa jam yang disepakati",
        ];
    }
    if (!canWrite)
      return ["info", `Rapat tim yang diajukan ${mhs}; hanya ${mhs} dan dosen yang dapat mengubahnya`];
    if (c.status === "requested") {
      if (myTurn && !c.startAt)
        return ["warning", `Usulkan jam dan lokasi untuk ${fmtLongDate(c.requestedDate)}, atau tolak bila tidak bisa`];
      if (myTurn && started)
        return ["warning", "Jam usulan sudah lewat: usulkan jam baru"];
      if (myTurn)
        return ["warning", `${c.proposedBy === "lecturer" ? dosen : mhs} mengusulkan jam: terima, atau usulkan jam lain`];
      if (!c.startAt) return ["info", `Menunggu ${dosen} mengusulkan jam`];
      return ["info", `Menunggu ${c.turn === "lecturer" ? dosen : mhs} menanggapi usulan jam`];
    }
    // approved
    if (started)
      return lecturer
        ? ["warning", "Bimbingan sudah dimulai: setelah selesai, isi ringkasan logbook"]
        : ["info", `Menunggu ${dosen} menandai selesai`];
    return ["success", "Jadwal sudah disepakati; pengingat dikirim sehari sebelumnya"];
  })();
  const stage =
    c.status === "requested" ? 0 : c.status === "approved" ? 1 : c.status === "completed" ? 2 : -1;
  return (
    <Alert tone={tone} title={title}>
      {body && <p className="whitespace-pre-line">{body}</p>}
      {stage >= 0 && (
        <p className="mt-1 text-xs text-fg-muted">
          {STAGES.map((s, i) => (
            <span key={s}>
              {i > 0 && " › "}
              <span className={i === stage ? "font-semibold text-fg" : ""}>{s}</span>
            </span>
          ))}
        </p>
      )}
    </Alert>
  );
}

/** Rare actions live here so the main ones stand out. */
function More({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" icon="more_horiz" onClick={() => setOpen(!open)}>
        Lainnya
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 z-20 mt-1 flex min-w-52 flex-col rounded-md border border-border bg-surface p-1 shadow-overlay"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

const MenuItem = ({
  icon,
  onClick,
  children,
}: {
  icon: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-danger hover:bg-surface-muted"
  >
    <Icon name={icon} className="text-[18px]" />
    {children}
  </button>
);

function TimeDialog({
  c,
  kind,
  onClose,
}: {
  c: Consultation;
  kind: "propose" | "reschedule";
  onClose: () => void;
}) {
  const me = useMe();
  const lecturer = me.role === "lecturer";
  const time = useTimeFields(
    c.project.id,
    c.startAt
      ? c
      : {
          startAt: `${c.requestedDate}T02:00:00Z`,
          endAt: `${c.requestedDate}T03:00:00Z`,
        },
  );
  const [mode, setMode] = useState<Mode>(c.mode);
  const [location, setLocation] = useState(c.location ?? "");
  // API: a lecturer proposal needs a location when none is set yet (400 LOCATION_REQUIRED)
  const needsLocation = lecturer && !location.trim() && !c.location;
  const m = useAction(
    () =>
      api.post(`/consultations/${c.id}/${kind}`, {
        ...time.value,
        ...(lecturer
          ? { mode, location: location.trim() || undefined }
          : {}),
      }),
    {
      success:
        kind === "propose" ? "Usulan waktu terkirim" : "Jadwal diperbarui",
      onDone: onClose,
    },
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={kind === "propose" ? "Usulkan waktu" : "Jadwal ulang"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={m.isPending}
            disabled={!!time.error || needsLocation}
            onClick={() => m.mutate()}
          >
            Kirim
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">
        Pilih tanggal dari kalender (hari berhalangan dosen dicoret). Boleh di
        tanggal lain dari yang diminta.
      </p>
      {time.fields}
      {lecturer ? (
        <LocationFields
          mode={mode}
          location={location}
          onMode={setMode}
          onLocation={setLocation}
        />
      ) : (
        <p className="text-xs text-fg-muted">
          Lokasi dan mode ditentukan dosen.
        </p>
      )}
    </Modal>
  );
}

function AcceptDialog({
  c,
  onClose,
}: {
  c: Consultation;
  onClose: () => void;
}) {
  const me = useMe();
  const [location, setLocation] = useState(c.location ?? "");
  const place = location.trim();
  const m = useAction(
    () =>
      api.post(
        `/consultations/${c.id}/accept`,
        // only the lecturer may send a location, and never an empty one (400)
        me.role === "lecturer" && place && place !== c.location
          ? { location: place }
          : {},
      ),
    { success: "Bimbingan disetujui", onDone: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Terima usulan waktu?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={m.isPending}
            disabled={me.role === "lecturer" && !place && !c.location}
            onClick={() => m.mutate()}
          >
            Terima
          </Button>
        </>
      }
    >
      <p className="text-title-sub font-medium">
        {fmtRange(c.startAt, c.endAt)}
      </p>
      {me.role === "lecturer" ? (
        <Field label="Lokasi / link" required>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ruang Dosen 101"
          />
        </Field>
      ) : (
        <p className="text-fg-muted">{c.location}</p>
      )}
    </Modal>
  );
}

function TextDialog({
  c,
  kind,
  onClose,
}: {
  c: Consultation;
  kind: "reject" | "cancel" | "complete";
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const cfg = {
    reject: {
      title: "Tolak ajuan",
      label: "Alasan penolakan (dikirim ke mahasiswa)",
      required: true,
      body: { reason: text },
      btn: "Tolak ajuan",
      variant: "danger" as const,
      ok: "Ajuan ditolak",
    },
    cancel: {
      title: c.status === "approved" ? "Batalkan bimbingan" : "Batalkan ajuan",
      label: "Alasan (opsional)",
      required: false,
      body: { reason: text || null },
      btn: c.status === "approved" ? "Batalkan bimbingan" : "Batalkan ajuan",
      variant: "danger" as const,
      ok: "Bimbingan dibatalkan",
    },
    complete: {
      title: "Selesaikan bimbingan",
      label: "Ringkasan untuk logbook",
      required: true,
      body: { summary: text },
      btn: "Simpan ke logbook",
      variant: "primary" as const,
      ok: "Bimbingan selesai, logbook tersimpan",
    },
  }[kind];
  const m = useAction(
    () => api.post(`/consultations/${c.id}/${kind}`, cfg.body),
    { success: cfg.ok, onDone: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={cfg.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Kembali
          </Button>
          <Button
            variant={cfg.variant}
            loading={m.isPending}
            disabled={cfg.required && !text.trim()}
            onClick={() => m.mutate()}
          >
            {cfg.btn}
          </Button>
        </>
      }
    >
      <Field label={cfg.label} required={cfg.required}>
        <Textarea
          autoFocus
          rows={kind === "complete" ? 5 : 3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      {kind === "cancel" && c.status === "approved" && (
        <p className="text-xs text-fg-muted">
          Peserta menerima email pembatalan dengan .ics CANCEL agar jadwal
          terhapus dari kalender.
        </p>
      )}
    </Modal>
  );
}
