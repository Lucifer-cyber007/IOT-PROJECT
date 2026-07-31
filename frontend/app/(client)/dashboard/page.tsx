"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { AssetClass, Machine, Reading } from "@/lib/types";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

/** Asset-class grid with live counts, adapted from the mobile app's
 * HomeScreen overview - minus its silent useRegion() background geolocation
 * side effect, which had no UI purpose and is deliberately not carried over. */
export default function DashboardPage() {
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [classes, myMachines, myReadings] = await Promise.all([
          api.getAssetClasses(),
          api.getMyMachines(),
          api.getMyReadings(),
        ]);
        if (cancelled) return;
        setAssetClasses(classes);
        setMachines(myMachines);
        setReadings(myReadings);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof api.ApiError ? err.message : "Could not load your dashboard.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (error) {
    return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Your equipment, organized by asset class." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {assetClasses.map((assetClass) => {
          const classMachines = machines.filter(
            (machine) => machine.template.asset_class_id === assetClass.id
          );
          const machineIds = new Set(classMachines.map((machine) => machine.id));
          const classReadingCount = readings.filter((reading) =>
            machineIds.has(reading.machine_id)
          ).length;

          return (
            <Link key={assetClass.id} href={`/asset-classes/${assetClass.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <span className="text-2xl">{assetClass.icon}</span>
                <h2 className="mt-2 text-sm font-semibold text-slate-900">{assetClass.label}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {classMachines.length} asset{classMachines.length === 1 ? "" : "s"} &middot;{" "}
                  {classReadingCount} reading{classReadingCount === 1 ? "" : "s"}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
