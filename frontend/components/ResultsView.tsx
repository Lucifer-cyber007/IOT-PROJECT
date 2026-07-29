"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadExcel } from "@/lib/api";
import {
  FIELD_META,
  type BillEntry,
  type BillFieldKey,
  type ConfidenceFlag,
} from "@/lib/types";

type FieldValues = Record<BillFieldKey, string>;
type AllValues = Record<string, FieldValues>;

function toFieldValues(entry: BillEntry): FieldValues {
  return FIELD_META.reduce((accumulator, field) => {
    accumulator[field.key] = entry.data[field.key] ?? "";
    return accumulator;
  }, {} as FieldValues);
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function timestampSlug(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;
}

interface ResultsViewProps {
  entries: BillEntry[];
  onStartOver: () => void;
}

export default function ResultsView({ entries, onStartOver }: ResultsViewProps) {
  const [values, setValues] = useState<AllValues>(() =>
    Object.fromEntries(entries.map((entry) => [entry.id, toFieldValues(entry)]))
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(entries.map((entry, index) => [entry.id, entries.length === 1 || index === 0]))
  );
  const [showRawFor, setShowRawFor] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setValues(Object.fromEntries(entries.map((entry) => [entry.id, toFieldValues(entry)])));
    setExpanded(
      Object.fromEntries(
        entries.map((entry, index) => [entry.id, entries.length === 1 || index === 0])
      )
    );
  }, [entries]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const isBatch = entries.length > 1;
  const failedCount = entries.filter((entry) => entry.status === "error").length;
  const totalFlagged = entries.reduce(
    (sum, entry) => sum + Object.keys(entry.data.confidence_flags ?? {}).length,
    0
  );

  /** Current on-screen values, in the shape the exporters expect. */
  const rows = useMemo(
    () =>
      entries.map((entry) => {
        const row: Record<string, string | null> = { source_file: entry.fileName };
        FIELD_META.forEach((field) => {
          const value = values[entry.id]?.[field.key]?.trim() ?? "";
          row[field.key] = value === "" ? null : value;
        });
        return row;
      }),
    [entries, values]
  );

  const setField = (entryId: string, key: BillFieldKey, next: string) =>
    setValues((previous) => ({
      ...previous,
      [entryId]: { ...previous[entryId], [key]: next },
    }));

  const handleCopy = async () => {
    const payload = isBatch
      ? rows
      : (() => {
          const { source_file: _ignored, ...fields } = rows[0] ?? {};
          return { ...fields, confidence_flags: entries[0]?.data.confidence_flags ?? {} };
        })();
    const json = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(json);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = json;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
  };

  const handleExcel = async () => {
    setBusy(true);
    setExportError(null);
    try {
      await downloadExcel(rows, `electricity-bills-${timestampSlug()}.xlsx`);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "The spreadsheet could not be created."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCsv = () => {
    const columns = [
      { key: "source_file", label: "Source File" },
      ...FIELD_META.map((field) => ({ key: field.key as string, label: field.label })),
    ];
    const header = columns.map((column) => escapeCsv(column.label)).join(",");
    const body = rows
      .map((row) => columns.map((column) => escapeCsv(row[column.key] ?? "")).join(","))
      .join("\n");

    const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `electricity-bills-${timestampSlug()}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">
            {isBatch ? `${entries.length} bills extracted` : "Extracted details"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {failedCount > 0 && (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">
                {failedCount} failed
              </span>
            )}
            {totalFlagged > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                {totalFlagged} to verify
              </span>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Everything below is editable — corrections are included in the export.
        </p>
      </div>

      {entries.map((entry, index) => {
        const flags = entry.data.confidence_flags ?? {};
        const isOpen = expanded[entry.id] ?? false;
        const entryFlagCount = Object.keys(flags).length;

        return (
          <div
            key={entry.id}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            {isBatch && (
              <button
                type="button"
                onClick={() =>
                  setExpanded((previous) => ({ ...previous, [entry.id]: !previous[entry.id] }))
                }
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                  {index + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {values[entry.id]?.name?.trim() || entry.fileName}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {entry.status === "error"
                      ? entry.error
                      : [
                          values[entry.id]?.rr_number,
                          values[entry.id]?.units_consumed
                            ? `${values[entry.id].units_consumed} units`
                            : "",
                          values[entry.id]?.amount_to_pay
                            ? `₹${values[entry.id].amount_to_pay}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || entry.fileName}
                  </span>
                </span>

                {entry.status === "error" && (
                  <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                    FAILED
                  </span>
                )}
                {entryFlagCount > 0 && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    {entryFlagCount} TO VERIFY
                  </span>
                )}

                <svg
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}

            {isOpen && (
              <div className={`px-5 pb-5 ${isBatch ? "border-t border-slate-100 pt-4" : "pt-5"}`}>
                {entry.status === "error" && (
                  <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {entry.error} You can still type the details in by hand.
                  </p>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {FIELD_META.map((field) => {
                    const flag: ConfidenceFlag | undefined = flags[field.key];
                    const inputId = `${entry.id}-${field.key}`;

                    return (
                      <div
                        key={field.key}
                        className={field.multiline ? "sm:col-span-2" : undefined}
                      >
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <label
                            htmlFor={inputId}
                            className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                          >
                            {field.label}
                          </label>
                          {flag && (
                            <span
                              title={
                                flag === "not_found"
                                  ? "This field was not found in the bill"
                                  : "The scan was unsure about this value"
                              }
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                            >
                              <svg
                                className="h-3 w-3"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                aria-hidden="true"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              Please verify
                            </span>
                          )}
                        </div>

                        {field.multiline ? (
                          <textarea
                            id={inputId}
                            rows={2}
                            value={values[entry.id]?.[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(event) =>
                              setField(entry.id, field.key, event.target.value)
                            }
                            className={`w-full resize-y rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
                              flag
                                ? "border-amber-300 bg-amber-50/40 focus:border-amber-400"
                                : "border-slate-300 focus:border-slate-500"
                            }`}
                          />
                        ) : (
                          <input
                            id={inputId}
                            type="text"
                            inputMode={field.inputMode}
                            value={values[entry.id]?.[field.key] ?? ""}
                            placeholder={field.placeholder}
                            onChange={(event) =>
                              setField(entry.id, field.key, event.target.value)
                            }
                            className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
                              flag
                                ? "border-amber-300 bg-amber-50/40 focus:border-amber-400"
                                : "border-slate-300 focus:border-slate-500"
                            }`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {entry.rawText && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        setShowRawFor((previous) => ({
                          ...previous,
                          [entry.id]: !previous[entry.id],
                        }))
                      }
                      className="flex w-full items-center justify-between text-left"
                    >
                      <span className="text-xs font-semibold text-slate-700">
                        Raw text read from this bill
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {showRawFor[entry.id] ? "Hide" : "Show"}
                      </span>
                    </button>
                    {showRawFor[entry.id] && (
                      <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                        {entry.rawText}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {exportError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {exportError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={handleExcel}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3.5 4.5L9 10l-1.5 2.5h1.6L10 11l.9 1.5h1.6L11 10l1.5-2.5h-1.6L10 9l-.9-1.5H7.5z" />
          </svg>
          {busy ? "Building…" : isBatch ? `Excel (${entries.length})` : "Download Excel"}
        </button>
        <button
          type="button"
          onClick={handleCsv}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          {copied ? "Copied!" : "Copy as JSON"}
        </button>
        <button
          type="button"
          onClick={onStartOver}
          className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
