"use client";

import RequireRole from "@/components/RequireRole";
import Sidebar from "@/components/Sidebar";
import { BarChartIcon, ClockIcon, GridIcon, InboxIcon, UserIcon, UsersIcon } from "@/components/icons";
import { useAuthSession } from "@/lib/authStore";

const BASE_LINKS = [{ href: "/portal", label: "Dashboard", icon: GridIcon }];

const CLIENT_ADMIN_LINKS = [
  { href: "/portal/analytics", label: "Analytics", icon: BarChartIcon },
  { href: "/portal/technicians", label: "Technicians", icon: UsersIcon },
  { href: "/portal/requests", label: "Requests", icon: InboxIcon },
];

const TAIL_LINKS = [
  { href: "/portal/history", label: "History", icon: ClockIcon },
  { href: "/portal/profile", label: "Profile", icon: UserIcon },
];

function PortalNav({ children }: { children: React.ReactNode }) {
  const { session } = useAuthSession();
  const links = [
    ...BASE_LINKS,
    ...(session?.role === "client_admin" ? CLIENT_ADMIN_LINKS : []),
    ...TAIL_LINKS,
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      <Sidebar
        subtitle={session?.role === "client_admin" ? "Client Admin" : "Technician"}
        links={links}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </main>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole role={["client_admin", "technician"]}>
      <PortalNav>{children}</PortalNav>
    </RequireRole>
  );
}
