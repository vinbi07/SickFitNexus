import { Menu } from "lucide-react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase";
import { DEFAULT_LOGO_URL } from "@/lib/branding";
import { useAuth } from "@/context/AuthContext";

// A quiet utility row: each page's own header carries its title, so this bar
// only holds global actions and the account.
export function TopBar({
  onOpenMobileNav,
}: {
  onOpenMobileNav?: (triggerButton: HTMLButtonElement) => void;
}) {
  const { user, logout } = useAuth();

  return (
    <div className="topbar">
      <div className="topbar-page">
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-label="Open navigation menu"
          onClick={(event) => onOpenMobileNav?.(event.currentTarget)}
        >
          <Menu size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <img className="topbar-logo" src={DEFAULT_LOGO_URL} alt="SickFit" />
      </div>
      <div className="topbar-actions">
        {/* Only surface the connection when something needs attention. */}
        {!isSupabaseConfigured ? <span className="status-badge status-warning">Backend setup needed</span> : null}
        <Link className="btn btn-primary btn-small" to="/purchase-orders/new/wizard">
          New PO
        </Link>
        {user && (
          <>
            <span className="topbar-user">{user.display_name}</span>
            <button className="btn btn-ghost btn-small" onClick={() => void logout()}>
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
