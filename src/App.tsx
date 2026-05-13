import { NavLink, Route, Routes } from "react-router-dom";
import { DashboardPage } from "@/pages/DashboardPage";
import { CsvImportsPage } from "@/pages/CsvImportsPage";
import { PurchaseOrdersPage } from "@/pages/PurchaseOrdersPage";
import { PurchaseOrderDetailPage } from "@/pages/PurchaseOrderDetailPage";
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
import { RetailersPage } from "@/pages/RetailersPage";
import { CompliancePage } from "@/pages/CompliancePage";
import { ProductionPage } from "@/pages/ProductionPage";
import { AppShell } from "@/components/AppShell";
import { DEFAULT_LOGO_URL } from "@/lib/branding";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/imports", label: "CSV Imports" },
  { to: "/purchase-orders", label: "Purchase Orders" },
  { to: "/inventory", label: "Inventory" },
  { to: "/vendors", label: "Vendors" },
  { to: "/retailers", label: "Retailers" },
  { to: "/compliance", label: "Compliance" },
  { to: "/production", label: "Production" },
  { to: "/locations", label: "Locations" },
  { to: "/products", label: "Products" },
  { to: "/alerts", label: "Alerts" },
  { to: "/reports", label: "Reports" },
  { to: "/sops", label: "SOPs" },
  { to: "/wins", label: "Wins" },
  { to: "/people", label: "People" },
  { to: "/training", label: "Training" },
  { to: "/settings", label: "Settings" },
];

export default function App() {
  return (
    <AppShell
      sidebar={
        <div className="sidebar-nav">
          <div className="brand-lockup">
            <div className="brand-mark brand-mark-image">
              <img src={DEFAULT_LOGO_URL} alt="SickFit" />
            </div>
            <div>
              <p>SickFit Nexus</p>
              <span>Operational Command Center</span>
            </div>
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `nav-link${isActive ? " nav-link-active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/imports" element={<CsvImportsPage />} />
        <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/retailers" element={<RetailersPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/production" element={<ProductionPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/sops" element={<SopsPage />} />
        <Route path="/wins" element={<WinsPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </AppShell>
  );
}
