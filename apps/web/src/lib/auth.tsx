import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, setSessionEndHandler } from "./api";
import type { Profile } from "./types";

interface Auth {
  user: Profile | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<Profile>;
  logout: () => Promise<void>;
}
const Ctx = createContext<Auth>(null!);
export const useAuth = () => useContext(Ctx);
/** For pages that only render behind ProtectedRoute. */
export const useMe = () => useContext(Ctx).user!;

// app boot: refresh → me. Memoised so StrictMode's double effect (dev) makes one round, not two.
// Only "unreachable" errors are retried; they never rotate the token.
let booting: Promise<Profile> | null = null;
const unreachable = (e: unknown) =>
  e instanceof ApiError && [0, 429, 502, 503, 504].includes(e.status);
const bootSession = () =>
  (booting ??= (async () => {
    for (let tries = 0; ; tries++) {
      try {
        await api.post("/auth/refresh");
        return await api.get<Profile>("/auth/me");
      } catch (e) {
        if (tries >= 2 || !unreachable(e)) throw e;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })());

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionEndHandler(() => {
      setUser(null);
      qc.clear();
    });
  }, [qc]);

  useEffect(() => {
    bootSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = async (email: string, password: string) => {
    await api.post("/auth/login", { email, password });
    const me = await api.get<Profile>("/auth/me");
    setUser(me);
    return me;
  };
  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
    qc.clear();
  };
  return (
    <Ctx.Provider value={{ user, ready, login, logout }}>
      {children}
    </Ctx.Provider>
  );
}
