// US-08: GET /projects/:id/revision-items. US-06: GET /projects/:id/logbook.
import { useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  IconBox,
  Input,
  Loading,
  Pager,
  Select,
  Table,
} from "../../components/ui";
import { useAction } from "../../lib/use-action";
import {
  RevisionRow,
  useProjectRevisions,
} from "../../components/revision-bits";
import { ModeBadge } from "../../components/status";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { fmtDate, wibTime } from "../../lib/time";
import type {
  Consultation,
  Member,
  ProjectDetail,
  RevisionStatus,
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

const STATUS: [RevisionStatus, string][] = [
  ["open", "Belum dikerjakan"],
  ["addressed", "Menunggu review"],
  ["reopened", "Perlu perbaikan ulang"],
  ["verified", "Terverifikasi"],
];
const PREVIEW = 5;

/**
 * Default view is a summary, not every checklist item: what needs me now (a few rows) plus one line per folder.
 * Picking a status chip lists the items of that status.
 */
export function RevisionsTab({ project }: { project: ProjectDetail }) {
  const me = useMe();
  const lecturer = me.role === "lecturer";
  const members = useMembers(project);
  const [status, setStatus] = useState<RevisionStatus | "">("");
  const [studentId, setStudentId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const all = useProjectRevisions(project.id, studentId ? { studentId } : {});
  const items = all.data?.data ?? [];
  const count = (s: RevisionStatus) =>
    items.filter((i) => i.status === s).length;
  const canAddress = (folderStudentId: string | null) =>
    !lecturer && (!folderStudentId || folderStudentId === me.id);
  const ownerName = (id: string | null) =>
    id
      ? (members.find((m) => m.id === id)?.name ?? (id === me.id ? "Anda" : ""))
      : "Folder tim";

  const mine = items.filter((i) =>
    lecturer
      ? i.status === "addressed"
      : i.status === "open" || i.status === "reopened",
  );
  const folders = [
    ...new Map(items.map((i) => [i.folder.id, i.folder])).values(),
  ]
    .map((f) => {
      const rows = items.filter((i) => i.folder.id === f.id);
      const n = (s: RevisionStatus) =>
        rows.filter((i) => i.status === s).length;
      return {
        folder: f,
        total: rows.length,
        done: n("verified"),
        open: n("open"),
        review: n("addressed"),
        reopened: n("reopened"),
      };
    })
    .sort(
      (x, y) =>
        (lecturer
          ? y.review - x.review
          : y.open + y.reopened - x.open - x.reopened) ||
        x.folder.title.localeCompare(y.folder.title),
    );
  const shown = items.filter((i) => i.status === status);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={!status} onClick={() => setStatus("")}>
          Ringkasan
        </Chip>
        {STATUS.map(([v, l]) => (
          <Chip key={v} active={status === v} onClick={() => setStatus(v)}>
            {l} <span className="opacity-70">{count(v)}</span>
          </Chip>
        ))}
        <div className="flex-1" />
        {lecturer && project.trackMode === "individual" && (
          <Select
            className="w-auto"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Semua mahasiswa</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {all.isLoading ? (
        <Loading />
      ) : !items.length ? (
        <Card>
          <Empty icon="checklist" title="Belum ada revisi">
            {lecturer ? (
              <>
                Buka folder di tab Submission, pilih versi draft, lalu{" "}
                <b>Beri feedback & revisi</b>.
              </>
            ) : (
              "Revisi muncul setelah dosen memberi feedback pada draft Anda."
            )}
          </Empty>
        </Card>
      ) : status ? (
        !shown.length ? (
          <Card>
            <Empty icon="checklist" title="Tidak ada item dengan status ini" />
          </Card>
        ) : (
          <Card className="flex flex-col gap-2">
            {shown.map((i) => (
              <RevisionRow
                key={i.id}
                item={i}
                showFolder
                canAddress={canAddress(i.folder.studentId)}
              />
            ))}
          </Card>
        )
      ) : (
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-title-sub font-medium">
                {lecturer ? "Menunggu review Anda" : "Perlu Anda perbaiki"}
              </h3>
              <Badge
                tone={mine.length ? (lecturer ? "info" : "warning") : "success"}
              >
                {mine.length}
              </Badge>
            </div>
            {!mine.length ? (
              <p className="text-fg-muted">
                {lecturer
                  ? "Tidak ada perbaikan yang menunggu review."
                  : "Tidak ada item yang perlu diperbaiki."}
              </p>
            ) : (
              <>
                {(showAll ? mine : mine.slice(0, PREVIEW)).map((i) => (
                  <RevisionRow
                    key={i.id}
                    item={i}
                    showFolder
                    canAddress={canAddress(i.folder.studentId)}
                  />
                ))}
                {mine.length > PREVIEW && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    icon={showAll ? "expand_less" : "expand_more"}
                    onClick={() => setShowAll(!showAll)}
                  >
                    {showAll
                      ? "Tampilkan lebih sedikit"
                      : `Tampilkan semua (${mine.length})`}
                  </Button>
                )}
              </>
            )}
          </Card>

          <Card className="p-2">
            <h3 className="px-3 pt-3 pb-1 text-title-sub font-medium">
              Per folder
            </h3>
            <Table
              head={[
                "Folder",
                "Progres",
                "Belum dikerjakan",
                "Menunggu review",
                "Perbaikan ulang",
                "",
              ]}
            >
              {folders.map((r) => (
                <tr key={r.folder.id}>
                  <td>
                    <Link
                      to={`/folders/${r.folder.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {r.folder.title}
                    </Link>
                    <p className="text-xs text-fg-muted">
                      {ownerName(r.folder.studentId)}
                    </p>
                  </td>
                  <td className="min-w-40">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary-subtle">
                        <div
                          className="h-full rounded-full bg-success"
                          style={{ width: `${(r.done / r.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-fg-muted tabular-nums">
                        {r.done}/{r.total}
                      </span>
                    </div>
                  </td>
                  <td className="tabular-nums">{r.open || "-"}</td>
                  <td>
                    {r.review ? <Badge tone="info">{r.review}</Badge> : "-"}
                  </td>
                  <td>
                    {r.reopened ? (
                      <Badge tone="danger">{r.reopened}</Badge>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="text-right">
                    <Link to={`/folders/${r.folder.id}`}>
                      <Button size="sm" variant="secondary" icon="folder_open">
                        Buka folder
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            <p className="px-3 pt-3 pb-2 text-xs text-fg-muted">
              <b className="font-medium text-fg-soft">Menunggu review</b>:
              mahasiswa sudah menandai item diperbaiki dan menunjuk versi
              perbaikannya. ·{" "}
              <b className="font-medium text-fg-soft">Perbaikan ulang</b>:
              perbaikan itu sudah {lecturer ? "Anda" : "dosen"} cek tetapi belum
              sesuai, jadi mahasiswa harus memperbaiki lagi di versi yang lebih
              baru.
            </p>
          </Card>
        </div>
      )}
    </>
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
        <Pager meta={list.data?.meta} onPage={(page) => setF({ ...f, page })} />
      </Card>
    </>
  );
}
