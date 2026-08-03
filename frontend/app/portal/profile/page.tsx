"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { LogOutIcon, UserIcon } from "@/components/icons";
import { PageHeader, Spinner } from "@/components/ui";
import { useAuthSession } from "@/lib/authStore";
import type { UserAccount } from "@/lib/types";

export default function ProfilePage() {
  const { logout } = useAuthSession();
  const router = useRouter();
  const [me, setMe] = useState<UserAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then(setMe)
      .catch((err) => setError(err instanceof api.ApiError ? err.message : "Could not load account info."));
  }, []);

  return (
    <div className="max-w-md">
      <PageHeader title="Profile" />

      {error && (
        <p className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {!me && !error && <Spinner />}

      {me && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <UserIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{me.email}</p>
              <p className="text-xs capitalize text-slate-500">{me.role} account</p>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          logout();
          router.replace("/login");
        }}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
      >
        <LogOutIcon className="h-4 w-4" />
        Log Out
      </button>
    </div>
  );
}
