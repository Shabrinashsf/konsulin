// Kalender Bimbingan (both roles): month grid or agenda list over GET /consultations,
// a day timeline, and the lecturer's blackout days (GET /me/blackout-dates).
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Icon,
  IconButton,
  Modal,
  PageHeader,
  Select,
} from "../components/ui";
import {
  ConsultationState,
  consultationDate,
  needsMe,
} from "../components/consultation-bits";
import { ModeBadge } from "../components/status";
import { api } from "../lib/api";
import { useMe } from "../lib/auth";
import { addDays, fmtLongDate, todayWIB, wibTime } from "../lib/time";
import type {
  Blackout,
  Consultation,
  ConsultationView,
  Project,
} from "../lib/types";
import { RequestModal, ScheduleModal } from "./tabs/consultations-tab";

export const TONE: Record<
  ConsultationView,
  { pill: string; dot: string; label: string }
> = {
  requested: {
    pill: "bg-warning-subtle text-fg",
    dot: "bg-warning",
    label: "Ajuan",
  },
  approved: {
    pill: "bg-primary-subtle text-primary-hover",
    dot: "bg-primary",
    label: "Disetujui",
  },
  completed: {
    pill: "bg-secondary-subtle text-fg-soft",
    dot: "bg-secondary",
    label: "Selesai",
  },
  rejected: {
    pill: "bg-danger-subtle text-fg-soft line-through",
    dot: "bg-danger",
    label: "Ditolak",
  },
  cancelled: {
    pill: "bg-danger-subtle text-fg-soft line-through",
    dot: "bg-danger",
    label: "Dibatalkan",
  },
  expired: {
    pill: "bg-secondary-subtle text-fg-muted line-through",
    dot: "bg-secondary",
    label: "Kedaluwarsa",
  },
};
const FILTERS: [ConsultationView | "", string][] = [
  ["", "Semua"],
  ["requested", "Ajuan"],
  ["approved", "Disetujui"],
  ["completed", "Selesai"],
];
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const monthName = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const weekdayName = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  timeZone: "UTC",
});
const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const timeOf = (c: Consultation) => (c.startAt ? wibTime(c.startAt) : null);
const byTime = (a: Consultation, b: Consultation) =>
  (a.startAt ?? `${a.requestedDate}T99`).localeCompare(
    b.startAt ?? `${b.requestedDate}T99`,
  );

export function CalendarPage() {
  const me = useMe();
  const lecturer = me.role === "lecturer";
  const today = todayWIB();
  const [sp, setSp] = useSearchParams();
  const month = sp.get("bulan") ?? today.slice(0, 7);
  const projectId = sp.get("projectId") ?? "";
  const status = (sp.get("status") ?? "") as ConsultationView | "";
  const view = sp.get("tampilan") === "agenda" ? "agenda" : "bulan";
  const [day, setDay] = useState(sp.get("bulan") ? `${month}-01` : today);
  const [creating, setCreating] = useState(false);
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };

  const first = `${month}-01`;
  const from = addDays(first, -((utc(first).getUTCDay() + 6) % 7)); // Monday on/before the 1st
  const to = addDays(from, 41);
  const shift = (n: number) => {
    const d = utc(first);
    d.setUTCMonth(d.getUTCMonth() + n);
    const m = d.toISOString().slice(0, 7);
    set({ bulan: m });
    setDay(`${m}-01`);
  };

  const list = useQuery({
    queryKey: ["consultations", "calendar", from, projectId, status],
    queryFn: () =>
      api.listAll<Consultation>("/consultations", {
        from,
        to,
        projectId,
        status,
      }),
    placeholderData: keepPreviousData,
  });
  const blackouts = useQuery({
    queryKey: ["blackouts", "calendar", from],
    queryFn: () =>
      api.list<Blackout>("/me/blackout-dates", { from, to, limit: 100 }),
    enabled: lecturer,
  });
  const projects = useQuery({
    queryKey: ["projects", "list", "all"],
    queryFn: () => api.listAll<Project>("/projects"),
  });

  const all = [...(list.data?.data ?? [])].sort(byTime);
  const byDay = new Map<string, Consultation[]>();
  for (const c of all)
    byDay.set(consultationDate(c), [
      ...(byDay.get(consultationDate(c)) ?? []),
      c,
    ]);
  const blocked = new Map(
    (blackouts.data?.data ?? []).map((b) => [b.date, b.reason]),
  );
  const waiting = all.filter((c) => needsMe(c, me)).length;

  return (
    <>
      <PageHeader
        title="Kalender Bimbingan"
        actions={
          <Button
            icon={lecturer ? "event_available" : "add"}
            onClick={() => setCreating(true)}
          >
            {lecturer ? "Jadwalkan bimbingan" : "Ajukan bimbingan"}
          </Button>
        }
      />

      <Card className="p-0">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-1">
            <IconButton
              icon="chevron_left"
              label="Bulan sebelumnya"
              size="sm"
              onClick={() => shift(-1)}
            />
            <IconButton
              icon="chevron_right"
              label="Bulan berikutnya"
              size="sm"
              onClick={() => shift(1)}
            />
          </div>
          <h2 className="text-title-section font-semibold capitalize">
            {monthName.format(utc(first))}
          </h2>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              set({ bulan: "" });
              setDay(today);
            }}
          >
            Hari ini
          </Button>
          {waiting > 0 && (
            <Badge tone="warning" icon="touch_app">
              {waiting} perlu respons Anda
            </Badge>
          )}
          <div className="flex-1" />
          <div
            className="flex rounded-md bg-surface-muted p-1"
            role="tablist"
            aria-label="Tampilan"
          >
            {(["bulan", "agenda"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => set({ tampilan: v === "bulan" ? "" : v })}
                className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition ${view === v ? "bg-surface text-fg shadow-raised" : "text-fg-soft hover:text-fg"}`}
              >
                <Icon
                  name={v === "bulan" ? "calendar_view_month" : "view_agenda"}
                  className="text-[18px]"
                />
                {v === "bulan" ? "Bulan" : "Agenda"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          {FILTERS.map(([v, l]) => (
            <button
              key={v}
              onClick={() => set({ status: v })}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition ${status === v ? "border-primary bg-primary-soft text-primary" : "border-border text-fg-soft hover:bg-surface-muted"}`}
            >
              {v && <span className={`size-2 rounded-full ${TONE[v].dot}`} />}
              {l}
            </button>
          ))}
          <div className="flex-1" />
          <Select
            className="h-10 w-full sm:w-64"
            value={projectId}
            onChange={(e) => set({ projectId: e.target.value })}
          >
            <option value="">Semua project</option>
            {projects.data?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </div>

        {view === "bulan" ? (
          <div>
            <div className="p-3 sm:p-4">
              <div className="mb-1.5 grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((d, i) => (
                  <div
                    key={d}
                    className={`px-2 text-xs font-medium ${i > 4 ? "text-fg-muted" : "text-fg-soft"}`}
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 42 }, (_, i) => addDays(from, i)).map(
                  (d, i) => {
                    const items = byDay.get(d) ?? [];
                    const other = !d.startsWith(month),
                      weekend = i % 7 > 4,
                      isSel = d === day,
                      isBlocked = blocked.has(d);
                    return (
                      <button
                        key={d}
                        onClick={() => setDay(d)}
                        aria-pressed={isSel}
                        aria-label={fmtLongDate(d)}
                        className={`group flex min-h-[68px] flex-col gap-1 rounded-lg border p-1.5 text-left transition sm:min-h-[116px] sm:p-2 ${isSel ? "border-primary bg-primary-soft" : `border-border hover:border-primary-line ${weekend && !other ? "bg-surface-muted/60" : "bg-surface"}`} ${other && !isSel ? "opacity-45" : ""}`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`flex size-7 items-center justify-center rounded-full text-[13px] ${d === today ? "bg-primary font-semibold text-fg-inverse" : isSel ? "font-semibold text-primary" : "text-fg"}`}
                          >
                            {Number(d.slice(8))}
                          </span>
                        </div>
                        {isBlocked && (
                          <span className="hidden items-center gap-1 rounded-md bg-danger-subtle px-1.5 py-0.5 text-[11px] font-medium text-danger sm:flex">
                            <Icon name="event_busy" className="text-[13px]" />
                            Berhalangan
                          </span>
                        )}
                        <div className="hidden flex-col gap-1 sm:flex">
                          {items.slice(0, 3).map((c) => (
                            <span
                              key={c.id}
                              className={`flex items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[11px] ${TONE[c.status].pill} ${needsMe(c, me) ? "ring-1 ring-warning" : ""}`}
                            >
                              <span
                                className={`size-1.5 shrink-0 rounded-full ${TONE[c.status].dot}`}
                              />
                              <span className="font-semibold">
                                {timeOf(c) ?? "Ajuan"}
                              </span>
                              <span className="truncate">{c.topic}</span>
                            </span>
                          ))}
                          {items.length > 3 && (
                            <span className="px-1.5 text-[11px] font-medium text-fg-muted">
                              +{items.length - 3} lainnya
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 sm:hidden">
                          {isBlocked && (
                            <span className="size-1.5 rounded-full bg-danger" />
                          )}
                          {items.slice(0, 4).map((c) => (
                            <span
                              key={c.id}
                              className={`size-1.5 rounded-full ${TONE[c.status].dot}`}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
              <p className="mt-3 px-1 text-xs text-fg-muted">
                “Ajuan” di kotak tanggal = jam belum disepakati, ditaruh di
                tanggal yang diminta. Garis kuning = menunggu respons Anda.
              </p>
            </div>
            <DayPanel
              day={day}
              items={byDay.get(day) ?? []}
              blockedReason={blocked.has(day) ? (blocked.get(day) ?? "") : null}
              lecturer={lecturer}
            />
          </div>
        ) : (
          <Agenda
            all={all.filter((c) => consultationDate(c).startsWith(month))}
            blocked={blocked}
            today={today}
          />
        )}
      </Card>

      {creating && (
        <PickProject
          projects={projects.data?.data ?? []}
          lecturer={lecturer}
          initial={projectId}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

/** One meeting as a timeline card: time on the left, details on the right. */
function TimelineItem({ c, last }: { c: Consultation; last: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="w-12 shrink-0 pt-3 text-right">
        <p className="text-[13px] font-semibold tabular-nums">
          {timeOf(c) ?? "—"}
        </p>
        {c.endAt && (
          <p className="text-[11px] text-fg-muted tabular-nums">
            {wibTime(c.endAt)}
          </p>
        )}
      </div>
      <div className="relative flex flex-col items-center">
        <span
          className={`mt-4 size-2.5 rounded-full ring-4 ring-surface ${TONE[c.status].dot}`}
        />
        {!last && <span className="w-px flex-1 bg-border" />}
      </div>
      <Link
        to={`/consultations/${c.id}`}
        className="mb-3 min-w-0 flex-1 rounded-lg border border-border p-3 transition hover:border-primary-line hover:bg-primary-soft"
      >
        <p className="font-medium">{c.topic}</p>
        <p className="truncate text-xs text-fg-muted">
          {c.student.name} · {c.project.title}
        </p>
        {!c.startAt && (
          <p className="text-xs text-fg-muted">Jam belum disepakati</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <ModeBadge mode={c.mode} />
          <ConsultationState c={c} />
        </div>
      </Link>
    </div>
  );
}

function DayPanel({
  day,
  items,
  blockedReason,
  lecturer,
}: {
  day: string;
  items: Consultation[];
  blockedReason: string | null;
  lecturer: boolean;
}) {
  return (
    <aside className="flex flex-col gap-4 border-t border-border p-5">
      <div className="flex items-end gap-3">
        <span className="text-4xl leading-none font-semibold text-primary tabular-nums">
          {Number(day.slice(8))}
        </span>
        <div>
          <p className="font-medium capitalize">
            {weekdayName.format(utc(day))}
          </p>
          <p className="text-xs text-fg-muted capitalize">
            {monthName.format(utc(day))} · {items.length} bimbingan
          </p>
        </div>
      </div>
      {blockedReason !== null && (
        <div className="flex items-center gap-2 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger">
          <Icon name="event_busy" />
          Anda berhalangan{blockedReason ? ` — ${blockedReason}` : ""}
        </div>
      )}
      {items.length ? (
        <div>
          {items.map((c, i) => (
            <TimelineItem key={c.id} c={c} last={i === items.length - 1} />
          ))}
        </div>
      ) : (
        <Empty icon="event" title="Tidak ada bimbingan">
          {lecturer ? (
            <Link className="text-link" to="/jadwal">
              Atur hari berhalangan
            </Link>
          ) : (
            "Pilih tanggal lain atau ajukan bimbingan baru."
          )}
        </Empty>
      )}
    </aside>
  );
}

/** Agenda view: the month as a list grouped by day. */
function Agenda({
  all,
  blocked,
  today,
}: {
  all: Consultation[];
  blocked: Map<string, string | null>;
  today: string;
}) {
  const days = [
    ...new Set([...all.map(consultationDate), ...blocked.keys()]),
  ].sort();
  if (!days.length)
    return (
      <div className="p-5">
        <Empty icon="view_agenda" title="Tidak ada bimbingan bulan ini" />
      </div>
    );
  return (
    <div className="flex flex-col divide-y divide-border">
      {days.map((d) => {
        const items = all.filter((c) => consultationDate(c) === d);
        return (
          <div
            key={d}
            className="grid gap-3 px-5 py-4 sm:grid-cols-[140px_1fr]"
          >
            <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-0">
              <span
                className={`text-2xl font-semibold tabular-nums ${d === today ? "text-primary" : ""}`}
              >
                {Number(d.slice(8))}
              </span>
              <span className="text-[13px] text-fg-soft capitalize">
                {weekdayName.format(utc(d))}
                {d === today && <Badge tone="primary">Hari ini</Badge>}
              </span>
            </div>
            <div>
              {blocked.has(d) && (
                <div className="mb-2 flex items-center gap-2 rounded-md bg-danger-subtle px-3 py-2 text-[13px] text-danger">
                  <Icon name="event_busy" />
                  Anda berhalangan{blocked.get(d) ? ` — ${blocked.get(d)}` : ""}
                </div>
              )}
              {items.map((c, i) => (
                <TimelineItem key={c.id} c={c} last={i === items.length - 1} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Requests and schedules belong to a project, so ask which one first. */
function PickProject({
  projects,
  lecturer,
  initial,
  onClose,
}: {
  projects: Project[];
  lecturer: boolean;
  initial: string;
  onClose: () => void;
}) {
  const [id, setId] = useState(
    initial || (projects.length === 1 ? projects[0].id : ""),
  );
  const [chosen, setChosen] = useState<Project | null>(null);
  if (chosen)
    return lecturer ? (
      <ScheduleModal project={chosen} onClose={onClose} />
    ) : (
      <RequestModal project={chosen} onClose={onClose} />
    );
  return (
    <Modal
      open
      onClose={onClose}
      title={lecturer ? "Jadwalkan bimbingan" : "Ajukan bimbingan"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={!id}
            onClick={() => setChosen(projects.find((p) => p.id === id)!)}
          >
            Lanjut
          </Button>
        </>
      }
    >
      {!projects.length ? (
        <Empty icon="folder_shared" title="Belum ada project">
          {lecturer
            ? "Buat project dulu."
            : "Terima undangan project dari dosen dulu."}
        </Empty>
      ) : (
        <Field
          label="Project"
          required
          hint={
            lecturer ? undefined : "Ajuan dikirim ke dosen pemilik project ini."
          }
        >
          <Select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">Pilih project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ·{" "}
                {lecturer ? `${p.memberCount} mahasiswa` : p.lecturer.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Modal>
  );
}
