import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CsvImportsPage } from "@/pages/CsvImportsPage";
import { PurchaseOrdersPage } from "@/pages/PurchaseOrdersPage";
import { PurchaseOrderDetailPage } from "@/pages/PurchaseOrderDetailPage";
import { PurchaseOrderBuilderPage } from "@/pages/PurchaseOrderBuilderPage";
import { PurchaseOrderPreviewPage } from "@/pages/PurchaseOrderPreviewPage";
import { InvoicesPage } from "@/pages/InvoicesPage";
import { InvoiceDetailPage } from "@/pages/InvoiceDetailPage";
import { InvoicePreviewPage } from "@/pages/InvoicePreviewPage";
import { InventoryPage } from "@/pages/InventoryPage";
import { VendorsPage } from "@/pages/VendorsPage";
import { AlertsPage } from "@/pages/AlertsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SopsPage } from "@/pages/SopsPage";
import { WinsPage } from "@/pages/WinsPage";
import { PeoplePage } from "@/pages/PeoplePage";
import { TrainingPage } from "@/pages/TrainingPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LocationsPage } from "@/pages/LocationsPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ProductDetailPage } from "@/pages/ProductDetailPage";
import { BarcodesPage } from "@/pages/BarcodesPage";
import { RetailersPage } from "@/pages/RetailersPage";
import { RetailerDetailPage } from "@/pages/RetailerDetailPage";
import { CompliancePage } from "@/pages/CompliancePage";
import { ProductionPage } from "@/pages/ProductionPage";
import { LookbookOrderPage } from "@/pages/LookbookOrderPage";
import { LookbookTemplatesPage } from "@/pages/LookbookTemplatesPage";
import { PendingQueuePage } from "@/pages/PendingQueuePage";
import { AppShell } from "@/components/AppShell";
import { DEFAULT_LOGO_URL } from "@/lib/branding";

const RAIL_COLLAPSED_KEY = "sickfit-nexus-rail-collapsed";

const navGroups = [
  {
    label: "Command",
    items: [
      { to: "/", label: "Dashboard", icon: "OC" },
      { to: "/alerts", label: "Alerts", icon: "AL" },
      { to: "/reports", label: "Reports", icon: "RP" },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/imports", label: "CSV Imports", icon: "IM" },
      { to: "/purchase-orders", label: "Purchase Orders", icon: "PO" },
      { to: "/invoices", label: "Invoices", icon: "IN" },
      { to: "/pending-queue", label: "Pending Queue", icon: "PQ" },
      { to: "/inventory", label: "Inventory", icon: "IV" },
      { to: "/vendors", label: "Vendors", icon: "VN" },
      { to: "/retailers", label: "Accounts", icon: "AC" },
      { to: "/compliance", label: "Compliance", icon: "CP" },
      { to: "/production", label: "Manufacturing", icon: "MF" },
      { to: "/locations", label: "Locations", icon: "LC" },
    ],
  },
  {
    label: "Catalog",
    items: [
      { to: "/products", label: "Products", icon: "PR" },
      { to: "/barcodes", label: "Barcodes", icon: "BC" },
      { to: "/lookbook-templates", label: "Lookbooks", icon: "LB" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/sops", label: "SOPs", icon: "SP" },
      { to: "/wins", label: "Wins", icon: "WN" },
      { to: "/people", label: "People", icon: "PL" },
      { to: "/training", label: "Training", icon: "TR" },
    ],
  },
  {
    label: "Admin",
    items: [
      { to: "/settings", label: "Settings", icon: "ST" },
    ],
  },
];

export default function App() {
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === "true";
  });

  useEffect(() => {
    window.localStorage.setItem(RAIL_COLLAPSED_KEY, String(railCollapsed));
  }, [railCollapsed]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/lookbook/:token" element={<LookbookOrderPage />} />
      <Route
        path="*"
        element={(
          <ProtectedRoute>
          <AppShell
            railCollapsed={railCollapsed}
            sidebar={
              <div className="rail-nav">
                <div className="brand-lockup">
                  <div className="brand-mark brand-mark-image">
                    <img src={DEFAULT_LOGO_URL} alt="SickFit" />
                  </div>
                  <div className="brand-copy">
                    <p>SickFit Nexus</p>
                    <span>Operational Command Center</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="rail-toggle"
                  aria-label={railCollapsed ? "Expand navigation" : "Collapse navigation"}
                  title={railCollapsed ? "Expand navigation" : "Collapse navigation"}
                  onClick={() => setRailCollapsed((current) => !current)}
                >
                  <span aria-hidden="true">{railCollapsed ? ">>" : "<<"}</span>
                  <span className="rail-toggle-label">{railCollapsed ? "Expand" : "Collapse"}</span>
                </button>
                <nav className="rail-groups" aria-label="Primary navigation">
                  {navGroups.map((group) => (
                    <div className="rail-group" key={group.label}>
                      <p className="rail-group-label">{group.label}</p>
                      {group.items.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === "/"}
                          title={railCollapsed ? item.label : undefined}
                          className={({ isActive }) =>
                            `nav-link${isActive ? " nav-link-active" : ""}`
                          }
                        >
                          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                          <span className="nav-label">{item.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  ))}
                </nav>
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/imports" element={<CsvImportsPage />} />
              <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
              <Route path="/purchase-orders/new" element={<PurchaseOrderBuilderPage />} />
              <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
              <Route path="/purchase-orders/:id/edit" element={<PurchaseOrderBuilderPage />} />
              <Route path="/purchase-orders/:id/preview" element={<PurchaseOrderPreviewPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="/invoices/:id/preview" element={<InvoicePreviewPage />} />
              <Route path="/pending-queue" element={<PendingQueuePage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/vendors" element={<VendorsPage />} />
              <Route path="/retailers" element={<RetailersPage />} />
              <Route path="/retailers/:id" element={<RetailerDetailPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/production" element={<ProductionPage />} />
              <Route path="/locations" element={<LocationsPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="/barcodes" element={<BarcodesPage />} />
              <Route path="/lookbook-templates" element={<LookbookTemplatesPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/sops" element={<SopsPage />} />
              <Route path="/wins" element={<WinsPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/training" element={<TrainingPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </AppShell>
          </ProtectedRoute>
        )}
      />
    </Routes>
  );
}
