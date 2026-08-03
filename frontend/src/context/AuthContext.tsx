import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthMode, UserDTO } from "@shared/types";
import { getAuthStatus, login as apiLogin, logout as apiLogout } from "../api/client";

interface AuthContextValue {
  user: UserDTO | null;
  authMode: AuthMode;
  /** True until the initial /api/auth/me check resolves — the app shell/login gate wait on this
   *  rather than flashing "logged out" before we actually know. */
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("open");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuthStatus()
      .then((status) => {
        setUser(status.user);
        setAuthMode(status.authMode);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { user: loggedInUser } = await apiLogin(username, password);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, authMode, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
