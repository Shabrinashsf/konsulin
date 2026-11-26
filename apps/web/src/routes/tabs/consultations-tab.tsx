// US-05: GET/POST /projects/:id/consultations, POST .../schedule, GET .../available-days.
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Chip,
  Empty,
  Field,
  Input,
  Loading,
  Modal,
  Pager,
  Select,
  Textarea,
} from "../../components/ui";
import { DayPicker } from "../../components/day-picker";
import {
  ConsultationItem,
  LocationFields,
  useTimeFields,
} from "../../components/consultation-bits";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { fmtLongDate } from "../../lib/time";
import { useAction } from "../../lib/use-action";
import type {
  Consultation,
  ConsultationView,
  Member,
  Mode,
  Page,
  Project,
  ProjectDetail,
} from "../../lib/types";

const FILTERS: [ConsultationView | "", string][] = [
  ["", "Semua"],
  ["requested", "Ajuan"],
  ["approved", "Disetujui"],
  ["completed", "Selesai"],
  ["rejected", "Ditolak"],
  ["cancelled", "Dibatalkan"],
  ["expired", "Kedaluwarsa"],
];

export function ConsultationsTab({ project }: { project: ProjectDetail }) {
  const me = useMe();
  const [status, setStatus] = useState<ConsultationView | "">("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [modal, setModal] = useState(false);
  const list = useQuery({
    queryKey: ["consultations", "project", project.id, status, page, limit],
    queryFn: () =>
      api.list<Consultation>(`/projects/${project.id}/consultations`, {
        status,
        page,
        limit,
      }),
    placeholderData: keepPreviousData,
  });
  const lecturer = me.role === "lecturer";
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(([s, l]) => (
          <Chip
            key={s}
            active={status === s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {l}
          </Chip>
        ))}
        <div className="flex-1" />
        <Link to={`/kalender?projectId=${project.id}`}>
          <Button variant="secondary" icon="calendar_month">
            Lihat di kalender
          </Button>
        </Link>
        {lecturer ? (
          <Button
            icon="event_available"
            onClick={() => setModal(true)}
            disabled={!project.summary.memberCount}
          >
            Jadwalkan langsung
          </Button>
        ) : (
          <Button icon="add" onClick={() => setModal(true)}>
            Ajukan bimbingan
          </Button>
        )}
      </div>
      <Card className="p-2">
        {list.isLoading ? (
          <Loading />
        ) : !list.data?.data.length ? (
          <Empty icon="event" title="Belum ada bimbingan">
            {lecturer
              ? "Mahasiswa mengirim ajuan tanggal, lalu Anda dan mahasiswa menyepakati jamnya."
              : "Pilih tanggal yang tersedia, lalu sepakati waktunya dengan dosen."}
          </Empty>
        ) : (
          <div className="divide-y divide-border">
            {list.data.data.map((c) => (
              <ConsultationItem key={c.id} c={c} />
            ))}
          </div>
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
      {modal &&
        (lecturer ? (
          <ScheduleModal project={project} onClose={() => setModal(false)} />
        ) : (
          <RequestModal project={project} onClose={() => setModal(false)} />
        ))}
    </>
  );
}

export function RequestModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const me = useMe();
  // BR-19: one live request per student per project; "requested" excludes expired ones (API statusWhere)
  const pending = useQuery({
    queryKey: ["consultations", "project", project.id, "pending", me.id],
    queryFn: () =>
      api.list<Consultation>(`/projects/${project.id}/consultations`, {
        status: "requested",
        studentId: me.id,
        limit: 1,
      }),
  });
  const live = pending.data?.data[0];
  const [f, setF] = useState({
    requestedDate: "",
    topic: "",
    agenda: "",
    mode: "offline" as Mode,
    note: "",
  });
  const invalid =
    !!live ||
    !f.requestedDate ||
    f.topic.trim().length < 3 ||
    !f.agenda.trim();
  const submit = useAction(
    () =>
      api.post<Consultation>(`/projects/${project.id}/consultations`, {
        ...f,
        note: f.note.trim() || null,
      }),
    {
      success: "Pengajuan terkirim ke dosen",
      onDone: (c) => nav(`/consultations/${c.id}`),
    },
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Ajukan bimbingan"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={submit.isPending}
            disabled={invalid}
            onClick={() => submit.mutate()}
          >
            Kirim pengajuan
          </Button>
        </>
      }
    >
      {live ? (
        <Alert tone="warning" title="Masih ada ajuan aktif di project ini">
          Ajuan “{live.topic}” belum selesai. Tunggu dijawab{" "}
          {project.lecturer.name} atau batalkan dulu sebelum mengajukan lagi.{" "}
          <Link className="font-medium text-link" to={`/consultations/${live.id}`}>
            Buka ajuan
          </Link>
        </Alert>
      ) : (
        <Alert tone="info">
          Pilih <b>tanggal</b> saja. Jam bimbingan disepakati bersama{" "}
          {project.lecturer.name} setelah ajuan terkirim.
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <DayPicker
            projectId={project.id}
            value={f.requestedDate}
            onChange={(d) => setF({ ...f, requestedDate: d })}
          />
          <p className="mt-2 text-sm">
            Tanggal dipilih:{" "}
            <b>{f.requestedDate ? fmtLongDate(f.requestedDate) : "-"}</b>
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Topik" hint="3–200 karakter" required>
            <Input
              value={f.topic}
              onChange={(e) => setF({ ...f, topic: e.target.value })}
              maxLength={200}
              placeholder="mis. Review Bab 2"
            />
          </Field>
          <Field label="Agenda" required>
            <Textarea
              value={f.agenda}
              onChange={(e) => setF({ ...f, agenda: e.target.value })}
              placeholder="Apa yang ingin dibahas"
            />
          </Field>
          <Field label="Preferensi mode">
            <Select
              value={f.mode}
              onChange={(e) => setF({ ...f, mode: e.target.value as Mode })}
            >
              <option value="offline">Offline</option>
              <option value="online">Online</option>
            </Select>
          </Field>
          <Field label="Catatan untuk dosen">
            <Input
              value={f.note}
              onChange={(e) => setF({ ...f, note: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function ScheduleModal({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const members = useQuery({
    queryKey: ["projects", project.id, "members", "all"],
    queryFn: () =>
      api.list<Member>(`/projects/${project.id}/members`, { limit: 100 }),
  });
  const time = useTimeFields(project.id);
  const [f, setF] = useState({
    studentId: "",
    topic: "",
    agenda: "",
    mode: "offline" as Mode,
    location: "",
  });
  const invalid =
    !f.studentId ||
    f.topic.trim().length < 3 ||
    !f.agenda.trim() ||
    !f.location.trim() ||
    !!time.error;
  const submit = useAction(
    () =>
      api.post<Consultation>(`/projects/${project.id}/consultations/schedule`, {
        ...f,
        ...time.value,
      }),
    {
      success: "Bimbingan dijadwalkan",
      onDone: (c) => nav(`/consultations/${c.id}`),
    },
  );
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title="Jadwalkan bimbingan langsung"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={submit.isPending}
            disabled={invalid}
            onClick={() => submit.mutate()}
          >
            Jadwalkan
          </Button>
        </>
      }
    >
      <Field label="Mahasiswa" required>
        <Select
          value={f.studentId}
          onChange={(e) => setF({ ...f, studentId: e.target.value })}
        >
          <option value="">Pilih mahasiswa</option>
          {(members.data as Page<Member> | undefined)?.data.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.nrp}
            </option>
          ))}
        </Select>
      </Field>
      {time.fields}
      <LocationFields
        mode={f.mode}
        location={f.location}
        onMode={(mode) => setF({ ...f, mode })}
        onLocation={(location) => setF({ ...f, location })}
      />
      <Field label="Topik" hint="3–200 karakter" required>
        <Input
          value={f.topic}
          maxLength={200}
          onChange={(e) => setF({ ...f, topic: e.target.value })}
        />
      </Field>
      <Field label="Agenda" required>
        <Textarea
          value={f.agenda}
          onChange={(e) => setF({ ...f, agenda: e.target.value })}
        />
      </Field>
    </Modal>
  );
}
