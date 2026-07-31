"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import * as api from "@/lib/api";
import { MAX_BATCH_FILES } from "@/lib/api";
import type { ConfidenceFlag, Machine } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import FieldSchemaForm from "@/components/fields/FieldSchemaForm";
import CandidatePicker from "@/components/scan/CandidatePicker";
import UploadDropzone from "@/components/scan/UploadDropzone";

type ItemStatus = "matched" | "ambiguous" | "no_match" | "error" | "saved";

interface BatchItemState {
  id: string;
  file: File;
  status: ItemStatus;
  machine?: Machine;
  values: Record<string, string>;
  confidenceFlags?: Record<string, ConfidenceFlag>;
  candidates?: Machine[];
  rawText?: string;
  error?: string;
  saving?: boolean;
}

function toValues(fields: { key: string }[], data?: Record<string, string | null>) {
  return fields.reduce<Record<string, string>>((accumulator, field) => {
    accumulator[field.key] = data?.[field.key] ?? "";
    return accumulator;
  }, {});
}

type Stage = "pick" | "processing" | "review";

export default function BatchScanPage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("pick");
  const [items, setItems] = useState<BatchItemState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  const runBatch = async (files: File[]) => {
    setStage("processing");
    setError(null);
    try {
      const response = await api.scanBatch(files, { assetClassId: classId });
      const next: BatchItemState[] = response.results.map((result, index) => ({
        id: `${index}-${files[index].name}`,
        file: files[index],
        status: result.status,
        machine: result.machine,
        values: toValues(result.machine?.template.fields ?? [], result.fields),
        confidenceFlags: result.confidence_flags,
        candidates: result.candidates,
        rawText: result.raw_text,
        error: result.error,
      }));
      setItems(next);
      setStage("review");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not scan these documents.");
      setStage("pick");
    }
  };

  const updateItem = (id: string, patch: Partial<BatchItemState>) => {
    setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const resolveCandidate = async (item: BatchItemState, machineId: number) => {
    try {
      const result = await api.scanOne(item.file, { machineId });
      if (result.status === "matched") {
        updateItem(item.id, {
          status: "matched",
          machine: result.machine,
          values: toValues(result.machine.template.fields, result.fields),
          confidenceFlags: result.confidence_flags,
          rawText: result.raw_text,
        });
      } else {
        updateItem(item.id, { status: "error", error: "Still could not resolve this document." });
      }
    } catch (err) {
      updateItem(item.id, {
        status: "error",
        error: err instanceof api.ApiError ? err.message : "Could not resolve this document.",
      });
    }
  };

  const saveItem = async (item: BatchItemState) => {
    if (!item.machine) return;
    updateItem(item.id, { saving: true });
    try {
      const payload = item.machine.template.fields.reduce<Record<string, string | null>>(
        (accumulator, field) => {
          const trimmed = (item.values[field.key] ?? "").trim();
          accumulator[field.key] = trimmed === "" ? null : trimmed;
          return accumulator;
        },
        {}
      );
      await api.createReading({
        machineId: item.machine.id,
        captureMethod: "ocr",
        fields: payload,
        confidenceFlags: item.confidenceFlags,
        rawText: item.rawText,
      });
      updateItem(item.id, { status: "saved", saving: false });
    } catch (err) {
      updateItem(item.id, {
        saving: false,
        error: err instanceof api.ApiError ? err.message : "Could not save this reading.",
      });
    }
  };

  const saveAllMatched = async () => {
    setSavingAll(true);
    // Sequential, not parallel - matches the mobile app's deliberate choice to
    // avoid hammering the backend with a burst of concurrent save requests.
    for (const item of items) {
      if (item.status === "matched") {
        // eslint-disable-next-line no-await-in-loop
        await saveItem(item);
      }
    }
    setSavingAll(false);
  };

  const matchedCount = items.filter((i) => i.status === "matched").length;
  const savedCount = items.filter((i) => i.status === "saved").length;
  const unresolvedCount = items.filter((i) => i.status === "ambiguous" || i.status === "no_match").length;
  const failedCount = items.filter((i) => i.status === "error").length;

  return (
    <div>
      <PageHeader
        title="Batch Scan"
        description={`Scan up to ${MAX_BATCH_FILES} documents at once.`}
      />

      {stage === "pick" && (
        <Card className="max-w-md">
          <UploadDropzone multiple maxFiles={MAX_BATCH_FILES} onFiles={(files) => void runBatch(files)} />
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </Card>
      )}

      {stage === "processing" && (
        <Card className="flex flex-col items-center py-16">
          <svg className="h-8 w-8 animate-spin text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-4 text-sm font-medium text-slate-900">Scanning {items.length || ""} documents…</p>
        </Card>
      )}

      {stage === "review" && (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge tone="emerald">{savedCount} saved</Badge>
                <Badge tone="slate">{matchedCount} matched</Badge>
                <Badge tone="amber">{unresolvedCount} need a machine</Badge>
                {failedCount > 0 && <Badge tone="rose">{failedCount} failed</Badge>}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => router.push(`/asset-classes/${classId}`)}>
                  Done
                </Button>
                <Button onClick={saveAllMatched} disabled={savingAll || matchedCount === 0}>
                  {savingAll ? "Saving…" : `Save All Matched (${matchedCount})`}
                </Button>
              </div>
            </div>
          </Card>

          {items.map((item) => (
            <Card key={item.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{item.file.name}</h3>
                {item.status === "saved" && <Badge tone="emerald">Saved</Badge>}
                {item.status === "matched" && <Badge tone="slate">Matched</Badge>}
                {(item.status === "ambiguous" || item.status === "no_match") && (
                  <Badge tone="amber">Needs a machine</Badge>
                )}
                {item.status === "error" && <Badge tone="rose">Failed</Badge>}
              </div>

              {(item.status === "matched" || item.status === "saved") && item.machine && (
                <>
                  <p className="mb-3 text-xs text-slate-500">
                    {item.machine.name} &middot; {item.machine.template.name}
                  </p>
                  <FieldSchemaForm
                    fields={item.machine.template.fields}
                    values={item.values}
                    confidenceFlags={item.confidenceFlags}
                    readOnly={item.status === "saved"}
                    onChange={(key, value) =>
                      updateItem(item.id, { values: { ...item.values, [key]: value } })
                    }
                  />
                  {item.status === "matched" && (
                    <Button className="mt-4" onClick={() => void saveItem(item)} disabled={item.saving}>
                      {item.saving ? "Saving…" : "Save"}
                    </Button>
                  )}
                </>
              )}

              {(item.status === "ambiguous" || item.status === "no_match") && (
                <CandidatePicker
                  candidates={item.candidates ?? []}
                  noMatch={item.status === "no_match"}
                  onPick={(machineId) => void resolveCandidate(item, machineId)}
                  onStartOver={() => updateItem(item.id, { status: "error", error: "Skipped." })}
                />
              )}

              {item.status === "error" && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {item.error}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
