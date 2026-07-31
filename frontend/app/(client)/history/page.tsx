"use client";

import { useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import type { AssetClass, Machine, Reading } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Flat table of every reading across every machine - the desktop upgrade of
 * mobile's HistoryScreen, which truncates to the first 3 template fields per
 * card for compactness. A real table has no need for that truncation. */
export default function HistoryPage() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [classFilter, setClassFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [myReadings, myMachines, classes] = await Promise.all([
          api.getMyReadings(),
          api.getMyMachines(),
          api.getAssetClasses(),
        ]);
        if (cancelled) return;
        setReadings(myReadings);
        setMachines(myMachines);
        setAssetClasses(classes);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof api.ApiError ? err.message : "Could not load history.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);

  const rows = useMemo(() => {
    return readings
      .map((reading) => ({ reading, machine: machineById.get(reading.machine_id) }))
      .filter(
        (row) => !classFilter || row.machine?.template.asset_class_id === classFilter
      )
      .sort(
        (a, b) => new Date(b.reading.captured_at).getTime() - new Date(a.reading.captured_at).getTime()
      );
  }, [readings, machineById, classFilter]);

  // Column union across all visible rows' templates - readings can come from
  // different templates, so no single fixed column list applies.
  const fieldColumns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      for (const field of row.machine?.template.fields ?? []) {
        if (!seen.has(field.key)) seen.set(field.key, field.label);
      }
    }
    return Array.from(seen, ([key, label]) => ({ key, label }));
  }, [rows]);

  const handleExport = () => {
    const columns = [
      { key: "captured_at", label: "Captured" },
      { key: "machine_name", label: "Machine" },
      { key: "capture_method", label: "Method" },
      ...fieldColumns,
    ];
    const csvRows = rows.map(({ reading, machine }) => ({
      captured_at: formatDate(reading.captured_at),
      machine_name: machine?.name ?? "",
      capture_method: reading.capture_method === "ocr" ? "Scanned" : "Manual",
      ...reading.fields,
    }));
    downloadCsv(columns, csvRows, "readings-history");
  };

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;

  return (
    <div>
      <PageHeader
        title="History"
        description={`${rows.length} reading${rows.length === 1 ? "" : "s"}`}
        action={
          <div className="flex gap-2">
            <select
              value={classFilter}
              onChange={(event) => setClassFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">All asset classes</option>
              {assetClasses.map((assetClass) => (
                <option key={assetClass.id} value={assetClass.id}>
                  {assetClass.icon} {assetClass.label}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={handleExport} disabled={rows.length === 0}>
              Export CSV
            </Button>
          </div>
        }
      />

      <Card>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No readings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Captured</th>
                  <th className="py-2 pr-4">Machine</th>
                  <th className="py-2 pr-4">Method</th>
                  {fieldColumns.map((column) => (
                    <th key={column.key} className="py-2 pr-4">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ reading, machine }) => (
                  <tr key={reading.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-600">{formatDate(reading.captured_at)}</td>
                    <td className="py-2 pr-4 text-slate-900">{machine?.name ?? "—"}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {reading.capture_method === "ocr" ? "Scanned" : "Manual"}
                    </td>
                    {fieldColumns.map((column) => (
                      <td key={column.key} className="py-2 pr-4 text-slate-900">
                        {reading.fields[column.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
