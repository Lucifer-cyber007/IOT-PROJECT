"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { PageHeader, Spinner, StatCard, ErrorBanner } from "@/components/ui";
import { BuildingIcon, ClockIcon, GridIcon } from "@/components/icons";
import type { AdminDashboardSummary } from "@/lib/types";

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminGetDashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof api.ApiError ? err.message : "Could not load analytics."));
  }, []);

  return (
    <div>
      <PageHeader title="Analytics" subtitle="Activity across every client on the platform." />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!summary && !error && <Spinner />}

      {summary && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard label="Clients" value={summary.total_clients} icon={<BuildingIcon className="h-5 w-5" />} />
            <StatCard label="Machines" value={summary.total_machines} icon={<GridIcon className="h-5 w-5" />} />
            <StatCard label="Total Readings" value={summary.total_readings} icon={<ClockIcon className="h-5 w-5" />} />
            <StatCard label="Readings (7d)" value={summary.readings_this_week} icon={<ClockIcon className="h-5 w-5" />} />
          </div>

          <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">
            Per Client
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Client</th>
                  <th className="px-5 py-3">Machines</th>
                  <th className="px-5 py-3">Readings</th>
                </tr>
              </thead>
              <tbody>
                {summary.per_client.map((c) => (
                  <tr key={c.client_id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-900">{c.name}</td>
                    <td className="px-5 py-3 text-slate-600">{c.machine_count}</td>
                    <td className="px-5 py-3 text-slate-600">{c.reading_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
