"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";

const CLIENT_NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scan", label: "Scan" },
  { href: "/history", label: "History" },
  { href: "/profile", label: "Profile" },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      router.replace("/login");
    } else if (session.role !== "client") {
      // Admin tokens have no client_id, so every client-scoped endpoint would
      // 403 for them anyway - there is no "admin viewing as a client" mode.
      router.replace("/admin/clients");
    }
  }, [session, router]);

  if (session === undefined || session === null || session.role !== "client") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <svg
          className="h-8 w-8 animate-spin text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return <AppShell navItems={CLIENT_NAV}>{children}</AppShell>;
}
