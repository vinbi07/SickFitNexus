import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { CalendarPage } from "@/pages/CalendarPage";
import { CsvImportsPage } from "@/pages/CsvImportsPage";
import { PurchaseOrdersPage } from "@/pages/PurchaseOrdersPage";
import { PurchaseOrderDetailPage } from "@/pages/PurchaseOrderDetailPage";
import { PurchaseOrderBuilderPage } from "@/pages/PurchaseOrderBuilderPage";
import { PurchaseOrderPreviewPage } from "@/pages/PurchaseOrderPreviewPage";
import { CreateDocumentPage } from "@/pages/CreateDocumentPage";
import { PurchaseOrderWizardPage } from "@/pages/PurchaseOrderWizardPage";
import { InvoicesPage } from "@/pages/InvoicesPage";
import { InvoiceDetailPage } from "@/pages/InvoiceDetailPage";
import { InvoicePreviewPage } from "@/pages/InvoicePreviewPage";
import { InventoryPage } from "@/pages/InventoryPage";
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
import { ProductionPlannerPage } from "@/pages/ProductionPlannerPage";
import { ProductionPlanDetailPage } from "@/pages/ProductionPlanDetailPage";
import { ProductionTemplatesPage } from "@/pages/ProductionTemplatesPage";
import { LookbookOrderPage } from "@/pages/LookbookOrderPage";
import { LookbookTemplatesPage } from "@/pages/LookbookTemplatesPage";
import { LookbookTemplateEditorPage } from "@/pages/LookbookTemplateEditorPage";
import { LookbookPreviewPage } from "@/pages/LookbookPreviewPage";
import { PendingQueuePage } from "@/pages/PendingQueuePage";
import { AppShell } from "@/components/AppShell";
import { Sidebar } from "@/components/Sidebar";

const RAIL_COLLAPSED_KEY = "sickfit-nexus-rail-collapsed";

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
              <Sidebar
                railCollapsed={railCollapsed}
                onToggleRailCollapsed={() => setRailCollapsed((current) => !current)}
              />
            }
          >
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/imports" element={<CsvImportsPage />} />
              <Route path="/documents/new" element={<CreateDocumentPage />} />
              <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
              <Route path="/purchase-orders/new" element={<PurchaseOrderBuilderPage />} />
              <Route path="/purchase-orders/new/wizard" element={<PurchaseOrderWizardPage />} />
              <Route path="/purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
              <Route path="/purchase-orders/:id/edit" element={<PurchaseOrderBuilderPage />} />
              <Route path="/purchase-orders/:id/preview" element={<PurchaseOrderPreviewPage />} />
              <Route path="/invoices" element={<InvoicesPage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="/invoices/:id/preview" element={<InvoicePreviewPage />} />
              <Route path="/pending-queue" element={<PendingQueuePage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/retailers" element={<RetailersPage />} />
              <Route path="/retailers/:id" element={<RetailerDetailPage />} />
              <Route path="/compliance" element={<CompliancePage />} />
              <Route path="/production" element={<ProductionPage />} />
              <Route path="/production/planner" element={<ProductionPlannerPage />} />
              <Route path="/production/planner/:id" element={<ProductionPlanDetailPage />} />
              <Route path="/production/templates" element={<ProductionTemplatesPage />} />
              <Route path="/locations" element={<LocationsPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="/barcodes" element={<BarcodesPage />} />
              <Route path="/lookbook-templates" element={<LookbookTemplatesPage />} />
              <Route path="/lookbook-templates/new" element={<LookbookTemplateEditorPage />} />
              <Route path="/lookbook-templates/:id/edit" element={<LookbookTemplateEditorPage />} />
              <Route path="/lookbook-templates/preview/:buyerId" element={<LookbookPreviewPage />} />
              <Route path="/lookbook-templates/preview" element={<LookbookPreviewPage />} />
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
