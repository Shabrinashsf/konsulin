// US-07/US-08: folder, version history, and feedback + revision checklist per version.
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, Chip, Empty, Field, Icon, IconButton, Loading, Modal, PageHeader, Textarea, ConfirmDialog } from "../components/ui";
import { DeadlineBadge } from "../components/status";
import { api, errorMessage } from "../lib/api";
import { useMe } from "../lib/auth";
import { fmtDateTime, fmtSize } from "../lib/time";
import { useAction } from "../lib/use-action";
import type {
  Feedback,
  FolderDetail,
  Page,
  RevisionItemContext,
  Version,
} from "../lib/types";
import { FolderForm } from "./tabs/folders-tab";
import {
  FeedbackDialog,
  RevisionRow,
  useProjectRevisions,
} from "../components/revision-bits";

type Stats = { total: number; done: number; review: number; todo: number };
const statsOf = (items: RevisionItemContext[]): Stats => ({
  total: items.length,
  done: items.filter((i) => i.status === "verified").length,
  review: items.filter((i) => i.status === "addressed").length,
  todo: items.filter((i) => i.status === "open" || i.status === "reopened")
    .length,
});

/** Fixing an item needs a version newer than the feedback's version and than the last claim (BR-14). */
const needsNewVersion = (i: RevisionItemContext, latest: Version) =>
  Math.max(i.version.versionNumber, i.addressedInVersion?.versionNumber ?? 0) >=
  latest.versionNumber;

/** One sentence about what happens next on this folder, with the one action that moves it forward. */
function FolderNext({
  lecturer,
  canAddress,
  items,
  latest,
}: {
  lecturer: boolean;
  canAddress: boolean;
  items: RevisionItemContext[];
  latest: Version;
}) {
  const st = statsOf(items);
  if (!st.total) return null;
  const todo = items.filter((i) => i.status === "open" || i.status === "reopened");
  let tone: "success" | "warning" | "info" = "info";
  let title = "";
  if (st.done === st.total) {
    tone = "success";
    title = "Semua revisi sudah terverifikasi";
  } else if (lecturer) {
    if (st.review) {
      tone = "warning";
      title = `${st.review} revisi menunggu Anda: verifikasi atau minta perbaiki ulang`;
    } else title = `Menunggu mahasiswa memperbaiki ${st.todo} revisi`;
  } else if (canAddress && todo.length) {
    tone = "warning";
    const stuck = todo.filter((i) => needsNewVersion(i, latest)).length;
    title = `${st.todo} revisi perlu diperbaiki: ${
      stuck === 0
        ? "tandai yang sudah Anda perbaiki"
        : stuck === todo.length
          ? "unggah versi baru (tombol di kanan atas), lalu tandai tiap revisi"
          : "tandai yang sudah diperbaiki, atau unggah versi baru untuk item “Perlu versi baru”"
    }`;
  } else if (st.review) title = `${st.review} revisi menunggu dicek dosen`;
  else title = `${st.done}/${st.total} revisi selesai`;
  return (
    <div className="mb-5">
      <Alert tone={tone}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="min-w-0 flex-1 basis-64 font-medium">{title}</span>
          <span className="text-[13px] text-fg-muted">
            {st.done}/{st.total} selesai
          </span>
        </div>
      </Alert>
    </div>
  );
}

export function FolderDetailPage() {
  const { folderId = "" } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [dialog, setDialog] = useState<null | "upload" | "edit" | "delete">(
    null,
  );
  const folder = useQuery({
    queryKey: ["folders", "detail", folderId],
    queryFn: () => api.get<FolderDetail>(`/folders/${folderId}`),
  });
  const versions = useQuery({
    queryKey: ["folders", folderId, "versions"],
    queryFn: () => api.listAll<Version>(`/folders/${folderId}/versions`),
    enabled: !!folder.data,
  });
  const revisions = useProjectRevisions(folder.data?.projectId ?? "", {
    folderId,
  });
  // ?unggah=1 (from "Tandai sudah diperbaiki" when there is no newer version yet) opens the upload dialog
  useEffect(() => {
    const f = folder.data;
    if (!sp.get("unggah") || !f) return;
    if (me.role !== "lecturer" && (!f.studentId || f.studentId === me.id))
      setDialog("upload");
    const n = new URLSearchParams(sp);
    n.delete("unggah");
    setSp(n, { replace: true });
  }, [sp, folder.data, me.role, me.id, setSp]);
  const del = useAction(() => api.del(`/folders/${folderId}`), {
    success: "Folder dihapus",
    onDone: () => nav(`/projects/${folder.data!.projectId}?tab=submission`),
  });

  if (folder.isLoading) return <Loading />;
  if (folder.error)
    return (
      <>
        <PageHeader title="Folder" back="/projects" />
        <Alert tone="danger" title="Folder tidak ditemukan">
          {errorMessage(folder.error)}
        </Alert>
      </>
    );
  const f = folder.data!;
  const list = (versions.data as Page<Version> | undefined)?.data ?? [];
  const current = list.find((v) => v.id === sp.get("versi")) ?? list[0];
  const select = (id: string) => setSp({ versi: id }, { replace: true });
  const lecturer = me.role === "lecturer";
  const canEdit = lecturer || f.createdBy === me.id;
  const canUpload = !lecturer && (!f.studentId || f.studentId === me.id);
  const items = revisions.data?.data ?? [];
  const byVersion = (id: string) =>
    statsOf(items.filter((i) => i.version.id === id));

  return (
    <>
      <PageHeader
        title={f.title}
        back={`/projects/${f.projectId}?tab=submission`}
        subtitle={
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <DeadlineBadge value={f.deadlineStatus} />
            <span className="text-xs">
              {f.project.title} · {f.student ? f.student.name : "Folder tim"}
              {f.deadlineAt && ` · Deadline ${fmtDateTime(f.deadlineAt)}`}
            </span>
          </div>
        }
        actions={
          <>
            {canUpload && (
              <Button icon="upload" onClick={() => setDialog("upload")}>
                Unggah versi baru
              </Button>
            )}
            {canEdit && (
              <IconButton
                icon="edit"
                label="Ubah folder"
                variant="shadow"
                onClick={() => setDialog("edit")}
              />
            )}
            {canEdit && (
              <IconButton
                icon="delete"
                label="Hapus folder"
                variant="shadow"
                onClick={() => setDialog("delete")}
              />
            )}
          </>
        }
      />
      {f.description && (
        <p className="-mt-2 mb-4 max-w-3xl text-fg-muted">{f.description}</p>
      )}
      {f.deadlineStatus === "overdue" && canUpload && (
        <div className="mb-4">
          <Alert tone="danger" title="Deadline sudah lewat">
            Anda tetap dapat mengunggah; versi akan ditandai terlambat.
          </Alert>
        </div>
      )}

      {list.length > 0 && (
        <FolderNext
          lecturer={lecturer}
          canAddress={canUpload}
          items={items}
          latest={list[0]}
        />
      )}

      {!list.length ? (
        <Card>
          <Empty icon="upload_file" title="Belum ada versi">
            {canUpload
              ? "Unggah draft pertama (PDF, DOCX, atau ZIP, maks. 50 MB)."
              : "Menunggu mahasiswa mengunggah draft. Feedback & revisi diberikan pada versi yang diunggah."}
          </Empty>
        </Card>
      ) : (
        <>
          {list.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-fg-muted">Versi</span>
              {list.map((v) => {
                const st = byVersion(v.id);
                const need = lecturer ? st.review : st.todo;
                return (
                  <Chip
                    key={v.id}
                    active={v.id === current?.id}
                    onClick={() => select(v.id)}
                  >
                    v{v.versionNumber}
                    {v.id === list[0].id ? " (terbaru)" : ""}
                    {need > 0 && (
                      <Badge tone={lecturer ? "info" : "warning"}>{need}</Badge>
                    )}
                  </Chip>
                );
              })}
            </div>
          )}
          {current && (
            <VersionPanel
              key={current.id}
              folder={f}
              version={current}
              items={items.filter((i) => i.version.id === current.id)}
              latest={list[0]}
            />
          )}
        </>
      )}

      {dialog === "upload" && (
        <UploadDialog
          folder={f}
          onClose={() => setDialog(null)}
          onUploaded={(v) => {
            // Land on the newest version that still has items to fix, so "Tandai sudah diperbaiki" is right there.
            const pending = list.find((x) => byVersion(x.id).todo > 0);
            select(pending ? pending.id : v.id);
          }}
        />
      )}
      {dialog === "edit" && (
        <FolderForm folder={f} onClose={() => setDialog(null)} />
      )}
      <Modal
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title="Hapus folder?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              disabled={!lecturer && f.versionCount > 0}
              onClick={() => del.mutate()}
            >
              Hapus
            </Button>
          </>
        }
      >
        <p>
          Folder <b>{f.title}</b> beserta versi, feedback, dan item revisinya
          akan disembunyikan.
        </p>
        {!lecturer &&
          (f.versionCount > 0 ? (
            <Alert tone="warning">
              Folder ini sudah berisi {f.versionCount} versi, jadi hanya dosen
              yang dapat menghapusnya.
            </Alert>
          ) : (
            <p className="text-xs text-fg-muted">
              Mahasiswa hanya dapat menghapus folder yang belum berisi versi.
            </p>
          ))}
      </Modal>
    </>
  );
}

/** One version: its file, then each feedback with its own revision checklist. */
function VersionPanel({
  folder,
  version: v,
  items,
  latest,
}: {
  folder: FolderDetail;
  version: Version;
  items: RevisionItemContext[];
  latest: Version;
}) {
  const me = useMe();
  const lecturer = me.role === "lecturer";
  const [giving, setGiving] = useState(false);
  const feedbacks = useQuery({
    queryKey: ["versions", v.id, "feedbacks"],
    queryFn: () => api.get<Feedback[]>(`/versions/${v.id}/feedbacks`),
  });
  const download = useAction(() => api.download(`/versions/${v.id}/download`));
  const canAddress =
    !lecturer && (!folder.studentId || folder.studentId === me.id);
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-lg border border-border">
          <Icon
            name={
              v.mimeType.includes("pdf")
                ? "picture_as_pdf"
                : v.mimeType.includes("zip")
                  ? "folder_zip"
                  : "description"
            }
            className="text-[28px] text-danger"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {v.originalName}
            {v.late && <Badge tone="orange">Terlambat</Badge>}
          </p>
          <p className="text-xs text-fg-muted">
            v{v.versionNumber}
            {v.id === latest.id ? " (terbaru)" : ""} · {fmtSize(v.sizeBytes)} ·{" "}
            {v.uploader.name}, {fmtDateTime(v.createdAt)}
          </p>
          {v.note && <p className="mt-1">“{v.note}”</p>}
        </div>
        <Button
          variant="subtle"
          icon="download"
          loading={download.isPending}
          onClick={() => download.mutate()}
        >
          Unduh
        </Button>
        {lecturer && (
          <Button icon="rate_review" onClick={() => setGiving(true)}>
            Beri feedback & revisi
          </Button>
        )}
      </Card>
      {feedbacks.isLoading ? (
        <Loading />
      ) : !feedbacks.data?.length ? (
        <Card>
          <Empty
            icon="rate_review"
            title={`Belum ada feedback untuk v${v.versionNumber}`}
          >
            {lecturer
              ? "Klik “Beri feedback & revisi” untuk menulis komentar dan checklist revisi untuk versi ini."
              : "Dosen akan memberi feedback dan checklist revisi pada versi ini."}
          </Empty>
        </Card>
      ) : (
        feedbacks.data.map((fb, idx) => (
          <FeedbackCard
            key={fb.id}
            fb={fb}
            n={feedbacks.data!.length - idx}
            versionNumber={v.versionNumber}
            items={items.filter((i) => i.feedbackId === fb.id)}
            canAddress={canAddress}
            latest={latest}
            total={feedbacks.data!.length}
          />
        ))
      )}
      {giving && (
        <FeedbackDialog version={v} onClose={() => setGiving(false)} />
      )}
    </div>
  );
}

function FeedbackCard({
  fb,
  n,
  versionNumber,
  items,
  canAddress,
  latest,
  total,
}: {
  fb: Feedback;
  n: number;
  versionNumber: number;
  items: RevisionItemContext[];
  canAddress: boolean;
  latest: Version;
  total: number;
}) {
  const me = useMe();
  const lecturer = me.role === "lecturer";
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(fb.content);
  const save = useAction(() => api.patch(`/feedbacks/${fb.id}`, { content }), {
    success: "Feedback diperbarui",
    onDone: () => setEditing(false),
  });
  const [deleting, setDeleting] = useState(false);
  const del = useAction(() => api.del(`/feedbacks/${fb.id}`), {
    success: "Feedback dihapus",
    onDone: () => setDeleting(false),
  });
  const started = items.some((i) => i.status !== "open"); // BR-25: only while every item is untouched
  const st = statsOf(items);
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Icon name="rate_review" className="text-[22px] text-primary" />
        <div className="flex-1">
          <p className="font-medium">
            Feedback{total > 1 ? ` #${n}` : ""} dosen
          </p>
          <p className="text-xs text-fg-muted">
            {fmtDateTime(fb.createdAt)}
            {fb.updatedAt !== fb.createdAt && " · diubah"}
          </p>
        </div>
        {lecturer && !editing && (
          <>
            <IconButton
              icon="edit"
              label="Ubah isi feedback"
              size="sm"
              onClick={() => setEditing(true)}
            />
            <IconButton
              icon="delete"
              label={started ? "Tidak bisa dihapus: item revisi sudah dikerjakan mahasiswa" : "Hapus feedback"}
              size="sm"
              disabled={started}
              onClick={() => setDeleting(true)}
            />
            <ConfirmDialog open={deleting} title="Hapus feedback?" confirmLabel="Hapus feedback" loading={del.isPending}
              onConfirm={() => del.mutate()} onClose={() => setDeleting(false)}>
              <p>Feedback #{n} untuk v{versionNumber}{items.length ? ` beserta ${items.length} item revisinya` : ""} akan dihapus permanen.</p>
              <p className="text-[13px] text-fg-muted">Mahasiswa tidak lagi melihat feedback ini. Tindakan ini tidak bisa dibatalkan.</p>
            </ConfirmDialog>
          </>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            className="w-full"
            rows={4}
            maxLength={10000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <p className="text-xs text-fg-muted">
            Hanya isi feedback yang dapat diubah; item revisi tetap seperti saat
            dibuat.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setContent(fb.content);
                setEditing(false);
              }}
            >
              Batal
            </Button>
            <Button
              size="sm"
              loading={save.isPending}
              disabled={!content.trim() || content === fb.content}
              onClick={() => save.mutate()}
            >
              Simpan
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line">{fb.content}</p>
      )}
      {st.total > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-fg-muted">
            CHECKLIST REVISI · {st.done}/{st.total} selesai
          </p>
          {items.map((i) => (
            <RevisionRow
              key={i.id}
              item={i}
              canAddress={canAddress}
              inFolder
              needsNewVersion={needsNewVersion(i, latest)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function UploadDialog({
  folder,
  onClose,
  onUploaded,
}: {
  folder: FolderDetail;
  onClose: () => void;
  onUploaded: (v: Version) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // API: .pdf/.docx/.zip, at most MAX_UPLOAD_MB (50 by default); the content is checked again server-side
  const fileError = !file
    ? null
    : !/\.(pdf|docx|zip)$/i.test(file.name)
      ? "Hanya file PDF, DOCX, atau ZIP."
      : file.size > 50 * 1024 * 1024
        ? "Ukuran file melebihi 50 MB."
        : null;
  const m = useAction(
    () => {
      const fd = new FormData();
      if (file) fd.append("file", file);
      if (note) fd.append("note", note);
      return api.post<Version>(`/folders/${folder.id}/versions`, fd);
    },
    {
      success: "Versi baru terunggah",
      onDone: (v) => {
        onUploaded(v);
        onClose();
      },
    },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Unggah versi baru"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={m.isPending}
            disabled={!file || !!fileError}
            onClick={() => m.mutate()}
          >
            Unggah
          </Button>
        </>
      }
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border-strong p-6 text-center transition hover:border-primary hover:bg-primary-soft"
      >
        <Icon name="cloud_upload" fill className="text-[36px] text-primary" />
        {file ? (
          <>
            <p className="font-medium">{file.name}</p>
            <p className="text-xs text-fg-muted">
              {fmtSize(file.size)} · klik untuk ganti
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">Pilih file</p>
            <p className="text-xs text-fg-muted">
              PDF, DOCX, atau ZIP · maks. 50 MB · isi file dicek, bukan hanya
              ekstensinya
            </p>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.docx,.zip"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {fileError && <Alert tone="danger">{fileError}</Alert>}
      <Field label="Catatan versi">
        <Textarea
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="mis. Revisi sesuai feedback v1"
        />
      </Field>
      {folder.deadlineStatus === "overdue" && (
        <Alert tone="warning">
          Deadline sudah lewat — versi ini akan ditandai terlambat.
        </Alert>
      )}
      {m.error && (
        <p className="text-xs text-danger">{errorMessage(m.error)}</p>
      )}
    </Modal>
  );
}
