// tracer-study-web shell: fixed 60px top bar (logo, page title, user pill), 240px white sidebar.
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar, HeaderSlot, Icon, Loading } from "./ui";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
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

export function Logo({
  inverse,
  large,
}: {
  inverse?: boolean;
  large?: boolean;
}) {
  return (
    <span className={`flex items-center ${large ? "gap-3" : "gap-2"}`}>
      <img
        src="/logo-mark.svg"
        alt=""
        className={large ? "size-12" : "size-7"}
      />
      <span
        className={`${large ? "text-[32px]" : "text-[19px]"} font-bold tracking-tight ${inverse ? "text-white" : "text-navy"}`}
      >
        Konsul
        <span className={inverse ? "text-primary-line" : "text-primary"}>
          in
        </span>
      </span>
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
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  // close the profile menu on outside click or Escape
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  const pending = useQuery({
    queryKey: ["invitations", "me", "pending"],
    queryFn: () =>
      api.list<Invitation>("/invitations/me", { status: "pending" }),
    enabled: user?.role === "student",
  });

  if (!ready) return <Loading />;
  if (!user)
    // keep the query too: email links carry it (e.g. /folders/:id?versi=… from E10)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: loc.pathname + loc.search }}
      />
    );

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
        <div ref={menuRef} className="relative mr-3 shrink-0 sm:mr-5">
          <button
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition hover:bg-surface-muted"
          >
            <Avatar name={user.name} className="size-8" />
            <span className="hidden max-w-[200px] truncate text-[13px] font-medium sm:block">
              {user.name}
            </span>
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute right-0 z-30 mt-2 w-[280px] max-w-[calc(100vw-24px)] rounded-xl border border-border bg-surface shadow-overlay"
            >
              <div className="px-4 py-3.5">
                <p className="font-semibold">{user.name}</p>
                <p className="mt-0.5 text-[13px] text-fg-soft">
                  {user.role === "lecturer"
                    ? "Dosen"
                    : `Mahasiswa · ${user.nrp}`}
                </p>
                <p className="text-[13px] text-fg-muted">{user.email}</p>
                {user.studyProgram && (
                  <p className="text-[13px] text-fg-muted">
                    {user.studyProgram.name} · {user.cohortYear}
                  </p>
                )}
              </div>
              <button
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-b-xl border-t border-border px-4 py-3 text-danger hover:bg-surface-muted"
                onClick={() => logout()}
              >
                <Icon name="logout" className="text-[20px]" /> Keluar
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
    </HeaderSlot.Provider>
  );
}

/** Redirects the wrong role home (the API would answer 403). */
export function RoleRoute({ role }: { role: "student" | "lecturer" }) {
  const { user } = useAuth();
  return user?.role === role ? <Outlet /> : <Navigate to="/" replace />;
}
