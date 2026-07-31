"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/** Resolves where to go based on session/role - never renders any UI itself. */
export default function RootPage() {
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    if (session === undefined) return; // still checking localStorage
    if (session === null) {
      router.replace("/login");
    } else if (session.role === "admin") {
      router.replace("/admin/clients");
    } else {
      router.replace("/dashboard");
    }
  }, [session, router]);

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
