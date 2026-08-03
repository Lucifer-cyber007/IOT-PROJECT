"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { ChevronRightIcon, GridIcon } from "@/components/icons";
import { EmptyState, ErrorBanner, PageHeader, SkeletonGrid } from "@/components/ui";
import type { AssetClass, Machine } from "@/lib/types";

interface AssetClassCard {
  assetClass: AssetClass;
  machineCount: number;
}

export default function PortalDashboard() {
  const [cards, setCards] = useState<AssetClassCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getMyMachines(), api.getAssetClasses()])
      .then(([machines, assetClasses]: [Machine[], AssetClass[]]) => {
        const counts = new Map<string, number>();
        for (const machine of machines) {
          const id = machine.template.asset_class_id;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        // Only show asset classes this client actually has machines in - what
        // admin has opted them into, not the full catalog of 7.
        const opted = assetClasses
          .filter((assetClass) => counts.has(assetClass.id))
          .map((assetClass) => ({ assetClass, machineCount: counts.get(assetClass.id)! }));
        setCards(opted);
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load your dashboard.");
      });
  }, []);

  return (
    <div>
      <PageHeader
        title="Your Assets"
        subtitle="Asset classes your account has machines registered in."
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!cards && !error && <SkeletonGrid items={3} />}

      {cards && cards.length === 0 && (
        <EmptyState
          icon={<GridIcon className="h-6 w-6" />}
          title="No machines yet"
          message="No machines have been assigned to your account yet. Contact your account administrator to have your equipment registered."
        />
      )}

      {cards && cards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {cards.map(({ assetClass, machineCount }) => (
            <Link
              key={assetClass.id}
              href={`/portal/assets/${assetClass.id}`}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-xl">
                  {assetClass.icon}
                </div>
                <ChevronRightIcon className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-900">{assetClass.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {machineCount} machine{machineCount === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
