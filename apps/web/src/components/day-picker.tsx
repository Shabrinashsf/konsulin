// Month grid fed by GET /projects/:id/available-days (max 42 days = 6 weeks).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconButton } from "./ui";
import { api } from "../lib/api";
import { addDays, todayWIB } from "../lib/time";
import type { DayStatus } from "../lib/types";

const monthName = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function DayPicker({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: string;
  onChange: (d: string) => void;
}) {
  // opens on the month of the current value (e.g. rescheduling a meeting next month)
  const [month, setMonth] = useState((value || todayWIB()).slice(0, 7)); // YYYY-MM
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const from = addDays(first, -weekday),
    to = addDays(from, 41);
  const days = useQuery({
    queryKey: ["available-days", projectId, from],
    queryFn: () =>
      api.get<DayStatus[]>(`/projects/${projectId}/available-days`, {
        from,
        to,
      }),
  });
  const chosen = days.data?.find((d) => d.date === value);
  const shift = (n: number) => {
    const d = new Date(`${first}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center">
        <IconButton
          icon="chevron_left"
          label="Bulan sebelumnya"
          size="sm"
          onClick={() => shift(-1)}
        />
        <p className="flex-1 text-center font-medium capitalize">
          {monthName.format(new Date(`${first}T00:00:00Z`))}
        </p>
        <IconButton
          icon="chevron_right"
          label="Bulan berikutnya"
          size="sm"
          onClick={() => shift(1)}
        />
      </div>
      {days.isError && (
        <p className="mb-2 rounded-md bg-danger-subtle px-3 py-2 text-xs text-danger">
          Hari tersedia gagal dimuat. Coba ganti bulan atau muat ulang halaman.
        </p>
      )}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
          <span key={d} className="py-1 text-fg-muted">
            {d}
          </span>
        ))}
        {(days.data ?? []).map((d) => {
          const ok = d.status === "available",
            sel = d.date === value,
            other = !d.date.startsWith(month);
          return (
            <button
              key={d.date}
              type="button"
              disabled={!ok}
              onClick={() => onChange(d.date)}
              className={`h-9 rounded-md text-sm transition ${sel ? "bg-primary font-medium text-fg-inverse" : ok ? "bg-success-subtle text-fg hover:bg-success/25" : "text-fg-muted/50 line-through"} ${other && !sel ? "opacity-50" : ""}`}
            >
              {Number(d.date.slice(8))}
            </button>
          );
        })}
      </div>
      {chosen?.status === "unavailable" && (
        <p className="mt-2 text-xs font-medium text-danger">
          Tanggal yang dipilih tidak tersedia (lewat, lebih dari 60 hari, atau
          dosen berhalangan). Pilih tanggal lain.
        </p>
      )}
      <p className="mt-2 text-xs text-fg-muted">
        <span className="mr-1 inline-block size-2.5 rounded-sm bg-success-subtle align-middle" />
        Tersedia · tanggal coret: lewat, &gt; 60 hari, atau dosen berhalangan
      </p>
    </div>
  );
}
