// US-06: GET /projects/:id/logbook.
import { useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Empty,
  IconBox,
  Input,
  Loading,
  Pager,
  Select,
  Table,
} from "../../components/ui";
import { useAction } from "../../lib/use-action";
import { ModeBadge } from "../../components/status";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { fmtDate, wibTime } from "../../lib/time";
import type {
  Consultation,
  Member,
  ProjectDetail,
} from "../../lib/types";

function useMembers(project: ProjectDetail) {
  const me = useMe();
  return (
    useQuery({
      queryKey: ["projects", project.id, "members", "all"],
      queryFn: () =>
        api.list<Member>(`/projects/${project.id}/members`, { limit: 100 }),
      enabled: me.role === "lecturer" || project.trackMode === "shared",
    }).data?.data ?? []
  );
}

/** Logbook = the official record of finished meetings; exportable as a "kartu bimbingan" CSV. */
export function LogbookTab({ project }: { project: ProjectDetail }) {
  const me = useMe();
  const lecturer = me.role === "lecturer";
  const members = useMembers(project);
  const [f, setF] = useState({
    q: "",
    studentId: "",
    from: "",
    to: "",
    page: 1,
    limit: 10,
  });
  const list = useQuery({
    queryKey: ["logbook", project.id, f],
    queryFn: () => api.list<Consultation>(`/projects/${project.id}/logbook`, f),
    placeholderData: keepPreviousData,
  });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v, page: 1 });
  const total = list.data?.meta.total ?? 0;
  const last = list.data?.data[0];

  // CSV of every row matching the filters, one line per meeting.
  const exportCsv = useAction(
    async () => {
      const all = await api.list<Consultation>(
        `/projects/${project.id}/logbook`,
        { ...f, page: 1, limit: 100 },
      );
      const q = (v: string | null | undefined) =>
        `"${(v ?? "").replace(/"/g, '""')}"`;
      const rows = [
        [
          "No",
          "Tanggal",
          "Jam (WIB)",
          "Mahasiswa",
          "NRP",
          "Topik",
          "Mode",
          "Lokasi",
          "Ringkasan",
        ].join(","),
        ...all.data
          .slice()
          .reverse()
          .map((c, i) =>
            [
              i + 1,
              q(fmtDate(c.startAt)),
              q(`${wibTime(c.startAt!)}–${wibTime(c.endAt!)}`),
              q(c.student.name),
              q(c.student.nrp),
              q(c.topic),
              c.mode,
              q(c.location),
              q(c.summary),
            ].join(","),
          ),
      ];
      const a = Object.assign(document.createElement("a"), {
        href: URL.createObjectURL(
          new Blob(["\ufeff" + rows.join("\n")], {
            type: "text/csv;charset=utf-8",
          }),
        ),
        download: `logbook-${project.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`,
      });
      a.click();
      URL.revokeObjectURL(a.href);
    },
    { success: "Logbook diunduh" },
  );

  return (
    <>
      <Card className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
        <IconBox icon="menu_book" />
        <div className="min-w-0 flex-1">
          <p className="text-title-sub font-medium">
            Logbook = catatan resmi bimbingan
          </p>
          <p className="text-[13px] text-fg-soft">
            Setiap bimbingan yang sudah selesai tercatat di sini beserta
            ringkasan dari dosen (tanggal, jam, topik, hasil). Terisi otomatis
            saat dosen menekan “Selesaikan & isi logbook”.{" "}
            {lecturer
              ? "Gunakan sebagai rekap progres tiap mahasiswa."
              : "Gunakan sebagai bukti bimbingan, mis. lampiran syarat seminar atau sidang."}
          </p>
        </div>
        <div className="flex shrink-0 gap-6 sm:px-2">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{total}</p>
            <p className="text-xs text-fg-muted">bimbingan selesai</p>
          </div>
          <div>
            <p className="text-[15px] font-medium">
              {last ? fmtDate(last.startAt) : "-"}
            </p>
            <p className="text-xs text-fg-muted">terakhir</p>
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="w-full sm:w-64"
          placeholder="Cari topik atau ringkasan"
          value={f.q}
          onChange={(e) => set("q", e.target.value)}
        />
        {lecturer && (
          <Select
            className="w-auto"
            value={f.studentId}
            onChange={(e) => set("studentId", e.target.value)}
          >
            <option value="">Semua mahasiswa</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
        <Input
          type="date"
          className="w-auto"
          value={f.from}
          onChange={(e) => set("from", e.target.value)}
          aria-label="Dari tanggal"
        />
        <span className="text-fg-muted">s/d</span>
        <Input
          type="date"
          className="w-auto"
          value={f.to}
          onChange={(e) => set("to", e.target.value)}
          aria-label="Sampai tanggal"
        />
        <div className="flex-1" />
        <Button
          variant="secondary"
          icon="download"
          disabled={!total}
          loading={exportCsv.isPending}
          onClick={() => exportCsv.mutate()}
        >
          Unduh logbook (CSV)
        </Button>
      </div>
      <Card className="p-2">
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.data.length ? (
          <Empty icon="menu_book" title="Logbook masih kosong">
            Belum ada bimbingan yang diselesaikan. Setelah bertemu, dosen
            menandai bimbingan selesai dan menulis ringkasan, lalu catatannya
            muncul di sini.
          </Empty>
        ) : (
          <Table head={["Tanggal", "Mahasiswa", "Topik", "Ringkasan dosen"]}>
            {list.data.data.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap">
                  <Link
                    to={`/consultations/${c.id}`}
                    className="font-medium text-link"
                  >
                    {fmtDate(c.startAt)}
                  </Link>
                  <p className="text-xs text-fg-muted">
                    {wibTime(c.startAt!)}–{wibTime(c.endAt!)} WIB
                  </p>
                </td>
                <td>
                  {c.student.name}
                  <p className="text-xs text-fg-muted">{c.student.nrp}</p>
                </td>
                <td>
                  <p className="font-medium">{c.topic}</p>
                  <ModeBadge mode={c.mode} />
                </td>
                <td className="max-w-md">{c.summary}</td>
              </tr>
            ))}
          </Table>
        )}
        <Pager
          meta={list.data?.meta}
          onPage={(page) => setF({ ...f, page })}
          limit={f.limit}
          onLimit={(limit) => setF({ ...f, limit, page: 1 })}
        />
      </Card>
    </>
  );
}
