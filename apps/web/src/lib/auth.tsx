import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // app boot: refresh → me
    api
      .post("/auth/refresh")
      .then(() => api.get<Profile>("/auth/me"))
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
