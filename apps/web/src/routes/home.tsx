// Beranda: what needs me now (across projects) + the next 7 days. Full timeline lives in /kalender.
import { Link } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  Empty,
  Icon,
  IconBox,
  Loading,
  PageHeader,
  type Tone,
} from "../components/ui";
import { ConsultationItem, needsMe } from "../components/consultation-bits";
import { api } from "../lib/api";
import { useMe } from "../lib/auth";
import { addDays, fmtLongDate, fmtRange, todayWIB } from "../lib/time";
import type {
  Consultation,
  Invitation,
  Project,
  RevisionItemContext,
} from "../lib/types";

interface Todo {
  key: string;
  to: string;
  icon: string;
  title: string;
  desc: string;
  tag: string;
  tone: Tone;
}

export function HomePage() {
  const me = useMe();
  const lecturer = me.role === "lecturer";
  const today = todayWIB();
  const projects = useQuery({
    queryKey: ["projects", "list", "all"],
    queryFn: () => api.list<Project>("/projects", { limit: 100 }),
  });
  const negotiating = useQuery({
    queryKey: ["consultations", "mine", "requested"],
    queryFn: () =>
      api.list<Consultation>("/consultations", {
        status: "requested",
        limit: 100,
      }),
  });
  const approved = useQuery({
    queryKey: ["consultations", "mine", "approved"],
    queryFn: () =>
      api.list<Consultation>("/consultations", {
        status: "approved",
        limit: 100,
      }),
  });
  const week = useQuery({
    queryKey: ["consultations", "mine", "week", today],
    queryFn: () =>
      api.list<Consultation>("/consultations", {
        from: today,
        to: addDays(today, 7),
        limit: 100,
      }),
  });
  const invites = useQuery({
    queryKey: ["invitations", "me", "pending"],
    queryFn: () =>
      api.list<Invitation>("/invitations/me", { status: "pending" }),
    enabled: !lecturer,
  });
  // Revision items that wait on me: lecturer reviews `addressed`, student fixes `open` / `reopened`.
  const revisionStatuses = lecturer ? ["addressed"] : ["open", "reopened"];
  const revisions = useQueries({
    queries: (projects.data?.data ?? []).flatMap((p) =>
      revisionStatuses.map((status) => ({
        queryKey: ["revision-items", p.id, status, "home"],
        queryFn: () =>
          api
            .list<RevisionItemContext>(`/projects/${p.id}/revision-items`, {
              status,
              limit: 100,
            })
            .then((r) => r.data.map((i) => ({ ...i, project: p }))),
      })),
    ),
  });

  const now = new Date();
  const todos: Todo[] = [
    ...(invites.data?.data ?? []).map((i): Todo => ({
      key: i.id,
      to: "/undangan",
      icon: "mail",
      title: `Undangan: ${i.project.title}`,
      desc: `${i.project.lecturer.name} · berlaku sampai ${fmtLongDate(i.expiresAt)}`,
      tag: "Jawab undangan",
      tone: "primary",
    })),
    ...(negotiating.data?.data ?? [])
      .filter((c) => needsMe(c, me))
      .map((c): Todo => ({
        key: c.id,
        to: `/consultations/${c.id}`,
        icon: "schedule",
        title: c.topic,
        desc: `${c.project.title} · ${c.student.name} · ${c.startAt ? `usulan ${fmtRange(c.startAt, c.endAt)}` : `diminta ${fmtLongDate(c.requestedDate)}`}`,
        tag: c.startAt
          ? "Terima atau usulkan jam lain"
          : "Usulkan jam & lokasi",
        tone: "warning",
      })),
    ...(lecturer
      ? (approved.data?.data ?? [])
          .filter((c) => new Date(c.startAt!) <= now)
          .map((c): Todo => ({
            key: c.id,
            to: `/consultations/${c.id}`,
            icon: "task_alt",
            title: c.topic,
            desc: `${c.project.title} · ${c.student.name} · ${fmtRange(c.startAt, c.endAt)}`,
            tag: "Selesaikan & isi logbook",
            tone: "success",
          }))
      : []),
    ...revisions
      .flatMap((q) => q.data ?? [])
      .map((i): Todo => ({
        key: i.id,
        to: `/folders/${i.folder.id}?versi=${i.version.id}`,
        icon: "checklist",
        title: i.description,
        desc: `${i.project.title} · ${i.folder.title} (feedback v${i.version.versionNumber})`,
        tag: lecturer
          ? "Review perbaikan"
          : i.status === "reopened"
            ? "Perbaiki ulang"
            : "Perbaiki & tandai",
        tone: lecturer
          ? "info"
          : i.status === "reopened"
            ? "danger"
            : "warning",
      })),
  ];
  const loading =
    projects.isLoading ||
    negotiating.isLoading ||
    revisions.some((q) => q.isLoading);
  const agenda = (week.data?.data ?? []).filter(
    (c) => c.status === "approved" || c.status === "requested",
  );

  const shortcuts = lecturer
    ? [
        {
          to: "/kalender",
          icon: "calendar_month",
          title: "Kalender Bimbingan",
          desc: "Timeline semua bimbingan lintas project",
        },
        {
          to: "/projects",
          icon: "folder_shared",
          title: "Project Bimbingan",
          desc: `${projects.data?.meta.total ?? 0} project aktif`,
        },
        {
          to: "/monitoring",
          icon: "monitoring",
          title: "Monitoring",
          desc: "Progres semua mahasiswa bimbingan",
        },
      ]
    : [
        {
          to: "/kalender",
          icon: "calendar_month",
          title: "Kalender Bimbingan",
          desc: "Jadwal bimbingan Anda di semua project",
        },
        {
          to: "/projects",
          icon: "folder_shared",
          title: "Project Saya",
          desc: `${projects.data?.meta.total ?? 0} project diikuti`,
        },
        {
          to: "/undangan",
          icon: "mail",
          title: "Undangan",
          desc: invites.data?.meta.total
            ? `${invites.data.meta.total} undangan menunggu jawaban`
            : "Tidak ada undangan baru",
        },
      ];

  return (
    <>
      <PageHeader title="Beranda" />
      <div className="mb-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="card flex flex-col gap-3 p-5 transition hover:-translate-y-0.5"
          >
            <IconBox icon={s.icon} />
            <div>
              <p className="text-[15px] font-medium">{s.title}</p>
              <p className="mt-0.5 truncate text-[13px] text-fg-muted">
                {s.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Card className="p-2">
          <div className="flex items-center gap-2 px-3 pt-3 pb-1">
            <p className="flex-1 text-title-sub font-medium">
              Perlu tindakan Anda
            </p>
            {!loading && (
              <Badge tone={todos.length ? "warning" : "success"}>
                {todos.length}
              </Badge>
            )}
          </div>
          {loading ? (
            <Loading />
          ) : !todos.length ? (
            <Empty icon="task_alt" title="Semua beres">
              Tidak ada yang menunggu respons Anda saat ini.
            </Empty>
          ) : (
            <div className="divide-y divide-border">
              {todos.map((t) => (
                <Link
                  key={t.key}
                  to={t.to}
                  className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-3 transition hover:bg-surface-muted"
                >
                  <Icon name={t.icon} className="text-[24px] text-fg-soft" />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-medium">{t.title}</p>
                    <p className="truncate text-xs text-fg-muted">{t.desc}</p>
                  </div>
                  <Badge tone={t.tone}>{t.tag}</Badge>
                  <Icon name="chevron_right" className="text-fg-muted" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex h-fit flex-col gap-1 p-2">
          <div className="flex items-center px-3 pt-3 pb-1">
            <p className="flex-1 text-title-sub font-medium">7 hari ke depan</p>
            <Link to="/kalender">
              <Button size="sm" variant="ghost" icon="calendar_month">
                Kalender
              </Button>
            </Link>
          </div>
          {week.isLoading ? (
            <Loading />
          ) : !agenda.length ? (
            <Empty icon="event" title="Tidak ada jadwal minggu ini" />
          ) : (
            <div className="divide-y divide-border">
              {agenda.map((c) => (
                <ConsultationItem key={c.id} c={c} showProject />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
