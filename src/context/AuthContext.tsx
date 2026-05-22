import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

export interface AuthUser {
  id:           string;
  email:        string;
  display_name: string;
}

interface AuthContextValue {
  user:    AuthUser | null;
  loading: boolean;
  login:   (email: string, password: string) => Promise<{ error: string | null }>;
  logout:  () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("no session");
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) setUser(data.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ email, password }),
      });

      let data: { user?: AuthUser; error?: string } = {};
      try {
        data = await res.json() as typeof data;
      } catch {
        // response wasn't JSON — likely a 404 HTML page from Vite dev server
        return { error: "Login service unreachable. Run npm run dev:vercel to enable auth." };
      }

      if (!res.ok) {
        return { error: data.error ?? "Login failed. Please try again." };
      }

      setUser(data.user ?? null);
      return { error: null };
    } catch {
      return { error: "Network error. Please check your connection and try again." };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
