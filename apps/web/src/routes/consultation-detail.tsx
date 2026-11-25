// US-05/US-06: GET /consultations/:id and propose / accept / reject / reschedule / cancel / complete.
import { useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Icon,
  Input,
  Loading,
  Modal,
  PageHeader,
  Textarea,
  Track,
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

  const steps = [
    {
      title: "Ajuan",
      subtitle:
        c.status === "requested"
          ? `Giliran ${c.turn === "lecturer" ? "dosen" : "mahasiswa"}`
          : c.status === "rejected"
            ? "Ditolak dosen"
            : c.status === "expired"
              ? "Kedaluwarsa"
              : `Diminta ${fmtLongDate(c.requestedDate)}`,
      state:
        c.status === "requested"
          ? ("active" as const)
          : c.status === "rejected" || c.status === "expired"
            ? ("rejected" as const)
            : ("done" as const),
    },
    {
      title: "Disetujui",
      subtitle:
        c.status === "approved" || c.status === "completed"
          ? fmtRange(c.startAt, c.endAt)
          : c.status === "cancelled"
            ? "Dibatalkan"
            : "-",
      state:
        c.status === "approved"
          ? ("active" as const)
          : c.status === "completed"
            ? ("done" as const)
            : c.status === "cancelled"
              ? ("rejected" as const)
              : ("pending" as const),
    },
    {
      title: "Selesai & logbook",
      subtitle: c.status === "completed" ? "Ringkasan masuk logbook" : "-",
      state:
        c.status === "completed" ? ("done" as const) : ("pending" as const),
    },
  ];

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
          <Card>
            <Track steps={steps} />
          </Card>
          <NextStep
            c={c}
            lecturer={lecturer}
            canWrite={canWrite}
            myTurn={myTurn}
            started={started}
          />

          {c.status === "requested" && (
            <Card className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Icon name="schedule" className="text-[24px] text-primary" />
                <h2 className="flex-1 text-title-sub font-medium">
                  Jam bimbingan
                </h2>
                {myTurn ? (
                  <Badge tone="warning" icon="touch_app">
                    Giliran Anda
                  </Badge>
                ) : (
                  <span className="text-xs text-fg-muted">
                    Menunggu{" "}
                    {c.turn === "lecturer" ? c.lecturer.name : c.student.name}
                  </span>
                )}
              </div>
              {c.startAt ? (
                <div className="rounded-lg bg-surface-muted p-4">
                  <p className="text-xs text-fg-muted">
                    Diusulkan oleh{" "}
                    {c.proposedBy === "lecturer"
                      ? c.lecturer.name
                      : c.student.name}
                  </p>
                  <p className="text-title-sub font-medium">
                    {fmtRange(c.startAt, c.endAt)}
                  </p>
                  {c.location && <p className="text-fg-muted">{c.location}</p>}
                  {started && (
                    <p className="mt-1 text-xs text-danger">
                      Waktu usulan sudah lewat — ajukan waktu baru.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-fg-muted">
                  Belum ada usulan jam. Mahasiswa meminta tanggal{" "}
                  <b className="text-fg">{fmtLongDate(c.requestedDate)}</b>
                  {lecturer
                    ? "; usulkan jam dan lokasi."
                    : "; menunggu dosen mengusulkan jam."}
                </p>
              )}
              {canWrite && (
                <div className="flex flex-col gap-2">
                  {myTurn && c.startAt && !started && (
                    <ActionRow desc="Jam ini menjadi jadwal tetap. Semua peserta mendapat undangan kalender lewat email.">
                      <Button icon="check" onClick={() => setDialog("accept")}>
                        Terima usulan
                      </Button>
                    </ActionRow>
                  )}
                  {myTurn && (
                    <ActionRow
                      desc={`Kirim jam${lecturer ? " dan lokasi" : ""} lain. Ajuan tetap berjalan dan giliran berpindah ke ${other}.`}
                    >
                      <Button
                        variant={c.startAt && !started ? "outline" : "primary"}
                        icon="update"
                        onClick={() => setDialog("propose")}
                      >
                        {c.startAt ? "Usulkan jam lain" : "Usulkan jam"}
                      </Button>
                    </ActionRow>
                  )}
                  {myTurn && lecturer && (
                    <ActionRow desc="Tutup ajuan karena tidak bisa dipenuhi, dengan alasan. Tidak ada pertemuan; mahasiswa bisa mengirim ajuan baru.">
                      <Button
                        variant="subtle-danger"
                        icon="block"
                        onClick={() => setDialog("reject")}
                      >
                        Tolak ajuan
                      </Button>
                    </ActionRow>
                  )}
                  {(!lecturer || !myTurn) && (
                    <ActionRow
                      desc={
                        lecturer
                          ? "Tutup ajuan saat sedang menunggu mahasiswa, mis. topiknya sudah dibahas. Mahasiswa diberi tahu lewat email."
                          : "Tarik ajuan Anda sendiri bila sudah tidak perlu. Tidak ada pertemuan; Anda bisa mengajukan lagi kapan saja."
                      }
                    >
                      <Button
                        variant="secondary"
                        icon="close"
                        onClick={() => setDialog("cancel")}
                      >
                        Batalkan ajuan
                      </Button>
                    </ActionRow>
                  )}
                </div>
              )}
            </Card>
          )}

          {c.status === "approved" && (
            <Card className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Icon
                  name="event_available"
                  className="text-[24px] text-success"
                />
                <h2 className="text-title-sub font-medium">
                  Jadwal disepakati
                </h2>
              </div>
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
              <div className="flex flex-col gap-2">
                {lecturer && started && (
                  <ActionRow desc="Tulis ringkasan hasil pertemuan. Ringkasan ini masuk ke Logbook project sebagai catatan resmi bimbingan.">
                    <Button
                      icon="task_alt"
                      onClick={() => setDialog("complete")}
                    >
                      Selesaikan & isi logbook
                    </Button>
                  </ActionRow>
                )}
                {lecturer && !started && (
                  <ActionRow desc="Pindahkan ke jam lain tanpa ajuan ulang. Undangan kalender peserta ikut berpindah.">
                    <Button
                      variant="outline"
                      icon="edit_calendar"
                      onClick={() => setDialog("reschedule")}
                    >
                      Jadwal ulang
                    </Button>
                  </ActionRow>
                )}
                {canWrite && !started && (
                  <ActionRow
                    desc={`Batalkan pertemuan yang sudah disetujui; jadwal dihapus dari kalender peserta.${lecturer ? "" : " Untuk pindah jam, batalkan lalu kirim ajuan baru."}`}
                  >
                    <Button
                      variant="secondary"
                      icon="close"
                      onClick={() => setDialog("cancel")}
                    >
                      Batalkan bimbingan
                    </Button>
                  </ActionRow>
                )}
              </div>
              {lecturer && !started && (
                <p className="text-xs text-fg-muted">
                  “Selesaikan & isi logbook” muncul setelah jam mulai lewat.
                </p>
              )}
            </Card>
          )}

          {c.status === "completed" && (
            <Alert tone="success" title="Ringkasan bimbingan (logbook)">
              {c.summary}
            </Alert>
          )}
          {(c.status === "rejected" || c.status === "cancelled") && (
            <Alert
              tone="danger"
              title={c.status === "rejected" ? "Ajuan ditolak" : "Dibatalkan"}
            >
              {c.statusReason ?? "Tanpa alasan."}
            </Alert>
          )}
          {c.status === "expired" && (
            <Alert tone="warning" title="Ajuan kedaluwarsa">
              Tanggal yang diminta sudah lewat tanpa waktu yang disepakati.
              Mahasiswa dapat mengajukan lagi.
            </Alert>
          )}
          {c.project.trackMode === "shared" && (
            <Alert tone="info">
              Project shared: bimbingan ini adalah rapat tim — semua anggota
              dapat melihatnya dan menerima email.
            </Alert>
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

/** An action button with one line saying what it does, so similar-looking actions are told apart. */
const ActionRow = ({
  desc,
  children,
}: {
  desc: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:gap-4">
    <div className="shrink-0 sm:w-56 [&>button]:w-full">{children}</div>
    <p className="text-[13px] text-fg-soft">{desc}</p>
  </div>
);

/** Plain-language "what happens next" for the viewer, so the negotiation flow is never a guess. */
function NextStep({
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
  const [tone, text] = ((): [
    "info" | "warning" | "success" | "danger",
    string,
  ] => {
    if (!canWrite)
      return [
        "info",
        `Rapat tim ini diajukan oleh ${mhs}. Hanya ${mhs} dan ${dosen} yang dapat mengubahnya; Anda tetap menerima undangan kalender lewat email.`,
      ];
    switch (c.status) {
      case "requested":
        if (myTurn && !c.startAt)
          return [
            "warning",
            `${mhs} meminta bimbingan pada ${fmtLongDate(c.requestedDate)}. Usulkan jam dan lokasi (boleh di tanggal lain). Setelah itu giliran mahasiswa menerima atau mengusulkan jam lain. Jika tidak bisa sama sekali, tolak dengan alasan.`,
          ];
        if (myTurn && started)
          return [
            "warning",
            "Jam yang diusulkan sudah lewat sehingga tidak bisa diterima. Usulkan jam baru.",
          ];
        if (myTurn)
          return [
            "warning",
            `${c.proposedBy === "lecturer" ? dosen : mhs} mengusulkan ${fmtRange(c.startAt, c.endAt)}. Terima jika cocok — bimbingan langsung disetujui dan semua peserta mendapat undangan kalender. Jika tidak cocok, usulkan jam lain${lecturer ? " atau tolak" : ""}.`,
          ];
        if (!c.startAt)
          return [
            "info",
            `Menunggu ${dosen} mengusulkan jam untuk tanggal ${fmtLongDate(c.requestedDate)}. Anda akan menerima email saat ada usulan. Jika tanggalnya lewat tanpa usulan, pengajuan kedaluwarsa dan Anda bisa mengajukan lagi.`,
          ];
        return [
          "info",
          `Menunggu ${c.turn === "lecturer" ? dosen : mhs} menanggapi usulan Anda (${fmtRange(c.startAt, c.endAt)}): menerima atau mengusulkan jam lain. Anda akan menerima email.`,
        ];
      case "approved":
        if (lecturer)
          return started
            ? [
                "warning",
                "Bimbingan sudah dimulai. Setelah selesai, tandai selesai dan tulis ringkasannya — ringkasan itu menjadi logbook.",
              ]
            : [
                "success",
                "Jadwal sudah disepakati. Anda masih bisa menjadwal ulang atau membatalkan sebelum jam mulai. Setelah bimbingan berlangsung, tandai selesai dan isi ringkasan.",
              ];
        return started
          ? [
              "info",
              `Menunggu ${dosen} menandai bimbingan selesai dan mengisi ringkasan logbook.`,
            ]
          : [
              "success",
              `Jadwal sudah disepakati. Datang sesuai jadwal; pengingat dikirim sehari sebelumnya. Untuk memindah jadwal, batalkan lalu ajukan lagi.`,
            ];
      case "completed":
        return [
          "success",
          "Bimbingan selesai. Ringkasannya tersimpan di tab Logbook project.",
        ];
      default:
        return [
          "danger",
          lecturer
            ? "Bimbingan ini sudah ditutup."
            : "Bimbingan ini sudah ditutup. Ajukan bimbingan baru dari Kalender atau tab Bimbingan project.",
        ];
    }
  })();
  return (
    <Alert tone={tone} title="Langkah berikutnya">
      {text}
    </Alert>
  );
}

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
    c.startAt
      ? c
      : {
          startAt: `${c.requestedDate}T02:00:00Z`,
          endAt: `${c.requestedDate}T03:00:00Z`,
        },
  );
  const [mode, setMode] = useState<Mode>(c.mode);
  const [location, setLocation] = useState(c.location ?? "");
  const m = useAction(
    () =>
      api.post(`/consultations/${c.id}/${kind}`, {
        ...time.value,
        ...(lecturer ? { mode, location: location || undefined } : {}),
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
      onClose={onClose}
      title={kind === "propose" ? "Usulkan waktu" : "Jadwal ulang"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            Kirim
          </Button>
        </>
      }
    >
      <p className="text-fg-muted">
        Durasi 15 menit–4 jam, mulai minimal 1 jam dari sekarang, tidak pada
        tanggal dosen berhalangan. Boleh di tanggal lain dari yang diminta.
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
  const m = useAction(
    () =>
      api.post(
        `/consultations/${c.id}/accept`,
        me.role === "lecturer" && location !== c.location ? { location } : {},
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
          <Button loading={m.isPending} onClick={() => m.mutate()}>
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
      <p className="text-xs text-fg-muted">
        Semua peserta menerima undangan kalender (.ics) lewat email (E3).
      </p>
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
