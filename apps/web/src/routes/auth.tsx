// US-01: POST /auth/login, GET /study-programs, POST /auth/register.
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Field,
  Input,
  Select,
  useToast,
} from "../components/ui";
import { Logo } from "../components/layout";
import { AuthHero } from "./auth-hero";
import { useAuth } from "../lib/auth";
import { api, errorMessage } from "../lib/api";
import type { StudyProgram } from "../lib/types";

function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:h-screen lg:grid-cols-[1.25fr_1fr] lg:overflow-hidden">
      <aside className="relative hidden overflow-hidden bg-navy px-12 py-10 text-white lg:flex lg:flex-col xl:px-16">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-primary opacity-40 blur-[120px]" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 size-[420px] rounded-full bg-accent opacity-15 blur-[120px]" />
        <div className="relative mb-6">
          <Logo inverse large />
        </div>
        <AuthHero />
        <p className="relative text-[13px] text-white/50">
          © {new Date().getFullYear()} Konsulin
        </p>
      </aside>

      <main className="flex flex-col bg-white px-5 py-6 sm:px-10 lg:overflow-y-auto">
        <div className="lg:hidden">
          <Logo large />
        </div>
        <div className="mx-auto my-auto w-full max-w-sm py-6">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight text-fg">
            {title}
          </h1>
          <p className="mt-1.5 mb-5 text-fg-muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const m = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: () => nav(from, { replace: true }),
  });
  if (user) return <Navigate to={from} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  return (
    <AuthLayout
      title="Selamat datang kembali"
      subtitle="Masuk untuk melanjutkan bimbingan Anda."
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        {m.error && <Alert tone="danger">{errorMessage(m.error)}</Alert>}
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password" required>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" loading={m.isPending} size="lg">
          Masuk
        </Button>
        <p className="text-center text-fg-muted">
          Mahasiswa belum punya akun?{" "}
          <Link to="/register" className="font-medium text-link">
            Daftar
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const nav = useNavigate();
  const toast = useToast();
  const programs = useQuery({
    queryKey: ["study-programs"],
    queryFn: () => api.get<StudyProgram[]>("/study-programs"),
  });
  const [f, setF] = useState({
    name: "",
    nrp: "",
    email: "",
    password: "",
    studyProgramId: "",
    cohortYear: String(new Date().getFullYear()),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () =>
      api.post("/auth/register", { ...f, cohortYear: Number(f.cohortYear) }),
    onSuccess: () => {
      toast({
        tone: "success",
        title: "Registrasi berhasil, silakan masuk",
      });
      nav("/login");
    },
  });
  const year = new Date().getFullYear();
  return (
    <AuthLayout
      title="Buat akun mahasiswa"
      subtitle="Akun dosen dibuat oleh admin, tidak perlu mendaftar."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="flex flex-col gap-3"
      >
        {m.error && <Alert tone="danger">{errorMessage(m.error)}</Alert>}
        <Field label="Nama lengkap" required>
          <Input
            value={f.name}
            onChange={set("name")}
            minLength={3}
            maxLength={100}
            required
          />
        </Field>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field label="NRP" required>
            <Input
              value={f.nrp}
              onChange={set("nrp")}
              inputMode="numeric"
              pattern="\d{10}"
              placeholder="10 digit angka"
              required
            />
          </Field>
          <Field label="Angkatan" required>
            <Select value={f.cohortYear} onChange={set("cohortYear")}>
              {Array.from({ length: year - 1999 }, (_, i) => year - i).map(
                (y) => (
                  <option key={y}>{y}</option>
                ),
              )}
            </Select>
          </Field>
        </div>
        <Field label="Email" required>
          <Input
            type="email"
            value={f.email}
            onChange={set("email")}
            required
          />
        </Field>
        <Field label="Password" required>
          <Input
            type="password"
            value={f.password}
            onChange={set("password")}
            minLength={8}
            placeholder="Min. 8 karakter, huruf besar, kecil, angka"
            required
          />
        </Field>
        <Field
          label="Program studi"
          hint="Tidak dapat diubah setelah daftar"
          required
        >
          <Select
            value={f.studyProgramId}
            onChange={set("studyProgramId")}
            required
          >
            <option value="">Pilih program studi</option>
            {programs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" loading={m.isPending} size="lg">
          Daftar
        </Button>
        <p className="text-center text-fg-muted">
          Sudah punya akun?{" "}
          <Link to="/login" className="font-medium text-link">
            Masuk
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
