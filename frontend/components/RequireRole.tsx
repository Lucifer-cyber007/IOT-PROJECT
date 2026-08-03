"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthSession } from "@/lib/authStore";
import type { Role } from "@/lib/types";

const KNOWN_ROLES: Role[] = ["admin", "client_admin", "technician"];

function homeFor(role: string): string | null {
  if (role === "admin") return "/admin";
  if (role === "client_admin" || role === "technician") return "/portal";
  return null; // not a role this build knows about - treat as a stale/corrupt session
}

export default function RequireRole({
  role,
  children,
}: {
  role: Role | Role[];
  children: React.ReactNode;
}) {
  const { session, logout } = useAuthSession();
  const router = useRouter();
  const allowed = Array.isArray(role) ? role : [role];
  const isAllowed = (r: Role) => KNOWN_ROLES.includes(r) && allowed.includes(r);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      router.replace("/login");
      return;
    }
    if (!isAllowed(session.role)) {
      const target = homeFor(session.role);
      if (target) {
        router.replace(target);
      } else {
        // Unrecognized role - almost always a session cached from before a role
        // rename. Bouncing to the "home for this role" would just loop forever
        // since there's no home for an unknown role - clear it and start over.
        logout();
        router.replace("/login");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `allowed` is derived fresh each render from `role`
  }, [session, router]);

  if (session === undefined || session === null || !isAllowed(session.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
