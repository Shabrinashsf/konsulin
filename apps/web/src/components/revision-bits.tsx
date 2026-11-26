// Feedback + revision checklist pieces shared by the folder page and the project's Submission/Revisi tabs.
import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Field, Icon, IconButton, Input, Loading, Modal, Select, Textarea, ConfirmDialog, useToast } from "./ui";
import { RevisionBadge } from "./status";
import { api } from "../lib/api";
import { useMe } from "../lib/auth";
import { useAction } from "../lib/use-action";
import type { RevisionItemContext, Version } from "../lib/types";

/** Shared query: every revision item of a project (the tabs group and count them client-side). */
export const useProjectRevisions = (
  projectId: string,
  params: Record<string, string> = {},
) =>
  useQuery({
    queryKey: ["revision-items", projectId, "all", params],
    // all pages: the tabs count and group client-side, so a first page of 100 would undercount
    queryFn: () =>
      api.listAll<RevisionItemContext>(
        `/projects/${projectId}/revision-items`,
        params,
      ),
    enabled: !!projectId,
  });

/** One checklist row with the action the viewer may take on it. */
export function RevisionRow({
  item: i,
  showFolder,
  canAddress,
  inFolder,
  needsNewVersion,
}: {
  item: RevisionItemContext;
  showFolder?: boolean;
  canAddress: boolean;
  inFolder?: boolean;
  /** No version newer than this item's yet: the student has to upload first (the folder page says so once). */
  needsNewVersion?: boolean;
}) {
  const me = useMe();
  const [addressing, setAddressing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const toast = useToast();
  const review = useAction(
    (decision: "verify" | "reopen") =>
      api.post(`/revision-items/${i.id}/review`, { decision }).then(() => decision),
    {
      onDone: (d) => {
        setReopening(false);
        toast(d === "verify"
          ? { tone: "success", title: "Item diverifikasi" }
          : { tone: "warning", title: "Dikembalikan ke mahasiswa" });
      },
    },
  );
  const done = i.status === "verified";
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2.5">
      <Icon
        name={done ? "check_circle" : "radio_button_unchecked"}
        fill={done}
        className={`text-[22px] ${done ? "text-success" : "text-fg-faint"}`}
      />
      <div className="min-w-0 flex-1 basis-56">
        <p className={done ? "text-fg-muted line-through" : ""}>
          {i.description}
        </p>
        {(!inFolder || i.addressedInVersion) && (
          <p className="text-xs text-fg-muted">
            {showFolder && (
              <>
                <Link className="text-link" to={`/folders/${i.folder.id}`}>
                  {i.folder.title}
                </Link>{" "}
                ·{" "}
              </>
            )}
            {!inFolder && (
              <Link
                className="text-link"
                to={`/folders/${i.folder.id}?versi=${i.version.id}`}
              >
                dari feedback v{i.version.versionNumber}
              </Link>
            )}
            {i.addressedInVersion &&
              `${inFolder ? "" : " · "}diperbaiki di v${i.addressedInVersion.versionNumber}`}
            {i.addressedNote && ` — “${i.addressedNote}”`}
          </p>
        )}
      </div>
      {/* the student's own untouched item needs no label: the button (or the hint) says what to do */}
      {!(canAddress && i.status === "open") && (
        <RevisionBadge value={i.status} />
      )}
      {me.role === "lecturer" && i.status === "addressed" && (
        <>
          <Button
            size="sm"
            variant="subtle"
            icon="verified"
            loading={review.isPending && review.variables === "verify"}
            onClick={() => review.mutate("verify")}
          >
            Verifikasi
          </Button>
          <Button
            size="sm"
            variant="subtle-danger"
            icon="undo"
            loading={review.isPending && review.variables === "reopen"}
            onClick={() => setReopening(true)}
            title="Perbaikan belum sesuai; mahasiswa harus memperbaiki dan menandai lagi dengan versi yang lebih baru"
          >
            Minta perbaiki ulang
          </Button>
        </>
      )}
      <ConfirmDialog open={reopening} tone="warning" title="Minta perbaiki ulang?" confirmLabel="Kembalikan ke mahasiswa"
        loading={review.isPending} onConfirm={() => review.mutate("reopen")} onClose={() => setReopening(false)}>
        <p className="font-medium">{i.description}</p>
        <p className="text-fg-soft">Perbaikan di v{i.addressedInVersion?.versionNumber} dianggap belum sesuai. Status menjadi “Perlu perbaikan ulang” dan mahasiswa harus mengunggah versi yang lebih baru lalu menandai item ini lagi.</p>
      </ConfirmDialog>
      {canAddress &&
        (i.status === "open" || i.status === "reopened") &&
        (needsNewVersion ? (
          <span className="text-xs text-fg-muted">Perlu versi baru</span>
        ) : (
          <Button
            size="sm"
            variant="subtle"
            icon="task_alt"
            onClick={() => setAddressing(true)}
          >
            Tandai sudah diperbaiki
          </Button>
        ))}
      {addressing && (
        <AddressDialog item={i} onClose={() => setAddressing(false)} />
      )}
    </div>
  );
}

/** Student points at the newer version that fixes the item (BR-14). */
export function AddressDialog({
  item,
  onClose,
}: {
  item: RevisionItemContext;
  onClose: () => void;
}) {
  const versions = useQuery({
    // same key as the folder page, so it must fetch the same thing (every page)
    queryKey: ["folders", item.folder.id, "versions"],
    queryFn: () => api.listAll<Version>(`/folders/${item.folder.id}/versions`),
  });
  const min = Math.max(
    item.version.versionNumber,
    item.addressedInVersion?.versionNumber ?? 0,
  );
  const newer = (versions.data?.data ?? []).filter(
    (v) => v.versionNumber > min,
  );
  const [picked, setPicked] = useState("");
  const versionId = picked || newer[0]?.id || "";
  const [note, setNote] = useState("");
  const m = useAction(
    () =>
      api.post(`/revision-items/${item.id}/address`, {
        versionId,
        note: note.trim() || undefined,
      }),
    { success: "Item ditandai sudah diperbaiki", onDone: onClose },
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Tandai item sudah diperbaiki"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          {newer.length > 0 && (
            <Button loading={m.isPending} onClick={() => m.mutate()}>
              Kirim ke dosen
            </Button>
          )}
        </>
      }
    >
      <p className="font-medium">{item.description}</p>
      {versions.isLoading ? (
        <Loading />
      ) : !newer.length ? (
        <Alert tone="warning" title={`Unggah versi baru dulu`}>
          Item ini dari feedback v
          {min === item.version.versionNumber
            ? min
            : `${item.version.versionNumber} (terakhir ditandai di v${min})`}
          . Unggah versi perbaikan (v{min + 1}) di folder{" "}
          <Link
            className="font-medium text-link"
            // ?unggah=1 opens the upload dialog, also when we are already on that folder's page
            to={`/folders/${item.folder.id}?unggah=1`}
            onClick={onClose}
          >
            {item.folder.title}
          </Link>
          , lalu kembali ke sini.
        </Alert>
      ) : (
        <>
          <Field
            label="Versi yang memperbaiki"
            required
            hint={`Harus lebih baru dari v${min} di folder yang sama.`}
          >
            <Select
              value={versionId}
              onChange={(e) => setPicked(e.target.value)}
            >
              {newer.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} · {v.originalName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Catatan untuk dosen">
            <Input
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. Diperbaiki di subbab 1.3"
            />
          </Field>
        </>
      )}
    </Modal>
  );
}

/** Lecturer writes feedback + a revision checklist on one version (POST /versions/:id/feedbacks). */
export function FeedbackDialog({
  version,
  onClose,
}: {
  version: Version;
  onClose: () => void;
}) {
  const [content, setContent] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const filled = items.filter((i) => i.trim());
  const m = useAction(
    () =>
      api.post(`/versions/${version.id}/feedbacks`, {
        content,
        revisionItems: filled.map((description) => ({ description })),
      }),
    {
      success: "Feedback dan checklist revisi terkirim",
      onDone: onClose,
    },
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={`Beri feedback & revisi untuk v${version.versionNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={m.isPending}
            disabled={!content.trim()}
            onClick={() => m.mutate()}
          >
            Kirim{filled.length ? ` dengan ${filled.length} item revisi` : ""}
          </Button>
        </>
      }
    >
      <Field label="Isi feedback" required>
        <Textarea
          rows={4}
          maxLength={10000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Komentar umum untuk versi ini"
        />
      </Field>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-fg-muted">
          CHECKLIST REVISI{" "}
          <span className="font-normal">
            · opsional, maks. 50 item · satu poin yang harus diperbaiki per
            baris
          </span>
        </p>
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Icon
              name="radio_button_unchecked"
              className="text-[20px] text-fg-faint"
            />
            <Input
              className="flex-1"
              maxLength={1000}
              value={it}
              placeholder={
                idx ? `Item ${idx + 1}` : "mis. Perjelas batasan masalah"
              }
              onChange={(e) =>
                setItems(items.map((x, i) => (i === idx ? e.target.value : x)))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && it.trim() && items.length < 50) {
                  e.preventDefault();
                  setItems([...items, ""]);
                }
              }}
            />
            <IconButton
              icon="close"
              label="Hapus item"
              size="sm"
              onClick={() =>
                setItems(
                  items.length > 1 ? items.filter((_, i) => i !== idx) : [""],
                )
              }
            />
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          icon="add"
          className="self-start"
          disabled={items.length >= 50}
          onClick={() => setItems([...items, ""])}
        >
          Tambah item
        </Button>
      </div>
      <p className="text-xs text-fg-muted">
        Mahasiswa menerima email (E10). Item tidak bisa diubah setelah dikirim;
        untuk menambah poin baru, kirim feedback baru. Feedback bisa dihapus
        selama semua itemnya belum dikerjakan.
      </p>
    </Modal>
  );
}
