// US-04 (lecturer) "Hari Berhalangan": pick days on a calendar, see the impact first, then block or reopen them.
// GET/POST/DELETE /me/blackout-dates, DELETE /me/blackout-dates/:id; impact preview from GET /consultations.
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Empty,
  Field,
  Icon,
  IconButton,
  Input,
  Modal,
  PageHeader,
  useToast,
} from "../components/ui";
import { consultationDate } from "../components/consultation-bits";
import { ApiError, api } from "../lib/api";
import {
  addDays,
  daysBetween,
  fmtDate,
  fmtLongDate,
  fmtRange,
  todayWIB,
  wibTime,
} from "../lib/time";
import { TONE } from "./calendar";
import { useAction } from "../lib/use-action";
import type {
  AffectedConsultation,
  Blackout,
  Consultation,
} from "../lib/types";

const monthName = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const HATCH =
  "bg-[repeating-linear-gradient(135deg,var(--color-danger-subtle)_0_6px,var(--color-surface)_6px_12px)]";

/** Consecutive blocked dates with the same reason read as one period ("30 Nov – 1 Des"). */
function periods(rows: Blackout[]) {
  const out: {
    from: string;
    to: string;
    reason: string | null;
    days: number;
  }[] = [];
  for (const b of [...rows].sort((a, z) => a.date.localeCompare(z.date))) {
    const last = out.at(-1);
    if (last && addDays(last.to, 1) === b.date && last.reason === b.reason) {
      last.to = b.date;
      last.days++;
    } else out.push({ from: b.date, to: b.date, reason: b.reason, days: 1 });
  }
  return out;
}
const rangeLabel = (from: string, to: string) =>
  from === to ? fmtLongDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`;

export function SchedulePage() {
  const toast = useToast();
  const today = todayWIB();
  const lastBookable = addDays(today, 60);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState<{ from: string; to: string } | null>(null);
  const [reason, setReason] = useState("");
  const [affected, setAffected] = useState<AffectedConsultation[] | null>(null);

  const first = `${month}-01`;
  const gridFrom = addDays(
    first,
    -((new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7),
  );
  const gridTo = addDays(gridFrom, 41);
  const shift = (n: number) => {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };

  const grid = useQuery({
    queryKey: ["blackouts", "grid", gridFrom],
    queryFn: () =>
      api.list<Blackout>("/me/blackout-dates", {
        from: gridFrom,
        to: gridTo,
        limit: 100,
      }),
    placeholderData: keepPreviousData,
  });
  const upcoming = useQuery({
    queryKey: ["blackouts", "upcoming"],
    queryFn: () =>
      api.list<Blackout>("/me/blackout-dates", {
        from: today,
        order: "asc",
        limit: 100,
      }),
  });
  const meetings = useQuery({
    queryKey: ["consultations", "schedule", gridFrom],
    queryFn: () =>
      api.list<Consultation>("/consultations", {
        from: gridFrom,
        to: gridTo,
        limit: 100,
      }),
    placeholderData: keepPreviousData,
  });

  const blocked = new Map((grid.data?.data ?? []).map((b) => [b.date, b]));
  const active = (meetings.data?.data ?? []).filter(
    (c) =>
      (c.status === "approved" && new Date(c.startAt!) > new Date()) ||
      c.status === "requested",
  );
  const meetingsOn = (d: string) =>
    active.filter((c) => consultationDate(c) === d);
  const inSel = (d: string) => !!sel && d >= sel.from && d <= sel.to;

  // Selection: click a day; Shift+click (or the "Sampai" field) extends it into a range.
  const pick = (d: string, extend: boolean) => {
    if (d < today && !blocked.has(d)) return;
    setSel(
      extend && sel
        ? d < sel.from
          ? { from: d, to: sel.to }
          : { from: sel.from, to: d }
        : { from: d, to: d },
    );
    setAffected(null);
  };
  const selDays = sel
    ? Array.from({ length: daysBetween(sel.from, sel.to) + 1 }, (_, i) =>
        addDays(sel.from, i),
      )
    : [];
  const selBlocked = selDays.filter((d) => blocked.has(d));
  const selFree = selDays.filter((d) => !blocked.has(d) && d >= today);
  const selMeetings = active.filter((c) => inSel(consultationDate(c)));
  const tooLong = selDays.length > 90;

  const block = useAction(
    (confirm: boolean) =>
      api.post<{
        created: string[];
        skipped: string[];
        cancelledConsultations: AffectedConsultation[];
      }>("/me/blackout-dates", {
        from: sel!.from < today ? today : sel!.from,
        to: sel!.to,
        reason: reason || null,
        cancelConsultations: confirm,
      }),
    {
      onDone: (r) => {
        toast({
          tone: "success",
          title: `${r.created.length} hari ditandai berhalangan`,
          text: r.cancelledConsultations.length
            ? `${r.cancelledConsultations.length} bimbingan dibatalkan dan peserta diberi tahu lewat email.`
            : "Mahasiswa tidak bisa mengajukan bimbingan di hari itu.",
        });
        setSel(null);
        setReason("");
        setAffected(null);
      },
      onError: (e) => {
        //the server lists what would be cancelled; ask before cancelling
        if (e instanceof ApiError && e.code === "BLACKOUT_HAS_CONSULTATION") {
          setAffected(
            (e.details as { consultations: AffectedConsultation[] })
              .consultations,
          );
          return true;
        }
      },
    },
  );
  const reopen = useAction(
    (r: { from: string; to: string }) =>
      api.del<{ deleted: string[] }>("/me/blackout-dates", r),
    {
      onDone: (x) => {
        toast({
          tone: "success",
          title: `${x.deleted.length} hari dibuka kembali`,
          text: "Mahasiswa bisa mengajukan bimbingan lagi di hari itu.",
        });
        setSel(null);
      },
    },
  );

  return (
    <>
      <PageHeader
        title="Hari Berhalangan"
        subtitle="Tidak ada jam kantor tetap. Mahasiswa bisa mengajukan bimbingan di hari mana pun dalam 60 hari ke depan, kecuali hari yang Anda tandai berhalangan di sini."
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="h-fit p-0">
          {/* Same toolbar and grid as Kalender Bimbingan */}
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
              {monthName.format(new Date(`${first}T00:00:00Z`))}
            </h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setMonth(today.slice(0, 7))}
            >
              Hari ini
            </Button>
            <div className="flex-1" />
            <span className="hidden text-xs text-fg-muted sm:inline">
              Klik tanggal · Shift+klik untuk rentang
            </span>
          </div>
          <div className="p-3 sm:p-4">
            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d, i) => (
                <div
                  key={d}
                  className={`px-2 text-xs font-medium ${i > 4 ? "text-fg-muted" : "text-fg-soft"}`}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 42 }, (_, i) => addDays(gridFrom, i)).map(
                (d, i) => {
                  const past = d < today,
                    b = blocked.get(d),
                    items = meetingsOn(d),
                    outside = d > lastBookable;
                  const disabled = past && !b,
                    other = !d.startsWith(month),
                    weekend = i % 7 > 4,
                    selected = inSel(d);
                  return (
                    <button
                      key={d}
                      disabled={disabled}
                      onClick={(e) => pick(d, e.shiftKey)}
                      aria-pressed={selected}
                      aria-label={fmtLongDate(d)}
                      className={`flex min-h-[68px] flex-col gap-1 rounded-lg border p-1.5 text-left transition sm:min-h-[104px] sm:p-2 ${selected ? "border-primary bg-primary-soft" : b ? `border-danger-line ${HATCH}` : `border-border ${disabled ? "" : "hover:border-primary-line"} ${weekend && !other ? "bg-surface-muted/60" : "bg-surface"}`} ${disabled ? "cursor-default" : ""} ${other && !selected ? "opacity-45" : ""}`}
                    >
                      <span
                        className={`flex size-7 items-center justify-center rounded-full text-[13px] ${d === today ? "bg-primary font-semibold text-fg-inverse" : selected ? "font-semibold text-primary" : disabled ? "text-fg-faint" : "text-fg"}`}
                      >
                        {Number(d.slice(8))}
                      </span>
                      {b && (
                        <span className="hidden items-center gap-1 rounded-md bg-danger-subtle px-1.5 py-0.5 text-[11px] font-medium text-danger sm:flex">
                          <Icon name="event_busy" className="text-[13px]" />
                          Berhalangan
                        </span>
                      )}
                      <div className="hidden flex-col gap-1 sm:flex">
                        {items.slice(0, 2).map((c) => (
                          <span
                            key={c.id}
                            className={`flex items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-[11px] ${TONE[c.status].pill}`}
                          >
                            <span
                              className={`size-1.5 shrink-0 rounded-full ${TONE[c.status].dot}`}
                            />
                            <span className="font-semibold">
                              {c.startAt ? wibTime(c.startAt) : "Ajuan"}
                            </span>
                            <span className="truncate">{c.topic}</span>
                          </span>
                        ))}
                        {items.length > 2 && (
                          <span className="px-1.5 text-[11px] font-medium text-fg-muted">
                            +{items.length - 2} lainnya
                          </span>
                        )}
                      </div>
                      {outside && !past && !b && (
                        <span className="hidden text-[10px] text-fg-faint sm:block">
                          &gt; 60 hari
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1 sm:hidden">
                        {b && (
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
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-fg-muted">
              <span className="flex items-center gap-1.5">
                <span
                  className={`size-3 rounded-sm border border-danger-line ${HATCH}`}
                />
                Berhalangan
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-warning" />
                Ajuan
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" />
                Disetujui
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm border border-primary bg-primary-soft" />
                Dipilih
              </span>
              <span>&gt; 60 hari: belum bisa diajukan mahasiswa</span>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          {!sel ? (
            <Card className="flex flex-col gap-3">
              <h3 className="text-title-sub font-medium">Cara memakai</h3>
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-fg-soft">
                <li>
                  Klik tanggal ketika Anda tidak bisa membimbing. Untuk beberapa
                  hari, Shift+klik tanggal terakhir.
                </li>
                <li>
                  Cek bimbingan yang akan terkena, isi alasan (hanya Anda yang
                  melihat).
                </li>
                <li>
                  Klik <b className="text-fg">Tandai berhalangan</b>. Mahasiswa
                  tidak bisa mengajukan bimbingan di hari itu.
                </li>
              </ol>
              <p className="text-xs text-fg-muted">
                Klik hari yang sudah berhalangan untuk membukanya kembali.
              </p>
            </Card>
          ) : (
            <Card className="flex flex-col gap-4">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <h3 className="text-title-sub font-medium">
                    {rangeLabel(sel.from, sel.to)}
                  </h3>
                  <p className="text-xs text-fg-muted">
                    {selDays.length} hari dipilih
                    {selBlocked.length
                      ? ` · ${selBlocked.length} sudah berhalangan`
                      : ""}
                  </p>
                </div>
                <IconButton
                  icon="close"
                  label="Batal pilih"
                  size="sm"
                  onClick={() => setSel(null)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dari">
                  <Input
                    type="date"
                    min={today}
                    value={sel.from}
                    onChange={(e) =>
                      e.target.value &&
                      setSel({
                        from: e.target.value,
                        to: e.target.value > sel.to ? e.target.value : sel.to,
                      })
                    }
                  />
                </Field>
                <Field label="Sampai">
                  <Input
                    type="date"
                    min={sel.from}
                    value={sel.to}
                    onChange={(e) =>
                      e.target.value && setSel({ ...sel, to: e.target.value })
                    }
                  />
                </Field>
              </div>
              {tooLong && (
                <Alert tone="warning">Maksimal 90 hari sekali tandai.</Alert>
              )}

              {selFree.length > 0 && !tooLong && (
                <>
                  {selMeetings.length > 0 ? (
                    <Alert
                      tone="warning"
                      title={`${selMeetings.length} bimbingan akan dibatalkan`}
                    >
                      <ul className="mt-1 flex flex-col gap-1 text-[13px]">
                        {selMeetings.map((c) => (
                          <li key={c.id}>
                            <b>{c.topic}</b> · {c.student.name} ·{" "}
                            {c.startAt
                              ? fmtRange(c.startAt, c.endAt)
                              : `diminta ${fmtDate(c.requestedDate)}`}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1 text-[13px]">
                        Peserta menerima email pembatalan.
                      </p>
                    </Alert>
                  ) : (
                    <p className="flex items-center gap-1.5 text-[13px] text-success">
                      <Icon name="check_circle" fill /> Tidak ada bimbingan
                      aktif di tanggal ini.
                    </p>
                  )}
                  <Field label="Alasan (opsional, hanya Anda yang melihat)">
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="mis. Konferensi di luar kota"
                    />
                  </Field>
                  <Button
                    variant={selMeetings.length ? "danger" : "primary"}
                    icon="event_busy"
                    loading={block.isPending}
                    onClick={() => block.mutate(selMeetings.length > 0)}
                  >
                    {selMeetings.length
                      ? `Tandai & batalkan ${selMeetings.length} bimbingan`
                      : `Tandai ${selFree.length} hari berhalangan`}
                  </Button>
                </>
              )}
              {selBlocked.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  {selBlocked.length === 1 &&
                    blocked.get(selBlocked[0])?.reason && (
                      <p className="text-[13px] text-fg-soft">
                        Alasan: {blocked.get(selBlocked[0])!.reason}
                      </p>
                    )}
                  <Button
                    variant="secondary"
                    icon="event_available"
                    loading={reopen.isPending}
                    onClick={() => reopen.mutate(sel)}
                  >
                    Buka kembali {selBlocked.length} hari
                  </Button>
                </div>
              )}
              {!selFree.length && !selBlocked.length && (
                <p className="text-fg-muted">
                  Tanggal yang sudah lewat tidak bisa ditandai.
                </p>
              )}
            </Card>
          )}

          <Card className="flex flex-col gap-2 p-4">
            <h3 className="text-title-sub font-medium">Akan datang</h3>
            {!upcoming.data?.data.length ? (
              <Empty icon="event_available" title="Tidak ada hari berhalangan">
                Semua hari dalam 60 hari ke depan bisa diajukan mahasiswa.
              </Empty>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {periods(upcoming.data.data).map((p) => (
                  <div key={p.from} className="flex items-center gap-3 py-2.5">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setMonth(p.from.slice(0, 7));
                        setSel({ from: p.from, to: p.to });
                      }}
                    >
                      <p className="font-medium">{rangeLabel(p.from, p.to)}</p>
                      <p className="truncate text-xs text-fg-muted">
                        {p.days} hari · {p.reason ?? "tanpa alasan"}
                      </p>
                    </button>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={
                        reopen.isPending && reopen.variables?.from === p.from
                      }
                      onClick={() => reopen.mutate({ from: p.from, to: p.to })}
                    >
                      Buka kembali
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={!!affected}
        onClose={() => setAffected(null)}
        wide
        title="Ada bimbingan pada tanggal ini"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAffected(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              loading={block.isPending}
              onClick={() => block.mutate(true)}
            >
              Tandai berhalangan & batalkan {affected?.length} bimbingan
            </Button>
          </>
        }
      >
        <Alert tone="warning">
          Bimbingan berikut akan dibatalkan dengan alasan “Dosen berhalangan
          pada tanggal tersebut”, dan peserta menerima email pembatalan.
        </Alert>
        <div className="divide-y divide-border">
          {affected?.map((c) => (
            <div key={c.id} className="py-2.5">
              <p className="font-medium">{c.topic}</p>
              <p className="text-xs text-fg-muted">
                {c.student.name} · {c.project.title} ·{" "}
                {c.startAt
                  ? fmtRange(c.startAt, c.endAt)
                  : `diminta ${fmtLongDate(c.requestedDate)}`}
              </p>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
