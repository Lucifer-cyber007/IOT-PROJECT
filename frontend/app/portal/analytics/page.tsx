"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { PageHeader, Spinner, StatCard, ErrorBanner, EmptyState, Badge } from "@/components/ui";
import { AlertTriangleIcon, ClockIcon, GridIcon, UsersIcon } from "@/components/icons";
import TrendChart from "@/components/TrendChart";
import type { DashboardSummary, Machine, MachineTrend } from "@/lib/types";

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedMachineId, setSelectedMachineId] = useState<number | null>(null);
  const [selectedField, setSelectedField] = useState<string>("");
  const [trend, setTrend] = useState<MachineTrend | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    Promise.all([api.getDashboardSummary(), api.getMyMachines()])
      .then(([s, m]) => {
        setSummary(s);
        setMachines(m);
        if (!selectedMachineId && m.length > 0) setSelectedMachineId(m[0].id);
      })
      .catch((err) => setError(err instanceof api.ApiError ? err.message : "Could not load analytics."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on mount
  }, []);

  useEffect(refresh, [refresh]);

  const selectedMachine = machines.find((m) => m.id === selectedMachineId) ?? null;
  const numericFields = useMemo(
    () => selectedMachine?.template.fields.filter((f) => f.normalizer_type === "number") ?? [],
    [selectedMachine]
  );

  useEffect(() => {
    if (numericFields.length > 0 && !numericFields.some((f) => f.key === selectedField)) {
      setSelectedField(numericFields[0].key);
    }
    if (numericFields.length === 0) setSelectedField("");
  }, [numericFields, selectedField]);

  useEffect(() => {
    if (!selectedMachineId || !selectedField) {
      setTrend(null);
      return;
    }
    setTrendError(null);
    api
      .getMachineTrend(selectedMachineId, selectedField)
      .then(setTrend)
      .catch((err) => setTrendError(err instanceof api.ApiError ? err.message : "Could not load trend."));
  }, [selectedMachineId, selectedField]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportReadingsCsv({});
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not export readings.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Trends, activity and anomalies across your organization's machines."
        action={
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!summary && !error && <Spinner />}

      {summary && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            <StatCard label="Machines" value={summary.total_machines} icon={<GridIcon className="h-5 w-5" />} />
            <StatCard label="Technicians" value={summary.technician_count} icon={<UsersIcon className="h-5 w-5" />} />
            <StatCard label="Readings (7d)" value={summary.readings_this_week} icon={<ClockIcon className="h-5 w-5" />} />
            <StatCard label="Readings (30d)" value={summary.readings_this_month} icon={<ClockIcon className="h-5 w-5" />} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
                Overdue Machines
              </h2>
              {summary.overdue_machines.length === 0 ? (
                <p className="text-sm text-slate-400">Everything's been scanned recently.</p>
              ) : (
                <div className="space-y-2">
                  {summary.overdue_machines.map((m) => (
                    <div key={m.machine_id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                      <span className="text-sm text-amber-900">{m.name}</span>
                      <span className="text-xs text-amber-700">
                        {m.last_reading_at ? `Last: ${new Date(m.last_reading_at).toLocaleDateString()}` : "Never scanned"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                <AlertTriangleIcon className="h-4 w-4 text-rose-500" />
                Anomalies
              </h2>
              {summary.recent_anomalies.length === 0 ? (
                <p className="text-sm text-slate-400">No unusual jumps detected.</p>
              ) : (
                <div className="space-y-2">
                  {summary.recent_anomalies.map((a, i) => (
                    <div key={i} className="rounded-lg bg-rose-50 px-3 py-2">
                      <p className="text-sm text-rose-900">
                        {a.machine_name} · {a.field_label}
                      </p>
                      <p className="text-xs text-rose-700">
                        {a.previous_value} → {a.value} ({new Date(a.captured_at).toLocaleDateString()})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Trend</h2>
              <div className="flex gap-2">
                <select
                  value={selectedMachineId ?? ""}
                  onChange={(e) => setSelectedMachineId(Number(e.target.value) || null)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                >
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                {numericFields.length > 0 && (
                  <select
                    value={selectedField}
                    onChange={(e) => setSelectedField(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                  >
                    {numericFields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {trendError && <ErrorBanner>{trendError}</ErrorBanner>}

            {numericFields.length === 0 ? (
              <EmptyState
                icon={<GridIcon className="h-6 w-6" />}
                title="No numeric fields"
                message="This machine's template has no numeric field to chart."
              />
            ) : trend && trend.points.length === 0 ? (
              <EmptyState
                icon={<ClockIcon className="h-6 w-6" />}
                title="No readings yet"
                message="This chart will fill in once readings are logged for this field."
              />
            ) : trend ? (
              <>
                <TrendChart points={trend.points} />
                {trend.points.some((p) => p.is_anomaly) && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-600">
                    <Badge tone="rose">anomaly</Badge> points differ from the previous reading by more than the
                    configured threshold.
                  </p>
                )}
              </>
            ) : (
              <Spinner />
            )}
          </div>
        </>
      )}
    </div>
  );
}
