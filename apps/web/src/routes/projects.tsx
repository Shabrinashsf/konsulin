// US-02: GET/POST /projects, PATCH/DELETE /projects/:id.
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Alert,
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
import { api, errorMessage } from "../lib/api";
import { useMe } from "../lib/auth";
import { todayWIB } from "../lib/time";
import { useAction } from "../lib/use-action";
import {
  PROJECT_TYPE_RULES,
  type Project,
  type ProjectDetail,
  type ProjectType,
} from "../lib/types";

export const TYPES = Object.entries(PROJECT_TYPE_RULES) as [
  ProjectType,
  (typeof PROJECT_TYPE_RULES)[ProjectType],
][];

// ProjectQueryDto rejects unknown parameters (400), so only these leave the URL for the API
const PARAMS = ["q", "type", "degree", "sort", "page"];

export function ProjectsPage() {
  const me = useMe();
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
    queryKey: ["projects", "list", q],
    queryFn: () => api.list<Project>("/projects", {
        ...q,
        limit: 9,
        // the API defaults to newest-first; titles read A→Z
        ...(q.sort === "title" && { order: "asc" }),
      }),
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
      ) : list.error ? (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="danger" title="Daftar project gagal dimuat">
            {errorMessage(list.error)}
          </Alert>
          <Button variant="secondary" onClick={() => setSp({})}>
            Reset filter
          </Button>
        </div>
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
              <div>
                <Badge tone="navy">{p.label}</Badge>
              </div>
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
  project?: Project | ProjectDetail;
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
  const body = {
    ...f,
    description: f.description.trim() || null,
    endDate: f.endDate || null,
  };
  // same limits as CreateProjectDto, so the user sees them before the API answers 400
  const invalid =
    f.title.trim().length < 3 ||
    !f.startDate ||
    (!!f.endDate && f.endDate < f.startDate);
  // PATCH answers 409 PROJECT_TYPE_LOCKED once there is a member or a pending invitation
  const typeLocked =
    !!project &&
    "summary" in project &&
    project.summary.memberCount + (project.summary.pendingInvitationCount ?? 0) >
      0;
  const save = useAction(
    () =>
      project
        ? api.patch(`/projects/${project.id}`, {
            ...body,
            ...(f.type === project.type ? { type: undefined } : {}),
          })
        : api.post<Project>("/projects", body),
    {
      success: project ? "Project diperbarui" : "Project dibuat",
      onDone: (r) => {
        onClose();
        if (!project) nav(`/projects/${(r as Project).id}?tab=anggota`);
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
          <Button
            loading={save.isPending}
            disabled={invalid}
            onClick={() => save.mutate()}
          >
            Simpan
          </Button>
        </>
      }
    >
      <Field label="Judul" hint="3–200 karakter" required>
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
        hint={`${rule.degree ? `Khusus mahasiswa ${rule.degree}` : "Semua jenjang"} · ${rule.trackMode === "individual" ? "pekerjaan tiap mahasiswa privat" : "semua anggota melihat semua data"}. ${typeLocked ? "Terkunci: project sudah punya anggota atau undangan aktif." : "Terkunci setelah ada anggota/undangan."}`}
      >
        <Select value={f.type} onChange={set("type")} disabled={typeLocked}>
          {TYPES.map(([k, r]) => (
            <option key={k} value={k}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tanggal mulai" required>
          <Input
            type="date"
            value={f.startDate}
            onChange={set("startDate")}
            required
          />
        </Field>
        <Field label="Tanggal selesai">
          <Input
            type="date"
            value={f.endDate}
            min={f.startDate}
            onChange={set("endDate")}
          />
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
