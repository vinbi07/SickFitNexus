import type { PropsWithChildren, ReactNode } from "react";
import { TopBar } from "@/components/TopBar";

export function AppShell({
  sidebar,
  children,
}: PropsWithChildren<{ sidebar: ReactNode }>) {
  return (
    <div className="app-shell">
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
