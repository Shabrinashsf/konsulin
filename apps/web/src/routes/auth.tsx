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
import { useAuth } from "../lib/auth";
import { api, errorMessage } from "../lib/api";
import { DEMO_PASSWORD } from "../mock/db";
import type { StudyProgram } from "../lib/types";

const DEMO = [
  ["Dr. Budi Santoso", "budi@konsulin.test", "Dosen · 4 project"],
  ["Andi Pratama", "andi@konsulin.test", "Mahasiswa S1 · TA + riset"],
  ["Siti Rahma", "siti@konsulin.test", "Mahasiswa S1 · 3 project"],
  ["Dewi Lestari", "dewi@konsulin.test", "Mahasiswa S1 · TA"],
  ["Bagus Wicaksono", "bagus@konsulin.test", "Mahasiswa S1 · ada undangan"],
  ["Rizky Maulana", "rizky@konsulin.test", "Mahasiswa S2"],
];

function AuthLayout({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 lg:flex-row lg:items-start lg:pt-[12vh]">
      <div className="card w-full max-w-md p-8">
        <Logo />
        {children}
      </div>
      {aside}
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
  if (user) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };
  return (
    <AuthLayout
      aside={
        <div className="card w-full max-w-sm p-5">
          <p className="font-medium">Akun demo</p>
          <p className="mb-3 text-xs text-fg-muted">
            Password semua akun:{" "}
            <code className="font-medium text-fg">{DEMO_PASSWORD}</code>
          </p>
          <div className="flex flex-col gap-1">
            {DEMO.map(([name, mail, desc]) => (
              <button
                key={mail}
                onClick={() => {
                  setEmail(mail);
                  setPassword(DEMO_PASSWORD);
                }}
                className="rounded-md px-3 py-2 text-left hover:bg-surface-muted"
              >
                <span className="block font-medium">{name}</span>
                <span className="block text-xs text-fg-muted">
                  {mail} · {desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      }
    >
      <h1 className="mt-6 text-title-page font-medium">Masuk</h1>
      <p className="mb-5 text-fg-muted">
        Bimbingan akademik dalam satu tempat.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
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
        title: "Registrasi berhasil",
        text: "Silakan masuk dengan akun baru Anda.",
      });
      nav("/login");
    },
  });
  const year = new Date().getFullYear();
  return (
    <AuthLayout>
      <h1 className="mt-6 text-title-page font-medium">Daftar mahasiswa</h1>
      <p className="mb-5 text-fg-muted">Akun dosen dibuat oleh admin.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
        className="flex flex-col gap-4"
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
        <Field label="NRP" hint="10 digit angka" required>
          <Input
            value={f.nrp}
            onChange={set("nrp")}
            inputMode="numeric"
            pattern="\d{10}"
            required
          />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            value={f.email}
            onChange={set("email")}
            required
          />
        </Field>
        <Field
          label="Password"
          hint="Minimal 8 karakter, ada huruf besar, huruf kecil, dan angka"
          required
        >
          <Input
            type="password"
            value={f.password}
            onChange={set("password")}
            minLength={8}
            required
          />
        </Field>
        <div className="grid grid-cols-[1fr_120px] gap-3">
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
