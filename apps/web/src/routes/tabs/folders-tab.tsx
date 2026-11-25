// US-07: GET/POST /projects/:id/folders, PATCH /folders/:id (shared form).
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  IconBox,
  Input,
  Loading,
  Modal,
  Pager,
  Select,
  Textarea,
} from "../../components/ui";
import { DeadlineBadge } from "../../components/status";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { fmtDateTime, wibDate, wibIso, wibTime } from "../../lib/time";
import { useAction } from "../../lib/use-action";
import type {
  Folder,
  Member,
  ProjectDetail,
  RevisionItemContext,
} from "../../lib/types";
import { useProjectRevisions } from "../../components/revision-bits";

export function FoldersTab({ project }: { project: ProjectDetail }) {
  const me = useMe();
  const [f, setF] = useState({
    q: "",
    studentId: "",
    filter: "",
    sort: "",
    page: 1,
  });
  const [creating, setCreating] = useState(false);
  const revisions = useProjectRevisions(project.id);
  const lecturer = me.role === "lecturer";
  const members = useQuery({
    queryKey: ["projects", project.id, "members", "all"],
    queryFn: () =>
      api.list<Member>(`/projects/${project.id}/members`, { limit: 100 }),
    enabled: lecturer,
  });
  const list = useQuery({
    queryKey: ["folders", project.id, f],
    queryFn: () =>
      api.list<Folder>(`/projects/${project.id}/folders`, {
        q: f.q,
        studentId: f.studentId,
        page: f.page,
        sort: f.sort,
        hasDeadline:
          f.filter === "deadline"
            ? true
            : f.filter === "nodeadline"
              ? false
              : undefined,
        overdue: f.filter === "overdue" || undefined,
      }),
    placeholderData: keepPreviousData,
  });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v, page: 1 });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[
          ["", "Semua"],
          ["deadline", "Ada deadline"],
          ["nodeadline", "Tanpa deadline"],
          ["overdue", "Lewat deadline"],
        ].map(([v, l]) => (
          <Chip
            key={v}
            active={f.filter === v}
            onClick={() => set("filter", v)}
          >
            {l}
          </Chip>
        ))}
        <div className="flex-1" />
        {lecturer && project.trackMode === "individual" && (
          <Select
            className="w-auto"
            value={f.studentId}
            onChange={(e) => set("studentId", e.target.value)}
          >
            <option value="">Semua mahasiswa</option>
            {members.data?.data.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          className="w-auto"
          value={f.sort}
          onChange={(e) => set("sort", e.target.value)}
        >
          <option value="">Terbaru</option>
          <option value="deadline">Deadline terdekat</option>
        </Select>
        <Input
          className="w-full sm:w-56"
          placeholder="Cari judul folder"
          value={f.q}
          onChange={(e) => set("q", e.target.value)}
        />
        <Button icon="create_new_folder" onClick={() => setCreating(true)}>
          Folder baru
        </Button>
      </div>
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.data.length ? (
        <Card>
          <Empty icon="folder" title="Belum ada folder">
            Folder per deliverable (mis. Bab 1). Setiap unggahan menjadi versi
            baru.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data.data.map((x) => (
            <Link
              key={x.id}
              to={`/folders/${x.id}`}
              className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-3">
                <IconBox icon="folder" />
                <div className="min-w-0 flex-1">
                  <p className="text-title-sub font-medium">{x.title}</p>
                  <p className="text-xs text-fg-muted">
                    {x.student ? x.student.name : "Folder tim"} ·{" "}
                    {x.versionCount} versi
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DeadlineBadge value={x.deadlineStatus} />
                {x.deadlineAt && (
                  <span className="text-xs text-fg-muted">
                    Deadline {fmtDateTime(x.deadlineAt)}
                  </span>
                )}
              </div>
              <RevisionSummary
                items={(revisions.data?.data ?? []).filter(
                  (i) => i.folder.id === x.id,
                )}
                versionCount={x.versionCount}
                lecturer={lecturer}
              />
            </Link>
          ))}
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={(page) => setF({ ...f, page })} />
      {creating && (
        <FolderForm
          project={project}
          members={members.data?.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}

/** Revision progress on a folder card, phrased as the viewer's next step. */
function RevisionSummary({
  items,
  versionCount,
  lecturer,
}: {
  items: RevisionItemContext[];
  versionCount: number;
  lecturer: boolean;
}) {
  if (!items.length) {
    return (
      <p className="border-t border-border pt-3 text-xs text-fg-muted">
        {!versionCount
          ? lecturer
            ? "Menunggu mahasiswa mengunggah draft"
            : "Belum ada versi — unggah draft pertama"
          : lecturer
            ? "Belum ada revisi — buka untuk memberi feedback"
            : "Belum ada feedback dari dosen"}
      </p>
    );
  }
  const done = items.filter((i) => i.status === "verified").length;
  const review = items.filter((i) => i.status === "addressed").length;
  const todo = items.length - done - review;
  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          Revisi {done}/{items.length} terverifikasi
        </span>
        <span className="text-fg-muted">
          {lecturer
            ? review
              ? `${review} menunggu review Anda`
              : todo
                ? `${todo} belum dikerjakan`
                : "Selesai"
            : todo
              ? `${todo} perlu diperbaiki`
              : review
                ? `${review} menunggu review dosen`
                : "Selesai"}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary-subtle">
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${(done / items.length) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Create (project given) or edit (folder given). Deadline and owner are lecturer-only. */
export function FolderForm({
  project,
  members = [],
  folder,
  onClose,
}: {
  project?: ProjectDetail;
  members?: Member[];
  folder?: Folder;
  onClose: () => void;
}) {
  const me = useMe();
  const nav = useNavigate();
  const lecturer = me.role === "lecturer";
  const [f, setF] = useState({
    title: folder?.title ?? "",
    description: folder?.description ?? "",
    studentId: "",
    date: folder?.deadlineAt ? wibDate(folder.deadlineAt) : "",
    time: folder?.deadlineAt ? wibTime(folder.deadlineAt) : "23:59",
  });
  const deadlineAt = f.date ? wibIso(f.date, f.time) : null;
  const save = useAction(
    () => {
      const body = {
        title: f.title,
        description: f.description || null,
        ...(lecturer ? { deadlineAt } : {}),
      };
      return folder
        ? api.patch<Folder>(`/folders/${folder.id}`, body)
        : api.post<Folder>(`/projects/${project!.id}/folders`, {
            ...body,
            ...(lecturer && project!.trackMode === "individual"
              ? { studentId: f.studentId }
              : {}),
          });
    },
    {
      success: folder ? "Folder diperbarui" : "Folder dibuat",
      onDone: (r) => {
        onClose();
        if (!folder) nav(`/folders/${r.id}`);
      },
    },
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={folder ? "Ubah folder" : "Folder baru"}
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
          onChange={(e) => setF({ ...f, title: e.target.value })}
          placeholder="mis. Bab 2 Tinjauan Pustaka"
        />
      </Field>
      <Field label="Deskripsi">
        <Textarea
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
        />
      </Field>
      {!folder && lecturer && project?.trackMode === "individual" && (
        <Field
          label="Milik mahasiswa"
          required
          hint="Project individual: folder hanya terlihat oleh mahasiswa ini dan Anda."
        >
          <Select
            value={f.studentId}
            onChange={(e) => setF({ ...f, studentId: e.target.value })}
          >
            <option value="">Pilih mahasiswa</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.nrp}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {lecturer ? (
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field
            label="Deadline (opsional)"
            hint="Kosongkan untuk tanpa deadline. Harus di masa depan."
          >
            <Input
              type="date"
              value={f.date}
              onChange={(e) => setF({ ...f, date: e.target.value })}
            />
          </Field>
          <Field label="Jam (WIB)">
            <Input
              type="time"
              value={f.time}
              onChange={(e) => setF({ ...f, time: e.target.value })}
              disabled={!f.date}
            />
          </Field>
        </div>
      ) : (
        <p className="text-xs text-fg-muted">
          Deadline hanya dapat diatur oleh dosen.
        </p>
      )}
    </Modal>
  );
}
