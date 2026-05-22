import { isSupabaseConfigured } from "@/lib/supabase";
import { DEFAULT_LOGO_URL } from "@/lib/branding";
import { useAuth } from "@/context/AuthContext";

export function TopBar() {
  const { user, logout } = useAuth();

  return (
    <div className="topbar">
      <div className="topbar-brand">
        <img className="topbar-logo" src={DEFAULT_LOGO_URL} alt="SickFit" />
        <div>
          <h1>SickFit Nexus</h1>
          <p>v1.0.0</p>
        </div>
      </div>
      <div className="pill-row">
        <span
          className={`status-badge ${isSupabaseConfigured ? "status-success" : "status-warning"}`}
        >
          {isSupabaseConfigured ? "Backend Connected" : "Configure Backend"}
        </span>
        {user && (
          <>
            <span className="status-badge status-neutral">{user.display_name}</span>
            <button
              className="btn btn-ghost btn-small"
              onClick={() => void logout()}
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
