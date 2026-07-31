"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { UserRecord } from "@/lib/types";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

export default function ProfilePage() {
  const [me, setMe] = useState<UserRecord | null>(null);

  useEffect(() => {
    api
      .getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return (
    <div>
      <PageHeader title="Profile" />
      <Card className="max-w-md">
        <h2 className="text-sm font-semibold text-slate-900">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="text-slate-900">{me?.email ?? "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd className="capitalize text-slate-900">{me?.role ?? "—"}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
