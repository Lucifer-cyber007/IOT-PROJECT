"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { Badge, EmptyState, ErrorBanner, PageHeader, SkeletonList } from "@/components/ui";
import { ChevronRightIcon, UsersIcon } from "@/components/icons";
import type { Technician } from "@/lib/types";

export default function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Technician[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    api
      .getTechnicians()
      .then(setTechnicians)
      .catch((err) => setError(err instanceof api.ApiError ? err.message : "Could not load technicians."));
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <div>
      <PageHeader
        title="Technicians"
        subtitle="Field staff in your organization and what they've been recording."
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!technicians && !error && <SkeletonList rows={3} />}

      {technicians && technicians.length === 0 && (
        <EmptyState
          icon={<UsersIcon className="h-6 w-6" />}
          title="No technicians yet"
          message="Submit a request under Requests to add your first technician."
        />
      )}

      {technicians && technicians.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {technicians.map((tech) => (
            <Link
              key={tech.id}
              href={`/portal/technicians/${tech.id}`}
              className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-slate-50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">{tech.email}</p>
                  <Badge tone={tech.status === "active" ? "emerald" : "rose"}>{tech.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {tech.machines.length} machine{tech.machines.length === 1 ? "" : "s"} ·{" "}
                  {tech.reading_count} reading{tech.reading_count === 1 ? "" : "s"}
                  {tech.last_reading_at &&
                    ` · last active ${new Date(tech.last_reading_at).toLocaleDateString()}`}
                </p>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-slate-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
