import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { supabase } from "@/lib/supabase";

const SESSION_KEY = "sfn_admin_token";

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

  // Restore session from localStorage on mount
  useEffect(() => {
    let cancelled = false;

    const token = localStorage.getItem(SESSION_KEY);

    if (!token || !supabase) {
      setLoading(false);
      return;
    }

    Promise.resolve(supabase.rpc("admin_check_session", { p_token: token }))
      .then(({ data, error }: { data: { user: AuthUser } | null; error: { message: string } | null }) => {
        if (cancelled) return;
        if (error || !data?.user) {
          localStorage.removeItem(SESSION_KEY);
          setUser(null);
        } else {
          setUser(data.user);
        }
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
    if (!supabase) {
      return { error: "Backend not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." };
    }

    const { data, error } = await supabase.rpc("admin_login", {
      p_email:    email,
      p_password: password,
    });

    if (error) {
      return { error: error.message };
    }

    const result = data as { token?: string; user?: AuthUser; error?: string } | null;

    if (result?.error) {
      return { error: result.error };
    }

    if (!result?.token || !result?.user) {
      return { error: "Login failed. Please try again." };
    }

    localStorage.setItem(SESSION_KEY, result.token);
    setUser(result.user);
    return { error: null };
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    setUser(null);

    if (token && supabase) {
      // Fire and forget — don't block the UI
      void supabase.rpc("admin_logout", { p_token: token });
    }
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
