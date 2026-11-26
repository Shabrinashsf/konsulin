// US-03 (student): GET /invitations/me, POST /invitations/:id/respond.
import { useState } from "react";
import { useNavigate } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Chip,
  Empty,
  IconBox,
  Loading,
  PageHeader,
  Pager,
  useToast,
  ConfirmDialog,
} from "../components/ui";
import { InvitationBadge } from "../components/status";
import { api } from "../lib/api";
import { fmtDateTime } from "../lib/time";
import { useAction } from "../lib/use-action";
import type { Invitation, InvitationStatus } from "../lib/types";

export function InvitationsPage() {
  const [status, setStatus] = useState<InvitationStatus | "">("pending");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["invitations", "me", status, page],
    queryFn: () =>
      api.list<Invitation>("/invitations/me", { status, page, limit: 20 }),
    placeholderData: keepPreviousData,
  });
  const nav = useNavigate();
  const toast = useToast();
  const [declining, setDeclining] = useState<Invitation | null>(null);
  const respond = useAction(
    (x: { id: string; action: "accept" | "decline"; projectId: string }) =>
      api
        .post(`/invitations/${x.id}/respond`, { action: x.action })
        .then(() => x),
    {
      // After joining, go straight to the project so the next step (ajukan bimbingan) is in reach.
      onDone: (x) => {
        if (x.action === "accept") {
          toast({
            tone: "success",
            title: "Anda bergabung ke project",
          });
          nav(`/projects/${x.projectId}`);
        } else {
          setDeclining(null);
          toast({
            tone: "info",
            title: "Undangan ditolak",
          });
        }
      },
    },
  );
  return (
    <>
      <PageHeader title="Undangan project" />
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["pending", "Menunggu"],
            ["", "Semua"],
            ["accepted", "Diterima"],
            ["declined", "Ditolak"],
            ["expired", "Kedaluwarsa"],
            ["revoked", "Ditarik"],
          ] as const
        ).map(([v, l]) => (
          <Chip
            key={v}
            active={status === v}
            onClick={() => {
              setStatus(v);
              setPage(1);
            }}
          >
            {l}
          </Chip>
        ))}
      </div>
      {list.isLoading ? (
        <Loading />
      ) : !list.data?.data.length ? (
        <Card>
          <Empty icon="mail" title="Tidak ada undangan" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.data.data.map((i) => (
            <Card key={i.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <IconBox icon="mail" />
                <div className="min-w-0 flex-1">
                  <p className="text-title-sub font-medium">
                    {i.project.title}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {i.project.typeLabel} · {i.project.lecturer.name}
                  </p>
                </div>
                <InvitationBadge value={i.status} />
              </div>
              <p className="text-xs text-fg-muted">
                Dikirim {fmtDateTime(i.createdAt)} ·{" "}
                {i.status === "pending"
                  ? `berlaku sampai ${fmtDateTime(i.expiresAt)}`
                  : i.respondedAt
                    ? `dijawab ${fmtDateTime(i.respondedAt)}`
                    : `berakhir ${fmtDateTime(i.expiresAt)}`}
              </p>
              {i.status === "pending" && (
                <div className="flex gap-2">
                  <Button
                    icon="check"
                    loading={
                      respond.isPending &&
                      respond.variables?.id === i.id &&
                      respond.variables.action === "accept"
                    }
                    onClick={() =>
                      respond.mutate({
                        id: i.id,
                        action: "accept",
                        projectId: i.project.id,
                      })
                    }
                  >
                    Terima & bergabung
                  </Button>
                  <Button
                    variant="secondary"
                    loading={
                      respond.isPending &&
                      respond.variables?.id === i.id &&
                      respond.variables.action === "decline"
                    }
                    onClick={() => setDeclining(i)}
                  >
                    Tolak
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <Pager meta={list.data?.meta} onPage={setPage} />
      <ConfirmDialog
        open={!!declining}
        tone="warning"
        title="Tolak undangan?"
        confirmLabel="Tolak undangan"
        loading={respond.isPending}
        onConfirm={() =>
          respond.mutate({
            id: declining!.id,
            action: "decline",
            projectId: declining!.project.id,
          })
        }
        onClose={() => setDeclining(null)}
      >
        <p>
          Anda tidak akan bergabung ke <b>{declining?.project.title}</b> (
          {declining?.project.lecturer.name}).
        </p>
        <p className="text-[13px] text-fg-muted">
          Undangan yang ditolak tidak bisa diterima lagi; dosen perlu mengirim
          undangan baru.
        </p>
      </ConfirmDialog>
    </>
  );
}
