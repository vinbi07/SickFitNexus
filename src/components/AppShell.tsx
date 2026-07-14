import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { TopBar } from "@/components/TopBar";

export function AppShell({
  sidebar,
  railCollapsed = false,
  children,
}: PropsWithChildren<{ sidebar: ReactNode; railCollapsed?: boolean }>) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  function openMobileNav(triggerButton: HTMLButtonElement) {
    menuButtonRef.current = triggerButton;
    setMobileNavOpen(true);
  }

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => sidebarRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      menuButtonRef.current?.focus();
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeMobileNav();
      } else if (event.key === "Tab" && sidebarRef.current) {
        const focusable = Array.from(
          sidebarRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled"));
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  return (
    <div className={`app-shell${railCollapsed ? " app-shell-rail-collapsed" : ""}`}>
      <aside
        className={`sidebar${mobileNavOpen ? " sidebar-mobile-open" : ""}`}
        ref={sidebarRef}
        tabIndex={-1}
      >
        {sidebar}
      </aside>
      {mobileNavOpen && (
        <div className="sidebar-backdrop" onClick={closeMobileNav} aria-hidden="true" />
      )}
      <main className="content-area">
        <div className="content-inner">
          <TopBar onOpenMobileNav={openMobileNav} />
          {children}
        </div>
      </main>
    </div>
  );
}
