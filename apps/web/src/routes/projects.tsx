// US-02: GET/POST /projects, PATCH/DELETE /projects/:id.
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Icon,
  IconBox,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pager,
  Select,
  Textarea,
} from "../components/ui";
import { api } from "../lib/api";
import { useMe } from "../lib/auth";
import { fmtDate, todayWIB } from "../lib/time";
import { useAction } from "../lib/use-action";
import {
  PROJECT_TYPE_RULES,
  type Project,
  type ProjectType,
} from "../lib/types";

export const TYPES = Object.entries(PROJECT_TYPE_RULES) as [
  ProjectType,
  (typeof PROJECT_TYPE_RULES)[ProjectType],
][];

export function ProjectsPage() {
  const me = useMe();
  const [sp, setSp] = useSearchParams();
  const q = Object.fromEntries(sp);
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    n.delete("page");
    setSp(n, { replace: true });
  };
  const list = useQuery({
    queryKey: ["projects", "list", q],
    queryFn: () => api.list<Project>("/projects", { ...q, limit: 9 }),
    placeholderData: keepPreviousData,
  });
  const [creating, setCreating] = useState(false);
  const lecturer = me.role === "lecturer";

  return (
    <>
      <PageHeader
        title={lecturer ? "Project Bimbingan" : "Project Saya"}
        actions={
          lecturer && (
            <Button icon="add" onClick={() => setCreating(true)}>
              Buat Project
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip active={!q.degree} onClick={() => set("degree", "")}>
          Semua
        </Chip>
        {(["S1", "S2", "S3"] as const).map((d) => (
          <Chip
            key={d}
            active={q.degree === d}
            onClick={() => set("degree", d)}
          >
            {d}
          </Chip>
        ))}
        <div className="flex-1" />
        <Select
          className="w-auto"
          value={q.type ?? ""}
          onChange={(e) => set("type", e.target.value)}
        >
          <option value="">Semua tipe</option>
          {TYPES.map(([k, r]) => (
            <option key={k} value={k}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={q.sort ?? ""}
          onChange={(e) => set("sort", e.target.value)}
        >
          <option value="">Terbaru</option>
          <option value="title">Judul</option>
          <option value="startDate">Tanggal mulai</option>
        </Select>
        <div className="relative w-full sm:w-64">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[20px] text-fg-muted"
          />
          <Input
            className="w-full pl-10"
            placeholder="Cari judul project"
            defaultValue={q.q}
            onChange={(e) => set("q", e.target.value)}
          />
        </div>
      </div>
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.data.length ? (
        <Card>
          <Empty icon="folder_shared" title="Belum ada project">
            {lecturer
              ? "Buat project untuk mulai mengundang mahasiswa."
              : "Terima undangan dari dosen untuk bergabung ke project."}
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data.data.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="card group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-3">
                <IconBox
                  icon={p.trackMode === "individual" ? "school" : "groups"}
                />
                <div className="min-w-0">
                  <p className="line-clamp-2 text-title-sub font-medium group-hover:text-primary">
                    {p.title}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {lecturer ? `${p.memberCount} mahasiswa` : p.lecturer.name}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="navy">{p.label}</Badge>
                {p.requiredDegree && (
                  <Badge tone="secondary">{p.requiredDegree}</Badge>
                )}
                <Badge tone={p.trackMode === "individual" ? "info" : "orange"}>
                  {p.trackMode === "individual" ? "Individual" : "Shared"}
                </Badge>
              </div>
              <p className="text-xs text-fg-muted">
                {fmtDate(p.startDate)} –{" "}
                {p.endDate ? fmtDate(p.endDate) : "sekarang"}
              </p>
            </Link>
          ))}
        </div>
      )}
      <Pager
        meta={list.data?.meta}
        onPage={(p) => {
          const n = new URLSearchParams(sp);
          n.set("page", String(p));
          setSp(n);
        }}
      />
      {creating && <ProjectForm open onClose={() => setCreating(false)} />}
    </>
  );
}

export function ProjectForm({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project;
}) {
  const nav = useNavigate();
  const init = () => ({
    title: project?.title ?? "",
    description: project?.description ?? "",
    type: project?.type ?? "s1_thesis",
    startDate: project?.startDate ?? todayWIB(),
    endDate: project?.endDate ?? "",
  });
  const [f, setF] = useState(init);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const save = useAction(
    () =>
      project
        ? api.patch(`/projects/${project.id}`, {
            ...f,
            endDate: f.endDate || null,
            ...(f.type === project.type ? { type: undefined } : {}),
          })
        : api.post<Project>("/projects", { ...f, endDate: f.endDate || null }),
    {
      success: project ? "Project diperbarui" : "Project dibuat",
      onDone: (r) => {
        onClose();
        if (!project) nav(`/projects/${(r as Project).id}?tab=undangan`);
      },
    },
  );
  const rule = PROJECT_TYPE_RULES[f.type as ProjectType];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={project ? "Ubah project" : "Buat project"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <Field label="Judul" required>
        <Input
          value={f.title}
          onChange={set("title")}
          maxLength={200}
          placeholder="mis. Tugas Akhir 2026 — Kelompok A"
        />
      </Field>
      <Field
        label="Tipe project"
        required
        hint={`${rule.degree ? `Khusus mahasiswa ${rule.degree}` : "Semua jenjang"} · ${rule.trackMode === "individual" ? "pekerjaan tiap mahasiswa privat" : "semua anggota melihat semua data"}. Terkunci setelah ada anggota/undangan.`}
      >
        <Select value={f.type} onChange={set("type")}>
          {TYPES.map(([k, r]) => (
            <option key={k} value={k}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tanggal mulai" required>
          <Input type="date" value={f.startDate} onChange={set("startDate")} />
        </Field>
        <Field label="Tanggal selesai">
          <Input type="date" value={f.endDate} onChange={set("endDate")} />
        </Field>
      </div>
      <Field label="Deskripsi">
        <Textarea
          value={f.description}
          onChange={set("description")}
          maxLength={5000}
        />
      </Field>
    </Modal>
  );
}
