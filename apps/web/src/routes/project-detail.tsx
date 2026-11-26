// US-02/US-03: project detail, members, invitations. Tabs for consultations, folders, revisions, logbook.
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  Empty,
  Icon,
  IconButton,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pager,
  Table,
  Tabs,
  ConfirmDialog,
} from "../components/ui";
import { InvitationBadge } from "../components/status";
import { api, errorMessage } from "../lib/api";
import { useMe } from "../lib/auth";
import { fmtDate, fmtDateTime } from "../lib/time";
import { useAction } from "../lib/use-action";
import type {
  Invitation,
  InvitationStatus,
  Member,
  ProjectDetail,
  Student,
} from "../lib/types";
import { ProjectForm } from "./projects";
import { ConsultationsTab } from "./tabs/consultations-tab";
import { FoldersTab } from "./tabs/folders-tab";
import { LogbookTab } from "./tabs/logbook-tab";

type Tab = "bimbingan" | "submission" | "logbook" | "anggota";
// tabs that were merged: old links (?tab=revisi, ?tab=undangan) land on their new home
const MOVED: Record<string, Tab> = { revisi: "submission", undangan: "anggota" };

export function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("tab") ?? "bimbingan";
  const tab = (MOVED[raw] ?? raw) as Tab;
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const project = useQuery({
    queryKey: ["projects", "detail", projectId],
    queryFn: () => api.get<ProjectDetail>(`/projects/${projectId}`),
  });
  const del = useAction(() => api.del(`/projects/${projectId}`), {
    success: "Project dihapus",
    onDone: () => nav("/projects"),
  });

  if (project.isLoading) return <Loading />;
  if (project.error)
    return (
      <>
        <PageHeader title="Project" back="/projects" />
        <Alert tone="danger" title="Project tidak ditemukan">
          {errorMessage(project.error)}
        </Alert>
      </>
    );
  const p = project.data!;
  const lecturer = me.role === "lecturer";
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "bimbingan", label: "Bimbingan" },
    { id: "submission", label: "Submission" },
    { id: "logbook", label: "Logbook" },
    { id: "anggota", label: "Anggota", count: p.summary.memberCount },
  ];

  return (
    <>
      <PageHeader
        title={p.title}
        back="/projects"
        subtitle={
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone="navy">{p.label}</Badge>
            {p.requiredDegree && (
              <Badge tone="secondary">{p.requiredDegree}</Badge>
            )}
            <span
              title={
                p.trackMode === "individual"
                  ? "Bimbingan, folder, dan revisi tiap mahasiswa hanya terlihat oleh mahasiswa itu dan dosen."
                  : "Semua anggota melihat bimbingan, folder, dan revisi project ini."
              }
            >
              <Badge
                tone={p.trackMode === "individual" ? "info" : "orange"}
                icon={p.trackMode === "individual" ? "lock" : "groups"}
              >
                {p.trackMode === "individual" ? "Individual" : "Shared"}
              </Badge>
            </span>
            <span className="text-xs">
              · {p.lecturer.name} · {fmtDate(p.startDate)} –{" "}
              {p.endDate ? fmtDate(p.endDate) : "sekarang"}
            </span>
          </div>
        }
        actions={
          lecturer && (
            <>
              <Button
                variant="secondary"
                icon="edit"
                onClick={() => setEditing(true)}
              >
                Ubah
              </Button>
              <Button
                variant="subtle-danger"
                icon="delete"
                onClick={() => setDeleting(true)}
              >
                Hapus
              </Button>
            </>
          )
        }
      />
      {p.description && (
        <p className="-mt-2 mb-4 max-w-3xl text-fg-muted">{p.description}</p>
      )}
      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(t) => setSp({ tab: t }, { replace: true })}
      />
      <div className="pt-5">
        {tab === "bimbingan" && <ConsultationsTab project={p} />}
        {tab === "submission" && <FoldersTab project={p} />}
        {tab === "logbook" && <LogbookTab project={p} />}
        {tab === "anggota" && (
          <div className="flex flex-col gap-5">
            {lecturer && <InvitationsTab project={p} />}
            <MembersTab project={p} />
          </div>
        )}
      </div>
      {editing && (
        <ProjectForm open project={p} onClose={() => setEditing(false)} />
      )}
      <Modal
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Hapus project?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              loading={del.isPending}
              onClick={() => del.mutate()}
            >
              Hapus project
            </Button>
          </>
        }
      >
        <p>
          Project <b>{p.title}</b> akan disembunyikan beserta folder, versi, dan
          revisinya.
        </p>
        <Alert tone="warning">
          Bimbingan yang masih aktif akan dibatalkan otomatis dan peserta
          menerima email pembatalan.
        </Alert>
      </Modal>
    </>
  );
}

function MembersTab({ project }: { project: ProjectDetail }) {
  const me = useMe();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [removing, setRemoving] = useState<Member | null>(null);
  const list = useQuery({
    queryKey: ["projects", project.id, "members", q, page, limit],
    queryFn: () =>
      api.list<Member>(`/projects/${project.id}/members`, { q, page, limit }),
    placeholderData: keepPreviousData,
  });
  const remove = useAction(
    (m: Member) => api.del(`/projects/${project.id}/members/${m.id}`),
    { success: "Anggota dikeluarkan", onDone: () => setRemoving(null) },
  );
  const lecturer = me.role === "lecturer";
  return (
    <Card className="p-2">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <h3 className="text-title-sub font-medium">Anggota</h3>
        <Input
          className="w-full max-w-xs"
          placeholder="Cari nama atau NRP"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
      </div>
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.data.length ? (
        <Empty icon="group" title="Belum ada anggota">
          {lecturer && "Undang mahasiswa lewat tombol “Undang mahasiswa” di atas."}
        </Empty>
      ) : (
        <Table
          head={[
            "Mahasiswa",
            "Program studi",
            "Angkatan",
            "Bergabung",
            ...(lecturer ? [""] : []),
          ]}
        >
          {list.data.data.map((m) => (
            <tr key={m.id}>
              <td>
                <div className="flex items-center gap-2">
                  <Avatar name={m.name} />
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-fg-muted">{m.nrp}</p>
                  </div>
                </div>
              </td>
              <td>{m.studyProgram?.name}</td>
              <td>{m.cohortYear}</td>
              <td>{fmtDate(m.joinedAt)}</td>
              {lecturer && (
                <td className="text-right">
                  <IconButton
                    icon="person_remove"
                    label="Keluarkan"
                    size="sm"
                    variant="subtle-danger"
                    onClick={() => setRemoving(m)}
                  />
                </td>
              )}
            </tr>
          ))}
        </Table>
      )}
      <Pager
        meta={list.data?.meta}
        onPage={setPage}
        limit={limit}
        onLimit={(n) => {
          setLimit(n);
          setPage(1);
        }}
      />
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Keluarkan anggota?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Batal
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => remove.mutate(removing!)}
            >
              Keluarkan
            </Button>
          </>
        }
      >
        <p>
          <b>{removing?.name}</b> tidak lagi bisa mengakses project ini. Riwayat
          folder dan bimbingannya tetap tersimpan untuk Anda.
        </p>
        <Alert tone="warning">
          Bimbingan aktif milik mahasiswa ini dibatalkan otomatis dan email
          pembatalan terkirim.
        </Alert>
      </Modal>
    </Card>
  );
}

/** Invitations section on the Anggota tab (lecturer): pending ones first, the rest via the chips. */
function InvitationsTab({ project }: { project: ProjectDetail }) {
  const [status, setStatus] = useState<InvitationStatus | "">("pending");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [inviting, setInviting] = useState(false);
  const list = useQuery({
    queryKey: ["projects", project.id, "invitations", status, page, limit],
    queryFn: () =>
      api.list<Invitation>(`/projects/${project.id}/invitations`, {
        status,
        page,
        limit,
      }),
    placeholderData: keepPreviousData,
  });
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const revoke = useAction(
    (id: string) => api.del(`/projects/${project.id}/invitations/${id}`),
    { success: "Undangan ditarik", onDone: () => setRevoking(null) },
  );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h3 className="mr-2 text-title-sub font-medium">Undangan</h3>
        {(
          ["pending", "", "accepted", "declined", "revoked", "expired"] as const
        ).map((s) => (
          <Chip
            key={s}
            active={status === s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {
              {
                "": "Semua",
                pending: "Menunggu",
                accepted: "Diterima",
                declined: "Ditolak",
                revoked: "Ditarik",
                expired: "Kedaluwarsa",
              }[s]
            }
          </Chip>
        ))}
        <div className="flex-1" />
        <Button icon="person_add" onClick={() => setInviting(true)}>
          Undang mahasiswa
        </Button>
      </div>
      <Card className="p-2">
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.data.length ? (
          <Empty icon="mail" title="Belum ada undangan">
            Undangan berlaku 7 hari dan dikirim lewat email (E1).
          </Empty>
        ) : (
          <Table
            head={["Mahasiswa", "Status", "Dikirim", "Berlaku sampai", ""]}
          >
            {list.data.data.map((i) => (
              <tr key={i.id}>
                <td>
                  <p className="font-medium">{i.student.name}</p>
                  <p className="text-xs text-fg-muted">
                    {i.student.nrp} · {i.student.studyProgram?.name}
                  </p>
                </td>
                <td>
                  <InvitationBadge value={i.status} />
                </td>
                <td>{fmtDateTime(i.createdAt)}</td>
                <td>
                  {i.status === "pending"
                    ? fmtDateTime(i.expiresAt)
                    : i.respondedAt
                      ? `Dijawab ${fmtDate(i.respondedAt)}`
                      : "-"}
                </td>
                <td className="text-right">
                  {i.status === "pending" && (
                    <Button
                      size="sm"
                      variant="subtle-danger"
                      onClick={() => setRevoking(i)}
                    >
                      Tarik
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <Pager
          meta={list.data?.meta}
          onPage={setPage}
          limit={limit}
          onLimit={(n) => {
            setLimit(n);
            setPage(1);
          }}
        />
      </Card>
      <ConfirmDialog
        open={!!revoking}
        title="Tarik undangan?"
        confirmLabel="Tarik undangan"
        loading={revoke.isPending}
        onConfirm={() => revoke.mutate(revoking!.id)}
        onClose={() => setRevoking(null)}
      >
        <p>
          Undangan untuk <b>{revoking?.student.name}</b> dibatalkan dan tidak
          bisa diterima lagi.
        </p>
        <p className="text-[13px] text-fg-muted">
          Anda bisa mengirim undangan baru kapan saja.
        </p>
      </ConfirmDialog>
      {inviting && (
        <InviteModal project={project} onClose={() => setInviting(false)} />
      )}
    </>
  );
}

function InviteModal({
  project,
  onClose,
}: {
  project: ProjectDetail;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const students = useQuery({
    queryKey: ["students", project.id, q],
    queryFn: () =>
      api.list<Student>("/students", {
        q,
        eligibleForProjectId: project.id,
        limit: 20,
      }),
    placeholderData: keepPreviousData,
  });
  // GET /students excludes members only; a second invite would be 409 INVITATION_ALREADY_PENDING
  const pending = useQuery({
    queryKey: ["projects", project.id, "invitations", "pending", "all"],
    queryFn: () =>
      api.list<Invitation>(`/projects/${project.id}/invitations`, {
        status: "pending",
        limit: 100,
      }),
  });
  const invited = new Set(pending.data?.data.map((i) => i.student.id));
  const invite = useAction(
    (s: Student) =>
      api.post(`/projects/${project.id}/invitations`, { studentId: s.id }),
    { success: "Undangan terkirim" },
  );
  return (
    <Modal open wide onClose={onClose} title="Undang mahasiswa">
      <p className="text-fg-muted">
        {project.requiredDegree
          ? `Hanya mahasiswa ${project.requiredDegree} yang belum menjadi anggota.`
          : "Semua jenjang dapat diundang."}
      </p>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[20px] text-fg-muted"
        />
        <Input
          autoFocus
          className="w-full pl-10"
          placeholder="Cari nama atau NRP"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-[50vh] divide-y divide-border overflow-y-auto">
        {students.data?.data.map((s) => (
          <div key={s.id} className="flex items-center gap-3 py-3">
            <Avatar name={s.name} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-fg-muted">
                {s.nrp} · {s.studyProgram?.name} · {s.cohortYear}
              </p>
            </div>
            {invited.has(s.id) ? (
              <Badge tone="warning">Menunggu jawaban</Badge>
            ) : (
              <Button
                size="sm"
                variant="subtle"
                icon="send"
                loading={invite.isPending && invite.variables?.id === s.id}
                disabled={invite.isPending || pending.isLoading}
                onClick={() => invite.mutate(s)}
              >
                Undang
              </Button>
            )}
          </div>
        ))}
        {students.data && !students.data.data.length && (
          <Empty icon="person_search" title="Tidak ada mahasiswa yang cocok" />
        )}
      </div>
    </Modal>
  );
}
