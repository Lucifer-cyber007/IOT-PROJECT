"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FIELD_META,
  type BillFieldKey,
  type ExtractionResult,
} from "@/lib/types";

type FieldValues = Record<BillFieldKey, string>;

function toFieldValues(result: ExtractionResult): FieldValues {
  return FIELD_META.reduce((accumulator, field) => {
    accumulator[field.key] = result[field.key] ?? "";
    return accumulator;
  }, {} as FieldValues);
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

interface ResultsViewProps {
  result: ExtractionResult;
  /** Raw OCR text, shown when the backend could not structure the fields. */
  rawText?: string;
  /** Explanatory banner shown above the fields (e.g. the manual-entry fallback). */
  notice?: string;
  onStartOver: () => void;
}

export default function ResultsView({
  result,
  rawText,
  notice,
  onStartOver,
}: ResultsViewProps) {
  const [values, setValues] = useState<FieldValues>(() => toFieldValues(result));
  const [copied, setCopied] = useState(false);
  const [showRawText, setShowRawText] = useState(false);

  useEffect(() => {
    setValues(toFieldValues(result));
  }, [result]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const flags = result.confidence_flags ?? {};

  /** Current (possibly user-edited) values in the API's schema shape. */
  const payload = useMemo(() => {
    const fields = FIELD_META.reduce<Record<string, string | null>>((accumulator, field) => {
      const value = values[field.key].trim();
      accumulator[field.key] = value === "" ? null : value;
      return accumulator;
    }, {});
    return { ...fields, confidence_flags: flags };
  }, [values, flags]);

  const handleCopy = async () => {
    const json = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      // Clipboard API is unavailable (older browser or insecure context).
      const textarea = document.createElement("textarea");
      textarea.value = json;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
    }
  };

  const handleDownloadCsv = () => {
    const header = FIELD_META.map((field) => escapeCsv(field.label)).join(",");
    const row = FIELD_META.map((field) => escapeCsv(values[field.key].trim())).join(",");
    const blob = new Blob([`${header}\n${row}\n`], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const slug = (values.rr_number || values.account_number || "bill")
      .replace(/[^a-zA-Z0-9-_]/g, "")
      .slice(0, 32);
    anchor.href = url;
    anchor.download = `electricity-bill-${slug || "extract"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const flaggedCount = Object.keys(flags).length;

  return (
    <div className="space-y-4">
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Extracted details</h2>
          {flaggedCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              {flaggedCount} field{flaggedCount === 1 ? "" : "s"} to verify
            </span>
          )}
        </div>
        <p className="mb-5 text-sm text-slate-500">
          Everything below is editable — correct anything the scan got wrong before saving.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELD_META.map((field) => {
            const flag = flags[field.key];
            const inputId = `field-${field.key}`;

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
                    value={values[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
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
                    value={values[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        [field.key]: event.target.value,
                      }))
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
      </div>

      {rawText && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <button
            type="button"
            onClick={() => setShowRawText((previous) => !previous)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-slate-900">
              Raw text read from the bill
            </span>
            <span className="text-xs font-medium text-slate-500">
              {showRawText ? "Hide" : "Show"}
            </span>
          </button>
          {showRawText && (
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
              {rawText}
            </pre>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          {copied ? "Copied!" : "Copy as JSON"}
        </button>
        <button
          type="button"
          onClick={handleDownloadCsv}
          className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Download as CSV
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
