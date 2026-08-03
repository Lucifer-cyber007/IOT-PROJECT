"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { Badge, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { ClockIcon } from "@/components/icons";
import type { Machine, Reading, Technician } from "@/lib/types";

export default function TechnicianDetailPage() {
  const params = useParams<{ id: string }>();
  const technicianId = Number(params.id);
  const { push } = useToast();

  const [technician, setTechnician] = useState<Technician | null>(null);
  const [allMachines, setAllMachines] = useState<Machine[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    Promise.all([api.getTechnicians(), api.getMyMachines(), api.getMyReadings({ technicianId })])
      .then(([techs, machines, techReadings]) => {
        const found = techs.find((t) => t.id === technicianId) ?? null;
        setTechnician(found);
        setSelectedIds(found ? found.machines.map((m) => m.id) : []);
        setAllMachines(machines);
        setReadings(techReadings);
      })
      .catch((err) => setError(err instanceof api.ApiError ? err.message : "Could not load this technician."));
  }, [technicianId]);

  useEffect(refresh, [refresh]);

  const toggleMachine = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const saveMachines = async () => {
    setSaving(true);
    try {
      await api.updateTechnicianMachines(technicianId, selectedIds);
      push("Assigned machines updated.");
      refresh();
    } catch (err) {
      push(err instanceof api.ApiError ? err.message : "Could not update machines.", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!technician) return;
    setTogglingStatus(true);
    const next = technician.status === "active" ? "suspended" : "active";
    try {
      await api.updateTechnicianStatus(technicianId, next);
      push(next === "suspended" ? "Technician suspended." : "Technician reactivated.");
      refresh();
    } catch (err) {
      push(err instanceof api.ApiError ? err.message : "Could not update status.", "error");
    } finally {
      setTogglingStatus(false);
    }
  };

  if (!technician && !error) return <Spinner />;

  return (
    <div>
      <Link href="/portal/technicians" className="text-sm font-medium text-slate-500 hover:text-slate-900">
        ‹ Back to Technicians
      </Link>

      {error && (
        <div className="mt-4">
          <ErrorBanner>{error}</ErrorBanner>
        </div>
      )}

      {technician && (
        <>
          <div className="mt-2 flex items-center gap-3">
            <PageHeader title={technician.email} />
            <Badge tone={technician.status === "active" ? "emerald" : "rose"}>
              {technician.status}
            </Badge>
          </div>

          <button
            type="button"
            onClick={toggleStatus}
            disabled={togglingStatus}
            className={`mb-6 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              technician.status === "active"
                ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {togglingStatus
              ? "Updating…"
              : technician.status === "active"
                ? "Suspend Technician"
                : "Reactivate Technician"}
          </button>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Assigned Machines
            </h2>
            {allMachines.length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No machines in your organization yet.</p>
            ) : (
              <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto">
                {allMachines.map((machine) => (
                  <label
                    key={machine.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(machine.id)}
                      onChange={() => toggleMachine(machine.id)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-slate-800">{machine.name}</span>
                    <span className="text-xs text-slate-400">{machine.template.name}</span>
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={saveMachines}
              disabled={saving}
              className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-700 disabled:bg-slate-300 disabled:shadow-none"
            >
              {saving ? "Saving…" : "Save Machine Access"}
            </button>
          </div>

          <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">
            Activity
          </h2>
          {readings.length === 0 ? (
            <EmptyState
              icon={<ClockIcon className="h-6 w-6" />}
              title="No readings yet"
              message="Readings this technician logs will show up here."
            />
          ) : (
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
              {readings.map((reading) => {
                const machine = technician.machines.find((m) => m.id === reading.machine_id);
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
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
