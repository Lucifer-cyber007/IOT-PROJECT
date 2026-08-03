"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { ClockIcon } from "@/components/icons";
import { EmptyState, ErrorBanner, PageHeader, SkeletonList } from "@/components/ui";
import type { Machine, Reading } from "@/lib/types";

export default function HistoryPage() {
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [machines, setMachines] = useState<Map<number, Machine>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getMyReadings(), api.getMyMachines()])
      .then(([myReadings, myMachines]) => {
        setReadings(myReadings);
        setMachines(new Map(myMachines.map((m) => [m.id, m])));
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load history.");
      });
  }, []);

  return (
    <div>
      <PageHeader title="History" subtitle="All readings across every machine." />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!readings && !error && <SkeletonList rows={4} />}

      {readings && readings.length === 0 && (
        <EmptyState
          icon={<ClockIcon className="h-6 w-6" />}
          title="No readings yet"
          message="Scan a document or add a manual reading from any of your machines."
        />
      )}

      {readings && readings.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {readings.map((reading) => {
            const machine = machines.get(reading.machine_id);
            return (
              <div key={reading.id} className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">
                    {machine?.name ?? `Machine #${reading.machine_id}`}
                  </p>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {reading.capture_method}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(reading.captured_at).toLocaleString()}
                </p>
                {machine && (
                  <p className="mt-1 text-xs text-slate-500">
                    {machine.template.fields
                      .slice(0, 3)
                      .map((f) => `${f.label}: ${reading.fields[f.key] ?? "—"}`)
                      .join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
