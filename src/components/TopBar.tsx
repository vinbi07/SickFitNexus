import { Menu } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase";
import { DEFAULT_LOGO_URL } from "@/lib/branding";
import { useAuth } from "@/context/AuthContext";

const pageContexts = [
  { match: /^\/$/, title: "Operations Command", context: "Wholesale, inventory, inbound, and account velocity" },
  { match: /^\/imports/, title: "CSV Intake", context: "Normalize wholesale PO files and import lineage" },
  { match: /^\/purchase-orders\/new/, title: "PO Builder", context: "Create catalog-driven wholesale purchase orders" },
  { match: /^\/purchase-orders/, title: "Purchase Orders", context: "Lifecycle, approvals, invoices, and fulfillment" },
  { match: /^\/pending-queue/, title: "Pending Queue", context: "Inbound requests waiting for review" },
  { match: /^\/inventory/, title: "Inventory Control", context: "On-hand, incoming, allocation, and risk" },
  { match: /^\/vendors/, title: "Vendors", context: "Supplier reliability and manufacturing context" },
  { match: /^\/retailers/, title: "Accounts", context: "Retailer velocity, buyers, and operating notes" },
  { match: /^\/compliance/, title: "Compliance", context: "Requirements, missing docs, and holds" },
  { match: /^\/production/, title: "Manufacturing", context: "Inbound production, route status, and invoices" },
  { match: /^\/locations/, title: "Locations", context: "Warehouses, stores, and inventory homes" },
  { match: /^\/products/, title: "Products", context: "Catalog, variants, Shopify links, and risk" },
  { match: /^\/barcodes/, title: "Barcodes", context: "Barcode-book staging and product links" },
  { match: /^\/lookbook-templates/, title: "Lookbooks", context: "Buyer assortments and wholesale templates" },
  { match: /^\/alerts/, title: "Alerts", context: "Critical stops, warnings, and watchlist" },
  { match: /^\/reports/, title: "Reports", context: "Executive operating summaries" },
  { match: /^\/sops/, title: "SOPs", context: "Operating procedures and references" },
  { match: /^\/wins/, title: "Wins", context: "Team momentum and milestones" },
  { match: /^\/people/, title: "People", context: "Operators, partners, and experts" },
  { match: /^\/training/, title: "Training", context: "Modules and completion tracking" },
  { match: /^\/settings/, title: "Settings", context: "Branding and baseline configuration" },
];

export function TopBar({
  onOpenMobileNav,
}: {
  onOpenMobileNav?: (triggerButton: HTMLButtonElement) => void;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const pageContext = pageContexts.find((item) => item.match.test(location.pathname)) ?? pageContexts[0];

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
        <div>
          <p className="topbar-kicker">SickFit Nexus</p>
          <h1>{pageContext.title}</h1>
          <p>{pageContext.context}</p>
        </div>
      </div>
      <div className="topbar-actions">
        <Link className="btn btn-primary btn-small" to="/purchase-orders/new">New PO</Link>
        <span
          className={`status-badge ${isSupabaseConfigured ? "status-success" : "status-warning"}`}
        >
          {isSupabaseConfigured ? "Live Data" : "Backend Setup"}
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
