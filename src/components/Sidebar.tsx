import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { NAV_ENTRIES, type NavParent } from "@/lib/navigation";
import { DEFAULT_LOGO_URL } from "@/lib/branding";

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isParentActive(parent: NavParent, pathname: string): boolean {
  if (parent.to && matchesPath(parent.to, pathname)) return true;
  return parent.children.some((child) => matchesPath(child.to, pathname));
}

function matchesPath(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function Sidebar({
  railCollapsed,
  onToggleRailCollapsed,
}: {
  railCollapsed: boolean;
  onToggleRailCollapsed: () => void;
}) {
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const entry of NAV_ENTRIES) {
      if (entry.kind === "parent" && isParentActive(entry, location.pathname)) {
        initial.add(entry.label);
      }
    }
    return initial;
  });

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      let changed = false;
      for (const entry of NAV_ENTRIES) {
        if (entry.kind === "parent" && isParentActive(entry, location.pathname) && !next.has(entry.label)) {
          next.add(entry.label);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [location.pathname]);

  function toggleGroup(label: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  return (
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
        onClick={onToggleRailCollapsed}
      >
        <span aria-hidden="true">{railCollapsed ? ">>" : "<<"}</span>
        <span className="rail-toggle-label">{railCollapsed ? "Expand" : "Collapse"}</span>
      </button>
      <nav className="rail-groups" aria-label="Primary navigation">
        {NAV_ENTRIES.map((entry) => {
          if (entry.kind === "section") {
            return (
              <p className="rail-group-label rail-section-label" key={entry.label}>
                {entry.label}
              </p>
            );
          }

          if (entry.kind === "leaf") {
            const Icon = entry.icon;
            return (
              <NavLink
                key={`${entry.to}-${entry.label}`}
                to={entry.to}
                end={entry.to === "/"}
                title={railCollapsed ? entry.label : undefined}
                className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}
              >
                <span className="nav-icon" aria-hidden="true">
                  <Icon size={15} strokeWidth={2} />
                </span>
                <span className="nav-label">{entry.label}</span>
              </NavLink>
            );
          }

          const Icon = entry.icon;
          const isOpen = expandedGroups.has(entry.label);
          const active = isParentActive(entry, location.pathname);
          const panelId = `rail-panel-${slugify(entry.label)}`;

          return (
            <div className="rail-group-parent-wrap" key={entry.label}>
              <div className="rail-group-parent">
                {entry.to ? (
                  <NavLink
                    to={entry.to}
                    end={false}
                    title={railCollapsed ? entry.label : undefined}
                    className={({ isActive }) =>
                      `nav-link nav-link-parent${isActive || active ? " nav-link-active" : ""}`
                    }
                  >
                    <span className="nav-icon" aria-hidden="true">
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    <span className="nav-label">{entry.label}</span>
                  </NavLink>
                ) : (
                  <button
                    type="button"
                    className={`nav-link nav-link-parent${active ? " nav-link-active" : ""}`}
                    title={railCollapsed ? entry.label : undefined}
                    onClick={() => toggleGroup(entry.label)}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    <span className="nav-label">{entry.label}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="rail-chevron"
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${entry.label}`}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggleGroup(entry.label)}
                >
                  <ChevronDown
                    className={`rail-chevron-icon${isOpen ? " rail-chevron-open" : ""}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
              {isOpen && !railCollapsed && (
                <div id={panelId} className="rail-children" role="group">
                  {entry.children.map((child) => {
                    const ChildIcon = child.icon;
                    return (
                      <NavLink
                        key={`${child.to}-${child.label}`}
                        to={child.to}
                        end={false}
                        className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          <ChildIcon size={14} strokeWidth={2} />
                        </span>
                        <span className="nav-label">{child.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
