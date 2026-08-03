"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import FieldEditor from "@/components/FieldEditor";
import { Badge, ErrorBanner, Spinner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import UploadPanel, { type QueuedFile } from "@/components/UploadPanel";
import * as api from "@/lib/api";
import type { ConfidenceFlag, Machine } from "@/lib/types";

interface ReviewItem {
  index: number;
  filename: string;
  file: File;
  status: "matched" | "ambiguous" | "no_match" | "error";
  machine?: Machine;
  fields?: Record<string, string | null>;
  flags?: Record<string, ConfidenceFlag> | null;
  rawText?: string;
  candidates?: Machine[];
  error?: string;
  resolving?: boolean;
  saving?: boolean;
  saved?: boolean;
}

export default function BatchScanPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <BatchScanPageInner />
    </Suspense>
  );
}

function BatchScanPageInner() {
  const router = useRouter();
  const { push: pushToast } = useToast();
  const searchParams = useSearchParams();
  const assetClassId = searchParams.get("assetClassId") ?? undefined;

  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [stage, setStage] = useState<"pick" | "processing" | "review">("pick");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setStage("processing");
    setError(null);
    try {
      const result = await api.scanBatch(
        queue.map((q) => q.file),
        { assetClassId }
      );
      setItems(
        result.results.map((r) => ({
          index: r.index,
          filename: r.filename,
          file: queue[r.index].file,
          status: r.status === "error" ? "error" : r.status,
          machine: r.machine,
          fields: r.fields,
          flags: (r.confidence_flags as Record<string, ConfidenceFlag>) ?? null,
          rawText: r.raw_text,
          candidates: r.candidates,
          error: r.error,
        }))
      );
      setStage("review");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Batch scan failed.");
      setStage("pick");
    }
  };

  const updateItem = (index: number, patch: Partial<ReviewItem>) => {
    setItems((prev) => prev.map((item) => (item.index === index ? { ...item, ...patch } : item)));
  };

  const resolve = async (item: ReviewItem, candidate: Machine) => {
    updateItem(item.index, { resolving: true });
    try {
      const result = await api.scanOne(item.file, { machineId: candidate.id });
      if (result.status === "matched") {
        updateItem(item.index, {
          status: "matched",
          machine: result.machine,
          fields: result.fields,
          flags: (result.confidence_flags as Record<string, ConfidenceFlag>) ?? null,
          rawText: result.raw_text,
          resolving: false,
        });
      } else {
        updateItem(item.index, { resolving: false, error: "Still could not match." });
      }
    } catch (err) {
      updateItem(item.index, {
        resolving: false,
        error: err instanceof api.ApiError ? err.message : "Could not resolve this file.",
      });
    }
  };

  const saveItem = async (item: ReviewItem, silent = false): Promise<boolean> => {
    if (!item.machine || !item.fields) return false;
    updateItem(item.index, { saving: true });
    try {
      await api.createReading({
        machineId: item.machine.id,
        captureMethod: "ocr",
        fields: item.fields,
        confidenceFlags: item.flags,
        rawText: item.rawText,
      });
      updateItem(item.index, { saving: false, saved: true });
      if (!silent) pushToast("Reading saved.");
      return true;
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : "Could not save this reading.";
      updateItem(item.index, { saving: false, error: message });
      if (!silent) pushToast(message, "error");
      return false;
    }
  };

  const saveAllMatched = async () => {
    const targets = items.filter((item) => item.status === "matched" && !item.saved);
    let succeeded = 0;
    for (const item of targets) {
      // eslint-disable-next-line no-await-in-loop -- sequential saves keep server load predictable
      if (await saveItem(item, true)) succeeded += 1;
    }
    pushToast(`${succeeded}/${targets.length} readings saved.`, succeeded === targets.length ? "success" : "error");
  };

  const matchedCount = items.filter((i) => i.status === "matched").length;
  const savedCount = items.filter((i) => i.saved).length;

  return (
    <div className="max-w-2xl">
      <Link
        href={assetClassId ? `/portal/assets/${assetClassId}` : "/portal"}
        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        ‹ Back
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold tracking-tight text-slate-900">Batch Scan</h1>
      <p className="mb-6 text-sm text-slate-500">Scan up to {api.MAX_BATCH_FILES} documents at once.</p>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {stage === "pick" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <UploadPanel
            queue={queue}
            onQueueChange={setQueue}
            onSubmit={submit}
            maxFiles={api.MAX_BATCH_FILES}
            itemLabel="file"
            submitLabel={queue.length > 1 ? `Scan ${queue.length} Files` : "Scan"}
          />
        </div>
      )}

      {stage === "processing" && <Spinner />}

      {stage === "review" && (
        <div className="space-y-4">
          {matchedCount > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-3.5">
              <p className="text-sm font-medium text-indigo-900">
                {savedCount}/{matchedCount} matched readings saved
              </p>
              <button
                type="button"
                onClick={saveAllMatched}
                className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                Save All Matched
              </button>
            </div>
          )}

          {items.map((item) => (
            <div key={item.index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="truncate text-sm font-semibold text-slate-900">{item.filename}</p>
                <StatusBadge item={item} />
              </div>

              {item.error && <p className="mt-2 text-xs text-rose-600">{item.error}</p>}

              {item.status === "matched" && item.machine && item.fields && (
                <div className="mt-4">
                  <p className="mb-3 text-xs text-slate-500">
                    Matched to <span className="font-semibold text-slate-800">{item.machine.name}</span>
                  </p>
                  <FieldEditor
                    fields={item.machine.template.fields}
                    values={item.fields}
                    flags={item.flags}
                    onChange={(key, value) =>
                      updateItem(item.index, { fields: { ...item.fields, [key]: value } })
                    }
                  />
                  <button
                    type="button"
                    disabled={item.saving || item.saved}
                    onClick={() => saveItem(item)}
                    className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700 disabled:bg-slate-300 disabled:shadow-none"
                  >
                    {item.saved ? "Saved" : item.saving ? "Saving…" : "Save Reading"}
                  </button>
                </div>
              )}

              {(item.status === "ambiguous" || item.status === "no_match") &&
                !item.error &&
                (item.candidates?.length ? (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs text-slate-500">
                      {item.status === "ambiguous"
                        ? "Multiple machines matched - pick the right one:"
                        : "No machine matched automatically - pick one:"}
                    </p>
                    {item.candidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        disabled={item.resolving}
                        onClick={() => resolve(item, candidate)}
                        className="block w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      >
                        {candidate.name}{" "}
                        <span className="text-xs text-slate-400">({candidate.identifier_value})</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No candidate machines found.</p>
                ))}
            </div>
          ))}

          <button
            type="button"
            onClick={() => router.push(assetClassId ? `/portal/assets/${assetClassId}` : "/portal")}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ item }: { item: ReviewItem }) {
  const tone: Record<ReviewItem["status"], "emerald" | "amber" | "rose"> = {
    matched: "emerald",
    ambiguous: "amber",
    no_match: "amber",
    error: "rose",
  };
  const label: Record<ReviewItem["status"], string> = {
    matched: item.saved ? "Saved" : "Matched",
    ambiguous: "Needs a machine",
    no_match: "Needs a machine",
    error: "Failed",
  };
  return <Badge tone={tone[item.status]}>{label[item.status]}</Badge>;
}
