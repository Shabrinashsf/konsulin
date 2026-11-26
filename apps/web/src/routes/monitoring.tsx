// US-09 (lecturer): GET /monitoring/students.
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Icon,
  Input,
  Loading,
  PageHeader,
  Pager,
  Select,
  Table,
} from "../components/ui";
import { api, errorMessage } from "../lib/api";
import { fmtDate, fmtDateTime } from "../lib/time";
import type {
  MonitoredStudent,
  Project,
  StudyProgram,
} from "../lib/types";
import { TYPES } from "./projects";

// MonitoringQueryDto rejects unknown parameters (400), so only these leave the URL for the API
const PARAMS = [
  "q",
  "projectId",
  "projectType",
  "studyProgramId",
  "degree",
  "cohortYear",
  "hasOpenRevisions",
  "overdue",
  "noConsultationSince",
  "sort",
  "order",
  "page",
  "limit",
];
// a number column reads best "most first"; empty values stay last either way (API)
const DESC_FIRST = ["openRevisions"];

export function MonitoringPage() {
  const [sp, setSp] = useSearchParams();
  const q = Object.fromEntries(
    [...sp].filter(([k]) => PARAMS.includes(k)),
  ) as Record<string, string>;
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    n.delete("page");
    setSp(n, { replace: true });
  };
  const list = useQuery({
    queryKey: ["monitoring", q],
    queryFn: () => api.list<MonitoredStudent>("/monitoring/students", q),
    placeholderData: keepPreviousData,
  });
  const projects = useQuery({
    queryKey: ["projects", "list", "all"],
    queryFn: () => api.listAll<Project>("/projects"),
  });
  const programs = useQuery({
    queryKey: ["study-programs"],
    queryFn: () => api.get<StudyProgram[]>("/study-programs"),
  });
  const sortBtn = (key: string, label: string) => (
    <button
      className="inline-flex items-center gap-0.5"
      onClick={() => {
        const n = new URLSearchParams(sp);
        const current = q.order ?? "asc";
        n.set("sort", key);
        n.set(
          "order",
          q.sort === key
            ? current === "desc"
              ? "asc"
              : "desc"
            : DESC_FIRST.includes(key)
              ? "desc"
              : "asc",
        );
        n.delete("page");
        setSp(n, { replace: true });
      }}
    >
      {label}
      {q.sort === key && (
        <Icon
          name={q.order === "desc" ? "arrow_downward" : "arrow_upward"}
          className="text-[14px]"
        />
      )}
    </button>
  );
  const year = new Date().getFullYear();
  return (
    <>
      <PageHeader title="Monitoring mahasiswa" />
      <Card className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>input]:w-full [&>select]:w-full">
        <Input
          placeholder="Cari nama atau NRP"
          defaultValue={q.q}
          onChange={(e) => set("q", e.target.value)}
        />
        <Select
          value={q.projectId ?? ""}
          onChange={(e) => set("projectId", e.target.value)}
        >
          <option value="">Semua project</option>
          {projects.data?.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Select
          value={q.projectType ?? ""}
          onChange={(e) => set("projectType", e.target.value)}
        >
          <option value="">Semua tipe project</option>
          {TYPES.map(([k, r]) => (
            <option key={k} value={k}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          value={q.studyProgramId ?? ""}
          onChange={(e) => set("studyProgramId", e.target.value)}
        >
          <option value="">Semua prodi</option>
          {programs.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          value={q.degree ?? ""}
          onChange={(e) => set("degree", e.target.value)}
        >
          <option value="">Semua jenjang</option>
          {["S1", "S2", "S3"].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </Select>
        <Select
          value={q.cohortYear ?? ""}
          onChange={(e) => set("cohortYear", e.target.value)}
        >
          <option value="">Semua angkatan</option>
          {Array.from({ length: 10 }, (_, i) => year - i).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </Select>
        <Select
          value={
            q.hasOpenRevisions
              ? `hasOpenRevisions=${q.hasOpenRevisions}`
              : q.overdue
                ? `overdue=${q.overdue}`
                : ""
          }
          onChange={(e) => {
            const n = new URLSearchParams(sp);
            n.delete("hasOpenRevisions");
            n.delete("overdue");
            n.delete("page");
            const [k, v] = e.target.value.split("=");
            if (k) n.set(k, v);
            setSp(n, { replace: true });
          }}
        >
          <option value="">Semua kondisi</option>
          <option value="hasOpenRevisions=true">Ada revisi terbuka</option>
          <option value="overdue=true">Ada folder lewat deadline</option>
          <option value="hasOpenRevisions=false">Tanpa revisi terbuka</option>
        </Select>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          Tidak bimbingan sejak
          <Input
            type="date"
            className="flex-1"
            value={q.noConsultationSince ?? ""}
            onChange={(e) => set("noConsultationSince", e.target.value)}
          />
        </label>
      </Card>
      <Card className="p-2">
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <div className="flex flex-col items-start gap-3 p-3">
            <Alert tone="danger" title="Data monitoring gagal dimuat">
              {errorMessage(list.error)}
            </Alert>
            <Button variant="secondary" onClick={() => setSp({})}>
              Reset filter
            </Button>
          </div>
        ) : !list.data?.data.length ? (
          <Empty icon="monitoring" title="Tidak ada mahasiswa yang cocok" />
        ) : (
          <Table head={[]}>
            <tr className="[&>td]:bg-surface-muted [&>td]:text-xs [&>td]:font-medium [&>td]:text-fg-muted">
              <td>{sortBtn("name", "Mahasiswa")}</td>
              <td>Project</td>
              <td>{sortBtn("lastConsultationAt", "Bimbingan terakhir")}</td>
              <td>{sortBtn("completedConsultations", "Selesai")}</td>
              <td>{sortBtn("openRevisions", "Revisi terbuka")}</td>
              <td>Lewat deadline</td>
              <td>{sortBtn("nearestDeadline", "Deadline terdekat")}</td>
            </tr>
            {list.data.data.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <Avatar name={s.name} />
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-xs text-fg-muted">
                        {s.nrp} · {s.studyProgram.name} · {s.cohortYear}
                      </p>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="flex flex-col gap-0.5">
                    {s.projects.map((p) => (
                      <Link
                        key={p.id}
                        to={`/projects/${p.id}`}
                        className="text-xs text-link"
                      >
                        {p.title}
                      </Link>
                    ))}
                  </div>
                </td>
                <td>
                  {s.lastConsultationAt ? (
                    fmtDate(s.lastConsultationAt)
                  ) : (
                    <Badge tone="secondary">Belum pernah</Badge>
                  )}
                </td>
                <td className="text-center">{s.completedConsultations}</td>
                <td className="text-center">
                  {s.openRevisions ? (
                    <Badge tone="warning">{s.openRevisions}</Badge>
                  ) : (
                    0
                  )}
                </td>
                <td className="text-center">
                  {s.overdueFolders ? (
                    <Badge tone="danger">{s.overdueFolders}</Badge>
                  ) : (
                    0
                  )}
                </td>
                <td>
                  {s.nearestDeadline ? (
                    <Link
                      to={`/folders/${s.nearestDeadline.folderId}`}
                      className="text-xs"
                    >
                      <span className="font-medium text-link">
                        {s.nearestDeadline.title}
                      </span>
                      <br />
                      <span className="text-fg-muted">
                        {fmtDateTime(s.nearestDeadline.deadlineAt)}
                      </span>
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <Pager
          meta={list.data?.meta}
          limit={Number(q.limit ?? 10)}
          onLimit={(n) => {
            const next = new URLSearchParams(sp);
            next.set("limit", String(n));
            next.delete("page");
            setSp(next, { replace: true });
          }}
          onPage={(p) => {
            const n = new URLSearchParams(sp);
            n.set("page", String(p));
            setSp(n);
          }}
        />
      </Card>
    </>
  );
}
