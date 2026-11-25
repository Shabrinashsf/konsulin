// tracer-study-web shell: fixed 60px top bar (logo, page title, user pill), 240px white sidebar.
import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, HeaderSlot, Icon, Loading, useToast, ConfirmDialog } from "./ui";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { resetDb } from "../mock/db";
import type { Invitation } from "../lib/types";

const MENU = {
  lecturer: [
    ["/", "home", "Beranda"],
    ["/kalender", "calendar_month", "Kalender Bimbingan"],
    ["/projects", "folder_shared", "Project"],
    ["/jadwal", "event_busy", "Hari Berhalangan"],
    ["/monitoring", "monitoring", "Monitoring"],
  ],
  student: [
    ["/", "home", "Beranda"],
    ["/kalender", "calendar_month", "Kalender Bimbingan"],
    ["/projects", "folder_shared", "Project Saya"],
    ["/undangan", "mail", "Undangan"],
  ],
} as const;

export function Logo() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex size-7 items-center justify-center rounded-md bg-navy text-base font-bold text-accent">
        K
      </span>
      <span className="text-[19px] font-medium text-fg">Konsulin</span>
    </span>
  );
}

/** Pages that live inside a project (folder, consultation detail) keep the Project menu highlighted. */
const SECTION_OF: Record<string, string[]> = {
  "/projects": ["/projects", "/folders/", "/consultations/"],
};

function SidebarItem({
  to,
  icon,
  label,
  badge,
  onClick,
}: {
  to: string;
  icon: string;
  label: string;
  badge?: number;
  onClick?: () => void;
}) {
  const { pathname } = useLocation();
  const active =
    to === "/"
      ? pathname === "/"
      : (SECTION_OF[to] ?? [to]).some((p) => pathname.startsWith(p));
  return (
    <Link
      to={to}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-14 items-center gap-2.5 rounded-2xl pr-4 pl-2.5 font-medium transition ${
        active
          ? "bg-primary-soft text-primary before:absolute before:top-4 before:bottom-4 before:left-0 before:w-1 before:rounded-r-lg before:bg-primary"
          : "text-fg-soft hover:text-primary"
      }`}
    >
      <Icon name={icon} fill={active} className="text-[24px]" />
      <span className="flex-1 truncate">{label}</span>
      {!!badge && (
        <span className="rounded-sm bg-danger px-1.5 py-0.5 text-xs leading-none font-semibold text-fg-inverse">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function AppShell() {
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const loc = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const pending = useQuery({
    queryKey: ["invitations", "me", "pending"],
    queryFn: () =>
      api.list<Invitation>("/invitations/me", { status: "pending" }),
    enabled: user?.role === "student",
  });

  if (!ready) return <Loading />;
  if (!user)
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;

  const close = () => setOpen(false);
  const nav = (
    <>
      <div className="flex flex-col gap-1 px-2.5 pb-5">
        {MENU[user.role].map(([to, icon, label]) => (
          <SidebarItem
            key={to}
            to={to}
            icon={icon}
            label={label}
            badge={to === "/undangan" ? pending.data?.meta.total : undefined}
            onClick={close}
          />
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-1 px-2.5 pt-2.5 pb-4">
        <SidebarItem
          to="/email"
          icon="mark_email_unread"
          label={user.role === "lecturer" ? "Email Terkirim" : "Email Masuk"}
          onClick={close}
        />
        <p className="px-2.5 pt-2 text-xs text-fg-muted">
          Mode demo · data dummy tersimpan di browser ini
        </p>
      </div>
    </>
  );

  return (
    <HeaderSlot.Provider value={slot}>
      <header className="fixed inset-x-0 top-0 z-20 flex h-[60px] items-center bg-surface/90 backdrop-blur">
        <div className="flex w-auto shrink-0 items-center gap-1 pl-2.5 lg:w-[240px] lg:pl-5">
          <button
            aria-label="Menu"
            className="flex size-10 items-center justify-center rounded-md hover:bg-surface-muted lg:hidden"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <NavLink to="/" className="hidden sm:block">
            <Logo />
          </NavLink>
        </div>
        <div ref={setSlot} className="min-w-0 flex-1 px-2 lg:px-[25px]" />
        <div className="relative mr-5 shrink-0">
          <button
            onClick={() => setMenu((m) => !m)}
            className="flex items-center gap-1 rounded-full py-0.5 pr-1.5 pl-1.5 transition hover:bg-surface-muted"
          >
            <span className="mx-1 hidden max-w-[140px] truncate text-[13px] font-medium sm:block">
              {user.name}
            </span>
            <Avatar name={user.name} />
          </button>
          {menu && (
            <div
              className="absolute right-0 z-30 mt-2 w-[300px] rounded-xl bg-surface p-2.5 shadow-overlay"
              onMouseLeave={() => setMenu(false)}
            >
              <div className="flex flex-col items-center gap-3 py-[15px] text-center">
                <Avatar name={user.name} className="size-16 text-lg" />
                <div className="flex flex-col">
                  <span className="text-[15px] font-semibold">{user.name}</span>
                  <span>
                    {user.role === "lecturer"
                      ? "Dosen"
                      : `Mahasiswa · ${user.nrp}`}
                  </span>
                  <span className="text-[13px] text-fg-muted">
                    {user.email}
                  </span>
                  {user.studyProgram && (
                    <span className="text-[13px] text-fg-muted">
                      {user.studyProgram.name} · {user.cohortYear}
                    </span>
                  )}
                </div>
              </div>
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-[15px] font-medium hover:bg-surface-muted"
                onClick={() => {
                  setMenu(false);
                  setResetting(true);
                }}
              >
                <Icon name="restart_alt" /> Reset data demo
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-[15px] font-medium text-danger hover:bg-surface-muted"
                onClick={() => logout()}
              >
                <Icon name="logout" /> Keluar
              </button>
            </div>
          )}
        </div>
      </header>

      <aside className="fixed top-[60px] bottom-0 left-0 z-10 hidden w-[240px] flex-col overflow-y-auto bg-surface lg:flex">
        {nav}
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-dark/50 lg:hidden"
          onClick={close}
        >
          <div
            className="flex h-full w-[280px] flex-col bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center px-5 py-4">
              <span className="flex-1 font-medium">Menu</span>
              <button aria-label="Tutup" onClick={close}>
                <Icon name="close" />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <main className="px-4 pt-[75px] pb-10 sm:px-5 lg:ml-[240px] lg:px-[25px]">
        <div className="mx-auto max-w-[1140px]">
          <Outlet />
        </div>
      </main>
      <ConfirmDialog open={resetting} tone="warning" title="Reset data demo?" confirmLabel="Reset data"
        onConfirm={() => { resetDb(); qc.invalidateQueries(); setResetting(false); toast({ tone: "info", title: "Data demo direset", text: "Semua perubahan dihapus; data kembali seperti awal." }); }}
        onClose={() => setResetting(false)}>
        <p>Semua yang Anda ubah selama demo (project, bimbingan, unggahan, feedback, hari berhalangan) akan dihapus dan data kembali seperti awal.</p>
        <p className="text-[13px] text-fg-muted">Berlaku untuk semua akun demo di browser ini.</p>
      </ConfirmDialog>
    </HeaderSlot.Provider>
  );
}

/** Redirects the wrong role home (the API would answer 403). */
export function RoleRoute({ role }: { role: "student" | "lecturer" }) {
  const { user } = useAuth();
  return user?.role === role ? <Outlet /> : <Navigate to="/" replace />;
}
