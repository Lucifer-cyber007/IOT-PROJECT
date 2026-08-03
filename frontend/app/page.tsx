"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthSession } from "@/lib/authStore";

export default function RootPage() {
  const { session } = useAuthSession();
  const router = useRouter();

  useEffect(() => {
    if (session === undefined) return;
    if (!session) router.replace("/login");
    else router.replace(session.role === "admin" ? "/admin" : "/portal");
  }, [session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <p className="text-sm text-slate-500">Loading…</p>
    </div>
  );
}
