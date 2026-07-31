"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { Machine, Reading } from "@/lib/types";
import { useFieldValues } from "@/lib/use-field-values";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import FieldSchemaForm from "@/components/fields/FieldSchemaForm";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function MachineDetailPage() {
  const params = useParams<{ machineId: string }>();
  const machineId = Number(params.machineId);

  const [machine, setMachine] = useState<Machine | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddReading, setShowAddReading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [machines, machineReadings] = await Promise.all([
        api.getMyMachines(),
        api.getMyReadings(machineId),
      ]);
      setMachine(machines.find((m) => m.id === machineId) ?? null);
      setReadings(machineReadings);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not load this machine.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineId]);

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
  if (!machine) return <p className="text-sm text-slate-500">Machine not found.</p>;

  const canAddManually = machine.template.capture_methods.includes("manual");

  return (
    <div>
      <PageHeader
        title={machine.name}
        description={`${machine.template.name} · ${machine.identifier_value}`}
        action={
          canAddManually && (
            <Button onClick={() => setShowAddReading((v) => !v)}>+ Add Reading</Button>
          )
        }
      />

      {showAddReading && (
        <ManualEntryForm
          machine={machine}
          onDone={() => {
            setShowAddReading(false);
            void load();
          }}
          onCancel={() => setShowAddReading(false)}
        />
      )}

      <Card>
        {readings.length === 0 ? (
          <p className="text-sm text-slate-500">No readings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">Captured</th>
                  <th className="py-2 pr-4">Method</th>
                  {machine.template.fields.map((field) => (
                    <th key={field.key} className="py-2 pr-4">
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {readings.map((reading) => (
                  <tr key={reading.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-600">{formatDate(reading.captured_at)}</td>
                    <td className="py-2 pr-4 text-slate-600">
                      {reading.capture_method === "ocr" ? "Scanned" : "Manual"}
                    </td>
                    {machine.template.fields.map((field) => (
                      <td key={field.key} className="py-2 pr-4 text-slate-900">
                        {reading.fields[field.key] ?? "—"}
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

function ManualEntryForm({
  machine,
  onDone,
  onCancel,
}: {
  machine: Machine;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { values, setValue, toPayload } = useFieldValues(machine.template.fields);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.createReading({
        machineId: machine.id,
        captureMethod: "manual",
        fields: toPayload(),
      });
      onDone();
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not save this reading.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-6">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Add Reading</h2>
      <FieldSchemaForm fields={machine.template.fields} values={values} onChange={setValue} />
      {error && (
        <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      <div className="mt-5 flex gap-2">
        <Button onClick={handleSave} disabled={submitting}>
          {submitting ? "Saving…" : "Save Reading"}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
