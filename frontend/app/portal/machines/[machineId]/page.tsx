"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import FieldEditor from "@/components/FieldEditor";
import { ClockIcon, EditIcon, ScanIcon } from "@/components/icons";
import { EmptyState, ErrorBanner, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import TrendChart from "@/components/TrendChart";
import UploadPanel, { type QueuedFile } from "@/components/UploadPanel";
import * as api from "@/lib/api";
import type { ConfidenceFlag, Machine, MachineTrend, Reading } from "@/lib/types";

type View = "history" | "scan" | "manual" | "review";

export default function MachineDetailPage() {
  const params = useParams<{ machineId: string }>();
  const machineId = Number(params.machineId);
  const router = useRouter();
  const { push } = useToast();

  const [machine, setMachine] = useState<Machine | null>(null);
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("history");

  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [scanning, setScanning] = useState(false);

  const [fields, setFields] = useState<Record<string, string | null>>({});
  const [flags, setFlags] = useState<Record<string, ConfidenceFlag> | null>(null);
  const [captureMethod, setCaptureMethod] = useState<"ocr" | "manual">("manual");
  const [rawText, setRawText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [trendField, setTrendField] = useState<string>("");
  const [trend, setTrend] = useState<MachineTrend | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    Promise.all([api.getMyMachines(), api.getMyReadings({ machineId })])
      .then(([machines, myReadings]) => {
        setMachine(machines.find((m) => m.id === machineId) ?? null);
        setReadings(myReadings);
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load this machine.");
      });
  }, [machineId]);

  useEffect(refresh, [refresh]);

  const numericFields = useMemo(
    () => machine?.template.fields.filter((f) => f.normalizer_type === "number") ?? [],
    [machine]
  );

  useEffect(() => {
    if (numericFields.length > 0 && !numericFields.some((f) => f.key === trendField)) {
      setTrendField(numericFields[0].key);
    }
  }, [numericFields, trendField]);

  useEffect(() => {
    if (!trendField) return;
    setTrendError(null);
    api
      .getMachineTrend(machineId, trendField)
      .then(setTrend)
      .catch((err) => setTrendError(err instanceof api.ApiError ? err.message : "Could not load trend."));
  }, [machineId, trendField]);

  const startManual = () => {
    if (!machine) return;
    const empty: Record<string, string | null> = {};
    for (const field of machine.template.fields) empty[field.key] = "";
    setFields(empty);
    setFlags(null);
    setRawText(null);
    setCaptureMethod("manual");
    setView("review");
  };

  const submitScan = async () => {
    if (!machine || queue.length === 0) return;
    setScanning(true);
    setError(null);
    try {
      const result = await api.scanOne(queue[0].file, { machineId });
      if (result.status === "matched") {
        setFields(result.fields);
        setFlags((result.confidence_flags as Record<string, ConfidenceFlag>) ?? null);
        setRawText(result.raw_text);
        setCaptureMethod("ocr");
        setQueue([]);
        setView("review");
      } else {
        setError("Could not match this scan to this machine. Try again or enter manually.");
      }
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.createReading({
        machineId,
        captureMethod,
        fields,
        confidenceFlags: flags,
        rawText,
      });
      push("Reading saved.");
      setView("history");
      refresh();
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : "Could not save this reading.";
      setError(message);
      push(message, "error");
    } finally {
      setSaving(false);
    }
  };

  if (!machine && !error) return <Spinner />;

  return (
    <div>
      <button
        type="button"
        onClick={() => (view === "history" ? router.back() : setView("history"))}
        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        ‹ Back
      </button>

      {error && (
        <div className="mt-4">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {machine && (
        <>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-lg text-indigo-600">
              ⚙️
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{machine.name}</h1>
              <p className="text-sm text-slate-500">
                {machine.template.name} · {machine.identifier_value}
              </p>
            </div>
          </div>

          {view === "history" && (
            <div className="mt-6">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setView("scan")}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700"
                >
                  <ScanIcon className="h-4 w-4" />
                  Scan
                </button>
                <button
                  type="button"
                  onClick={startManual}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <EditIcon className="h-4 w-4" />
                  Manual Entry
                </button>
              </div>

              <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">
                Reading History
              </h2>
              {readings && readings.length === 0 && (
                <EmptyState
                  icon={<ClockIcon className="h-6 w-6" />}
                  title="No readings yet"
                  message="Scan a document or add one manually to get started."
                />
              )}
              {readings && readings.length > 0 && (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {readings.map((reading) => (
                    <div key={reading.id} className="px-5 py-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          {new Date(reading.captured_at).toLocaleString()}
                        </p>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {reading.capture_method}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {machine.template.fields
                          .slice(0, 3)
                          .map((f) => `${f.label}: ${reading.fields[f.key] ?? "—"}`)
                          .join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {numericFields.length > 0 && (
                <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Trend</h2>
                    {numericFields.length > 1 && (
                      <select
                        value={trendField}
                        onChange={(e) => setTrendField(e.target.value)}
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
                  {trendError && <ErrorBanner>{trendError}</ErrorBanner>}
                  {trend && trend.points.length > 0 ? (
                    <TrendChart points={trend.points} height={220} />
                  ) : (
                    <p className="text-sm text-slate-400">Not enough readings yet to chart.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {view === "scan" && (
            <div className="mt-6 max-w-md">
              <UploadPanel
                queue={queue}
                onQueueChange={setQueue}
                onSubmit={submitScan}
                maxFiles={1}
                itemLabel="photo"
                submitLabel={scanning ? "Scanning…" : "Scan"}
              />
            </div>
          )}

          {view === "review" && (
            <div className="mt-6 max-w-md">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <FieldEditor
                  fields={machine.template.fields}
                  values={fields}
                  flags={flags}
                  onChange={(key, value) => setFields((prev) => ({ ...prev, [key]: value }))}
                />
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setView("history")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700 disabled:bg-slate-300 disabled:shadow-none"
                >
                  {saving ? "Saving…" : "Save Reading"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
