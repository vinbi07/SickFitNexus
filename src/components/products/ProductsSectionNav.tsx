import { NavLink, Navigate, useLocation } from "react-router-dom";

export const PRODUCTS_SECTION = {
  products: "/products",
  inventory: "/products/inventory",
  barcodes: "/products/barcodes",
} as const;

const VIEWS = [
  { to: PRODUCTS_SECTION.products, label: "Products" },
  { to: PRODUCTS_SECTION.inventory, label: "Inventory" },
  { to: PRODUCTS_SECTION.barcodes, label: "Barcodes" },
];

/**
 * Switches between the views of the Products section. These are links to
 * separate pages (so back, bookmarks and middle-click work), not in-page tabs;
 * each list keeps its own filter tabs below.
 */
export function ProductsSectionNav() {
  return (
    <nav className="section-nav" aria-label="Products section">
      {VIEWS.map((view) => (
        <NavLink key={view.to} to={view.to} end className={({ isActive }) => `section-nav-link${isActive ? " is-active" : ""}`}>
          {view.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Redirect that keeps the query string, so old links like /barcodes?tab=problems still land right. */
export function RedirectKeepingQuery({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}
