import { DASHBOARD_SESSION_KEY, type AuthUser } from "@/context/AuthContext";
import { assertSupabase } from "@/lib/supabase";

function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DASHBOARD_SESSION_KEY);
}

export const dashboardSessionService = {
  getToken() {
    return getStoredToken();
  },

  async getCurrentUser(): Promise<AuthUser | null> {
    const token = getStoredToken();
    if (!token) return null;

    const supabase = assertSupabase();
    const { data, error } = await supabase.rpc("admin_check_session", { p_token: token });
    if (error) throw error;
    return (data as { user?: AuthUser | null } | null)?.user ?? null;
  },

  async requireCurrentUser(): Promise<AuthUser> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error("Your dashboard session has expired. Please sign in again.");
    }
    return user;
  },
};
