import { isSupabaseConfigured } from "@/lib/supabase";
import { DEFAULT_LOGO_URL } from "@/lib/branding";

export function TopBar() {
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
      </div>
    </div>
  );
}
