// Left panel of the login/register pages: tagline + a slideshow of the main features.
// Each slide shows a small replica of the real screen, built from the app's own components
// (badges, buttons, table, calendar cells) with static text. Nothing here is wired to data.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, Badge, Button, Icon, Table } from "../components/ui";
import {
  ConsultationBadge,
  DeadlineBadge,
  ModeBadge,
  RevisionBadge,
} from "../components/status";

const SLIDE_MS = 4500;

/** Steps the mock forward on a timer: returns how many of `times` (ms) have passed. */
function useSteps(times: number[]) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const ts = times.map((t, i) => setTimeout(() => setS(i + 1), t));
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return s;
}

/** Staggered entrance; `d` is the delay in ms. */
const Rise = ({
  d = 0,
  className = "",
  children,
}: {
  d?: number;
  className?: string;
  children: ReactNode;
}) => (
  <div className={`a-rise ${className}`} style={{ animationDelay: `${d}ms` }}>
    {children}
  </div>
);

function Window({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none flex h-[292px] flex-col overflow-hidden rounded-xl bg-white text-fg shadow-[0_24px_60px_-24px_rgb(0_0_0/0.5)] select-none"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-2 rounded-full bg-primary" />
        <span className="text-[15px] font-semibold">{title}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4">{children}</div>
    </div>
  );
}

/** Same look as the app's toast, floating over the corner of the window. */
function ToastMock({ title, text, d }: { title: string; text?: string; d: number }) {
  return (
    <div
      className="a-rise pointer-events-none absolute -right-3 -bottom-5 z-10 w-[240px] rounded-xl bg-white py-3 pr-4 pl-11 shadow-overlay"
      style={{ animationDelay: `${d}ms` }}
    >
      <Icon
        name="check_circle"
        fill
        className="absolute top-3 left-3.5 text-[22px] text-success"
      />
      <p className="text-[13px] font-medium text-fg">{title}</p>
      {text && <p className="text-xs text-fg-muted">{text}</p>}
    </div>
  );
}

// ---------- 1. Jadwal ----------
function ScheduleMock() {
  const step = useSteps([1100, 1900]);
  // Desember 2026, Monday first. [day, state] ; past = struck through, off = lecturer away
  const cells: [number, "past" | "off" | "ok"][] = [
    [30, "past"], [1, "past"], [2, "ok"], [3, "ok"], [4, "ok"], [5, "ok"], [6, "ok"],
    [7, "ok"], [8, "off"], [9, "off"], [10, "ok"], [11, "ok"], [12, "ok"], [13, "ok"],
  ];
  return (
    <>
      <Window title="Kalender Bimbingan">
        <div className="grid grid-cols-[210px_1fr] gap-4">
          <div className="rounded-lg border border-border p-2.5">
            <p className="mb-1.5 text-center text-[13px] font-medium">
              Desember 2026
            </p>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
              {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
                <span key={d} className="text-fg-muted">{d}</span>
              ))}
              {cells.map(([n, s], i) => {
                const sel = n === 10 && step >= 1;
                return (
                  <span
                    key={n}
                    style={{ animationDelay: `${i * 30}ms` }}
                    className={`a-pop flex h-7 items-center justify-center rounded-md text-xs transition-[background-color,transform,color] duration-500 ease-out ${
                      sel
                        ? "scale-105 bg-primary font-medium text-fg-inverse"
                        : s === "ok"
                          ? "bg-success-subtle"
                          : "text-fg-muted/50 line-through"
                    }`}
                  >
                    {n}
                  </span>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-fg-muted">
              Tanggal coret: lewat atau dosen berhalangan.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-[13px] font-medium text-fg-soft">Pertemuan</p>
            {step >= 2 ? (
              <Rise className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <div className="flex w-12 shrink-0 flex-col items-center rounded-md border border-border py-1 text-primary">
                  <span className="text-base leading-5 font-semibold">10</span>
                  <span className="text-[10px] uppercase">Des</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">Bimbingan Bab 3</p>
                  <p className="truncate text-xs text-fg-muted">
                    10.00–11.00 · Andi Pratama
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <ModeBadge mode="offline" />
                    <ConsultationBadge value="approved" />
                  </div>
                </div>
              </Rise>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-2.5 text-xs text-fg-muted">
                <Icon name="event" className="text-[20px]" />
                {step >= 1 ? "Mengajukan 10 Des..." : "Pilih tanggal"}
              </div>
            )}
          </div>
        </div>
      </Window>
      {step >= 2 && <ToastMock title="Jadwal disetujui" text="Undangan kalender terkirim" d={0} />}
    </>
  );
}

// ---------- 2. Draft ----------
function DraftMock() {
  const step = useSteps([900]);
  const old = [
    ["v2", "draft-bab3-revisi.docx", "1,2 MB", "3 hari lalu"],
    ["v1", "draft-bab3.pdf", "980 KB", "1 minggu lalu"],
  ];
  return (
    <>
      <Window title="Folder · Bab 3 Metodologi">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Draft Bab 3</p>
            <p className="text-xs text-fg-muted">Deadline 20 Des 2026, 23.59</p>
          </div>
          <DeadlineBadge value="submitted" />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {step >= 1 && (
            <Rise className="flex items-center gap-3 rounded-md border border-primary-line bg-primary-soft px-3 py-2">
              <span className="w-6 font-semibold text-primary">v3</span>
              <Icon name="description" className="text-[20px] text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate">draft-bab3-final.pdf</p>
                <p className="text-xs text-fg-muted">1,4 MB · baru saja</p>
              </div>
              <Badge tone="primary">Terbaru</Badge>
            </Rise>
          )}
          {old.map(([v, f, size, when], i) => (
            <Rise
              key={v}
              d={i * 120}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <span className="w-6 font-semibold text-fg-muted">{v}</span>
              <Icon name="description" className="text-[20px] text-fg-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate">{f}</p>
                <p className="text-xs text-fg-muted">{size} · {when}</p>
              </div>
            </Rise>
          ))}
        </div>
        <div className="mt-3">
          <Button size="sm" icon="upload">Unggah versi baru</Button>
        </div>
      </Window>
      {step >= 1 && <ToastMock title="Versi 3 diunggah" text="Dosen diberi tahu lewat email" d={250} />}
    </>
  );
}

// ---------- 3. Revisi ----------
function RevisionMock() {
  const step = useSteps([1200, 2200]);
  const items: { text: string; done: boolean; wait: boolean }[] = [
    { text: "Perjelas rumusan masalah", done: step >= 1, wait: step < 1 },
    { text: "Tambahkan tabel perbandingan", done: step >= 2, wait: step < 2 },
    { text: "Rapikan daftar pustaka", done: false, wait: false },
  ];
  const verified = items.filter((i) => i.done).length;
  return (
    <>
      <Window title="Revisi · Bab 3 Metodologi">
        <div className="flex items-center justify-between text-xs text-fg-muted">
          <span>Masukan untuk v2</span>
          <span>{verified} dari {items.length} terverifikasi</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-primary-soft">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${(verified / items.length) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {items.map((it, i) => (
            <Rise
              key={it.text}
              d={i * 120}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
            >
              <Icon
                key={String(it.done)}
                name={it.done ? "check_circle" : "radio_button_unchecked"}
                fill={it.done}
                className={`text-[22px] ${it.done ? "a-pop text-success" : "text-fg-faint"}`}
              />
              <p className={`min-w-0 flex-1 truncate transition-colors duration-500 ${it.done ? "text-fg-muted line-through" : ""}`}>
                {it.text}
              </p>
              {it.done ? (
                <RevisionBadge value="verified" />
              ) : it.wait ? (
                <Button size="sm" variant="subtle" icon="verified" className="min-h-8! px-3!">
                  Verifikasi
                </Button>
              ) : (
                <RevisionBadge value="open" />
              )}
            </Rise>
          ))}
        </div>
      </Window>
      {step >= 1 && <ToastMock title="Item diverifikasi" d={0} />}
    </>
  );
}

// ---------- 4. Logbook ----------
function LogbookMock() {
  const rows = [
    ["12", "Nov", "Pembahasan Bab 2", "Tambah 5 referensi jurnal terbaru."],
    ["29", "Okt", "Pembahasan proposal", "Judul disetujui, lanjut ke Bab 1."],
    ["15", "Okt", "Pertemuan pertama", "Menentukan topik dan pembimbing."],
  ];
  return (
    <>
      <Window title="Logbook · Andi Pratama">
        <div className="flex flex-col gap-2.5">
          {rows.map(([d, m, t, s], i) => (
            <Rise key={d + m} d={i * 160} className="flex items-center gap-3">
              <div className="flex w-12 shrink-0 flex-col items-center rounded-md border border-border py-1 text-primary">
                <span className="text-base leading-5 font-semibold">{d}</span>
                <span className="text-[10px] uppercase">{m}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{t}</p>
                <p className="truncate text-xs text-fg-muted">{s}</p>
              </div>
              <ConsultationBadge value="completed" />
            </Rise>
          ))}
        </div>
      </Window>
      <ToastMock title="Logbook diperbarui" text="Dari ringkasan pertemuan" d={900} />
    </>
  );
}

// ---------- 5. Monitoring ----------
function MonitoringMock() {
  const rows = [
    ["Andi Pratama", "2 hari lalu", "0", null],
    ["Bella Sari", "9 hari lalu", "3", "Lewat deadline"],
    ["Citra Dewi", "5 hari lalu", "1", null],
  ] as const;
  return (
    <Window title="Monitoring">
      <div className="[&_td]:p-2.5! [&_th]:p-2.5!">
        <Table head={["Mahasiswa", "Bimbingan terakhir", "Revisi", "Status"]}>
          {rows.map(([n, last, rev, flag], i) => (
            <tr key={n} className="a-rise" style={{ animationDelay: `${i * 140}ms` }}>
              <td>
                <span className="flex items-center gap-2">
                  <Avatar name={n} className="size-7" />
                  <span className="font-medium">{n}</span>
                </span>
              </td>
              <td className="text-fg-soft">{last}</td>
              <td className="font-semibold">{rev}</td>
              <td>
                {flag ? (
                  <DeadlineBadge value="overdue" />
                ) : (
                  <Badge tone="success">Lancar</Badge>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </div>
    </Window>
  );
}

const SLIDES = [
  {
    tag: "Jadwal",
    title: "Atur jadwal bimbingan tanpa bolak-balik chat",
    body: "Dosen menandai hari berhalangan, mahasiswa memilih tanggal, lalu keduanya menawar jam sampai sepakat.",
    mock: ScheduleMock,
  },
  {
    tag: "Draft",
    title: "Setiap unggahan tersimpan sebagai versi",
    body: "v1, v2, v3 tidak pernah tertimpa, jadi jelas mana file terbaru. Status deadline tampil di tiap folder.",
    mock: DraftMock,
  },
  {
    tag: "Revisi",
    title: "Masukan dosen jadi checklist revisi",
    body: "Mahasiswa menandai poin yang sudah diperbaiki dan menunjuk versinya. Dosen tinggal memverifikasi.",
    mock: RevisionMock,
  },
  {
    tag: "Logbook",
    title: "Logbook terisi sendiri dari tiap pertemuan",
    body: "Ringkasan yang ditulis dosen saat menutup pertemuan otomatis menjadi catatan bimbingan.",
    mock: LogbookMock,
  },
  {
    tag: "Monitoring",
    title: "Pantau semua mahasiswa dalam satu daftar",
    body: "Untuk dosen: pertemuan terakhir, revisi yang masih terbuka, dan folder yang lewat deadline.",
    mock: MonitoringMock,
  },
];

export function AuthHero() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { tag, title, body, mock: Mock } = SLIDES[i];
  useEffect(() => () => clearTimeout(timer.current), []);
  /** Fade the current slide out, then swap, so slides crossfade instead of cutting. */
  const go = (n: number) => {
    if (leaving || n === i) return;
    setLeaving(true);
    timer.current = setTimeout(() => {
      setI(n);
      setLeaving(false);
    }, 350);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col justify-center gap-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div>
        <h2 className="max-w-xl text-[32px] leading-[1.15] font-bold tracking-tight xl:text-[36px]">
          Bimbingan akademik, rapi dari{" "}
          <span className="text-accent">jadwal</span> sampai{" "}
          <span className="text-accent">logbook</span>.
        </h2>
        <p className="mt-3 max-w-lg text-[15px] text-white/70">
          Skripsi, tesis, disertasi, riset, sampai lomba. Dosen dan mahasiswa
          bekerja di satu tempat, tanpa file tercecer di chat dan email.
        </p>
      </div>

      <div
        className={`grid items-center gap-6 transition-all duration-[350ms] ease-in xl:grid-cols-[200px_1fr] ${
          leaving ? "-translate-y-2 opacity-0" : ""
        }`}
      >
        <div key={`t${i}`} className="a-rise">
          <span className="text-xs font-semibold tracking-wide text-primary-line uppercase">
            {tag}
          </span>
          <h3 className="mt-1.5 text-[19px] leading-snug font-semibold">
            {title}
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-white/65">
            {body}
          </p>
        </div>
        <div key={`m${i}`} className="relative hidden xl:block">
          <Mock />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {SLIDES.map((s, n) => (
          <button
            key={s.tag}
            aria-label={s.tag}
            onClick={() => go(n)}
            className={`relative h-1.5 overflow-hidden rounded-full bg-white/25 transition-[width,background-color] duration-500 ease-out ${
              n === i ? "w-12" : "w-3 hover:bg-white/45"
            }`}
          >
            {n === i && (
              <span
                className="a-fill absolute inset-0 origin-left bg-accent"
                style={{
                  animationDuration: `${SLIDE_MS}ms`,
                  animationPlayState: paused ? "paused" : "running",
                }}
                onAnimationEnd={() => go((i + 1) % SLIDES.length)}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
