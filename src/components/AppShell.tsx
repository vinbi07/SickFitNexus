import type { PropsWithChildren, ReactNode } from "react";
import { TopBar } from "@/components/TopBar";

export function AppShell({
  sidebar,
  railCollapsed = false,
  children,
}: PropsWithChildren<{ sidebar: ReactNode; railCollapsed?: boolean }>) {
  return (
    <div className={`app-shell${railCollapsed ? " app-shell-rail-collapsed" : ""}`}>
      <aside className="sidebar">{sidebar}</aside>
      <main className="content-area">
        <div className="content-inner">
          <TopBar />
          {children}
        </div>
      </main>
    </div>
  );
}
