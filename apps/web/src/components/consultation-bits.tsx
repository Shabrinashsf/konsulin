import { useState } from "react";
import { Link } from "react-router";
import { Badge, Field, Input, Select } from "./ui";
import { ConsultationBadge, ModeBadge } from "./status";
import { DayPicker } from "./day-picker";
import {
  addDays,
  fmtLongDate,
  fmtRange,
  todayWIB,
  wibDate,
  wibTime,
} from "../lib/time";
import type { Consultation, Mode, Profile } from "../lib/types";
import { useMe } from "../lib/auth";

/** WIB calendar date a consultation sits on: the agreed start, or the requested date. */
export const consultationDate = (c: Consultation) =>
  c.startAt ? wibDate(c.startAt) : c.requestedDate;
/** True when the signed-in user must act now (it is their turn and they may write). */
export const needsMe = (c: Consultation, me: Profile) =>
  c.status === "requested" &&
  c.turn === me.role &&
  (me.role === "lecturer" || c.student.id === me.id);

/** Status as the viewer reads it: while negotiating, say who has to act instead of a generic label. */
export function ConsultationState({ c }: { c: Consultation }) {
  const me = useMe();
  if (c.status !== "requested") return <ConsultationBadge value={c.status} />;
  if (needsMe(c, me))
    return (
      <Badge tone="warning" icon="touch_app">
        Perlu respons Anda
      </Badge>
    );
  return (
    <Badge tone="info" icon="hourglass_top">
      Menunggu{" "}
      {c.turn === "lecturer"
        ? "dosen"
        : me.role === "student" && c.student.id === me.id
          ? "Anda"
          : "mahasiswa"}
    </Badge>
  );
}

/** One row in any consultation list. */
export function ConsultationItem({
  c,
  showProject,
}: {
  c: Consultation;
  showProject?: boolean;
}) {
  const date = consultationDate(c);
  return (
    <Link
      to={`/consultations/${c.id}`}
      className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-3 transition hover:bg-surface-muted"
    >
      <div className="flex w-14 shrink-0 flex-col items-center rounded-md border border-border py-1 text-primary">
        <span className="text-lg leading-6 font-semibold">
          {Number(date.slice(8))}
        </span>
        <span className="text-[11px] uppercase">
          {new Intl.DateTimeFormat("id-ID", {
            month: "short",
            timeZone: "UTC",
          }).format(new Date(`${date}T00:00:00Z`))}
        </span>
      </div>
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium">{c.topic}</p>
        <p className="text-xs text-fg-muted">
          {c.startAt
            ? fmtRange(c.startAt, c.endAt)
            : `Diminta untuk ${fmtLongDate(c.requestedDate)} · jam belum disepakati`}
          {" · "}
          {c.student.name}
          {showProject && ` · ${c.project.title}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ModeBadge mode={c.mode} />
        <ConsultationState c={c} />
      </div>
    </Link>
  );
}

// Same limits as the API (consultation-state.ts): 15 min–4 h on one WIB date, start 1 h–60 days ahead.
const iso = (date: string, time: string) => {
  const d = new Date(`${date}T${time}:00+07:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};
export function timeProblem(startAt: string, endAt: string, now = Date.now()) {
  if (!startAt || !endAt) return "Isi tanggal dan jam bimbingan.";
  const s = Date.parse(startAt);
  const minutes = (Date.parse(endAt) - s) / 60_000;
  if (minutes <= 0) return "Jam selesai harus setelah jam mulai.";
  if (minutes < 15 || minutes > 240 || wibDate(startAt) !== wibDate(endAt))
    return "Durasi 15 menit sampai 4 jam, di tanggal yang sama.";
  if (s < now + 60 * 60_000) return "Jam mulai minimal 1 jam dari sekarang.";
  if (s > now + 60 * 86_400_000) return "Maksimal 60 hari ke depan.";
  return null;
}

/**
 * Date + start/end time in WIB → { startAt, endAt } ISO. The date comes from the project's
 * available days (GET /projects/:id/available-days), the same calendar the student sees.
 */
export function useTimeFields(
  projectId: string,
  init?: {
    startAt: string | null;
    endAt: string | null;
  },
) {
  const [date, setDate] = useState(
    init?.startAt ? wibDate(init.startAt) : addDays(todayWIB(), 1),
  );
  const [start, setStart] = useState(
    init?.startAt ? wibTime(init.startAt) : "09:00",
  );
  const [end, setEnd] = useState(init?.endAt ? wibTime(init.endAt) : "10:00");
  const value = { startAt: iso(date, start), endAt: iso(date, end) };
  const error = timeProblem(value.startAt, value.endAt);
  const fields = (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <DayPicker projectId={projectId} value={date} onChange={setDate} />
        <p className="mt-2 text-sm">
          Tanggal dipilih: <b>{date ? fmtLongDate(date) : "-"}</b>
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Field label="Mulai (WIB)" required>
          <Input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Selesai (WIB)" required>
          <Input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
        <p
          className={`text-xs ${error ? "font-medium text-danger" : "text-fg-muted"}`}
        >
          {error ??
            "Durasi 15 menit–4 jam, mulai minimal 1 jam dari sekarang, jam di tanggal yang sama."}
        </p>
      </div>
    </div>
  );
  return { value, fields, error };
}

export function LocationFields({
  mode,
  location,
  onMode,
  onLocation,
}: {
  mode: Mode;
  location: string;
  onMode: (m: Mode) => void;
  onLocation: (l: string) => void;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3">
      <Field label="Mode" required>
        <Select value={mode} onChange={(e) => onMode(e.target.value as Mode)}>
          <option value="offline">Offline</option>
          <option value="online">Online</option>
        </Select>
      </Field>
      <Field label={mode === "online" ? "Link meeting" : "Lokasi"} required>
        <Input
          value={location}
          onChange={(e) => onLocation(e.target.value)}
          placeholder={
            mode === "online"
              ? "https://meet.google.com/..."
              : "Ruang Dosen 101"
          }
        />
      </Field>
    </div>
  );
}
