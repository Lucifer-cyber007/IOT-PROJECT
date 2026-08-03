"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { ChevronRightIcon, GridIcon, UploadCloudIcon } from "@/components/icons";
import { EmptyState, ErrorBanner, PageHeader, SkeletonList } from "@/components/ui";
import type { AssetClass, Machine } from "@/lib/types";

export default function AssetClassPage() {
  const params = useParams<{ assetClassId: string }>();
  const assetClassId = params.assetClassId;

  const [assetClass, setAssetClass] = useState<AssetClass | null>(null);
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getAssetClasses(), api.getMyMachines()])
      .then(([assetClasses, myMachines]) => {
        setAssetClass(assetClasses.find((item) => item.id === assetClassId) ?? null);
        setMachines(myMachines.filter((m) => m.template.asset_class_id === assetClassId));
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load machines.");
      });
  }, [assetClassId]);

  return (
    <div>
      <Link href="/portal" className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900">
        ‹ Back
      </Link>

      <PageHeader
        title={assetClass ? `${assetClass.icon} ${assetClass.label}` : "…"}
        action={
          machines && machines.length > 0 ? (
            <Link
              href={`/portal/scan/batch?assetClassId=${encodeURIComponent(assetClassId)}`}
              className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100"
            >
              <UploadCloudIcon className="h-4 w-4" />
              Batch Scan
            </Link>
          ) : undefined
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!machines && !error && <SkeletonList rows={3} />}

      {machines && machines.length === 0 && (
        <EmptyState
          icon={<GridIcon className="h-6 w-6" />}
          title="No machines here yet"
          message="Your account administrator hasn't assigned any machines in this asset class."
        />
      )}

      {machines && machines.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {machines.map((machine) => (
            <Link
              key={machine.id}
              href={`/portal/machines/${machine.id}`}
              className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-slate-50"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{machine.name}</p>
                <p className="text-xs text-slate-500">{machine.template.name}</p>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-slate-300" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
