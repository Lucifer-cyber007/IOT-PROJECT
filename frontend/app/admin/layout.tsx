"use client";

import RequireRole from "@/components/RequireRole";
import Sidebar from "@/components/Sidebar";
import { BarChartIcon, BuildingIcon, FileIcon, InboxIcon } from "@/components/icons";

const LINKS = [
  { href: "/admin", label: "Clients", icon: BuildingIcon },
  { href: "/admin/templates", label: "Templates", icon: FileIcon },
  { href: "/admin/requests", label: "Requests", icon: InboxIcon },
  { href: "/admin/analytics", label: "Analytics", icon: BarChartIcon },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role="admin">
      <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
        <Sidebar subtitle="Admin Console" links={LINKS} />
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
        </main>
      </div>
    </RequireRole>
  );
}
