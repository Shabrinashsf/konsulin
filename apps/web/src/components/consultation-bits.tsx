import { useState } from "react";
import { Link } from "react-router";
import { Badge, Field, Input, Select } from "./ui";
import { ConsultationBadge, ModeBadge } from "./status";
import {
  addDays,
  fmtLongDate,
  fmtRange,
  todayWIB,
  wibDate,
  wibIso,
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

/** Date + start/end time in WIB → { startAt, endAt } ISO. */
export function useTimeFields(init?: {
  startAt: string | null;
  endAt: string | null;
}) {
  const [date, setDate] = useState(
    init?.startAt ? wibDate(init.startAt) : addDays(todayWIB(), 1),
  );
  const [start, setStart] = useState(
    init?.startAt ? wibTime(init.startAt) : "09:00",
  );
  const [end, setEnd] = useState(init?.endAt ? wibTime(init.endAt) : "10:00");
  const value = { startAt: wibIso(date, start), endAt: wibIso(date, end) };
  const fields = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_140px_140px] [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
      <Field label="Tanggal" required>
        <Input
          type="date"
          min={todayWIB()}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>
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
    </div>
  );
  return { value, fields };
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
