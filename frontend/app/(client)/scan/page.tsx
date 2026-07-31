"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { AssetClass, ConfidenceFlag, Machine, ScanResult } from "@/lib/types";
import { useFieldValues } from "@/lib/use-field-values";
import { downloadCsv } from "@/lib/csv";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import FieldSchemaForm from "@/components/fields/FieldSchemaForm";
import CandidatePicker from "@/components/scan/CandidatePicker";
import UploadDropzone from "@/components/scan/UploadDropzone";

type Stage = "pick-class" | "upload" | "processing" | "resolve" | "results" | "error";

/**
 * Generic single-scan flow, selectable across any asset class - unlike the
 * mobile app, which hardcodes this flow to Energy Meters only (a real
 * inconsistency there; fixed here rather than replicated, per the plan).
 */
export default function ScanPage() {
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [assetClassId, setAssetClassId] = useState<string>("");
  const [stage, setStage] = useState<Stage>("pick-class");
  const [file, setFile] = useState<File | null>(null);
  const [candidates, setCandidates] = useState<Machine[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  const [matched, setMatched] = useState<{
    machine: Machine;
    fields: Record<string, string | null>;
    confidenceFlags: Record<string, ConfidenceFlag>;
    rawText: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showRawText, setShowRawText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getAssetClasses()
      .then(setAssetClasses)
      .catch(() => setAssetClasses([]));
  }, []);

  const { values, setValue, toPayload, reset } = useFieldValues(
    matched?.machine.template.fields ?? [],
    matched?.fields
  );

  const runScan = async (submittedFile: File, machineId?: number) => {
    setFile(submittedFile);
    setStage("processing");
    setErrorMessage("");
    try {
      const result: ScanResult = await api.scanOne(submittedFile, {
        assetClassId,
        machineId,
      });
      if (result.status === "matched") {
        setMatched({
          machine: result.machine,
          fields: result.fields,
          confidenceFlags: result.confidence_flags,
          rawText: result.raw_text,
        });
        reset(result.fields);
        setSaved(false);
        setStage("results");
      } else {
        setCandidates(result.candidates);
        setNoMatch(result.status === "no_match");
        setStage("resolve");
      }
    } catch (err) {
      setErrorMessage(err instanceof api.ApiError ? err.message : "Could not scan this document.");
      setStage("error");
    }
  };

  const handleSave = async () => {
    if (!matched) return;
    setSaving(true);
    try {
      await api.createReading({
        machineId: matched.machine.id,
        captureMethod: "ocr",
        fields: toPayload(),
        confidenceFlags: matched.confidenceFlags,
        rawText: matched.rawText,
      });
      setSaved(true);
    } catch (err) {
      setErrorMessage(err instanceof api.ApiError ? err.message : "Could not save this reading.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(toPayload(), null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCsv = () => {
    if (!matched) return;
    const columns = matched.machine.template.fields.map((f) => ({ key: f.key, label: f.label }));
    downloadCsv(columns, [toPayload()], `reading-${matched.machine.name}`);
  };

  const startOver = () => {
    setFile(null);
    setMatched(null);
    setCandidates([]);
    setStage("pick-class");
    setAssetClassId("");
    setSaved(false);
    setErrorMessage("");
  };

  return (
    <div>
      <PageHeader title="Scan" description="Upload a document to auto-detect the machine it belongs to." />

      {stage === "pick-class" && (
        <Card className="max-w-md">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Asset class
          </label>
          <select
            value={assetClassId}
            onChange={(event) => setAssetClassId(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="">All asset classes</option>
            {assetClasses.map((assetClass) => (
              <option key={assetClass.id} value={assetClass.id}>
                {assetClass.icon} {assetClass.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-slate-500">
            Optional - narrows auto-detection to machines in that class only.
          </p>
          <Button className="mt-4" onClick={() => setStage("upload")}>
            Continue
          </Button>
        </Card>
      )}

      {stage === "upload" && (
        <Card className="max-w-md">
          <UploadDropzone onFiles={(files) => void runScan(files[0])} />
          <Button variant="secondary" className="mt-3" onClick={() => setStage("pick-class")}>
            Back
          </Button>
        </Card>
      )}

      {stage === "processing" && (
        <Card className="flex flex-col items-center py-16">
          <svg className="h-8 w-8 animate-spin text-slate-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-4 text-sm font-medium text-slate-900">Reading your document…</p>
        </Card>
      )}

      {stage === "resolve" && (
        <Card className="max-w-lg">
          <CandidatePicker
            candidates={candidates}
            noMatch={noMatch}
            onPick={(machineId) => file && void runScan(file, machineId)}
            onStartOver={startOver}
          />
        </Card>
      )}

      {stage === "error" && (
        <Card className="max-w-md">
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => file && void runScan(file)}>Try Again</Button>
            <Button variant="secondary" onClick={startOver}>
              Start Over
            </Button>
          </div>
        </Card>
      )}

      {stage === "results" && matched && (
        <div className="max-w-2xl space-y-4">
          <Card>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {matched.machine.name}
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {matched.machine.template.name}
                </span>
              </h2>
              {Object.keys(matched.confidenceFlags).length > 0 && (
                <Badge tone="amber">
                  {Object.keys(matched.confidenceFlags).length} to verify
                </Badge>
              )}
            </div>
            <p className="mb-5 text-sm text-slate-500">
              Everything below is editable — correct anything the scan got wrong before saving.
            </p>
            <FieldSchemaForm
              fields={matched.machine.template.fields}
              values={values}
              confidenceFlags={matched.confidenceFlags}
              onChange={setValue}
            />
          </Card>

          {matched.rawText && (
            <Card>
              <button
                type="button"
                onClick={() => setShowRawText((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="text-sm font-semibold text-slate-900">Raw text read from this document</span>
                <span className="text-xs font-medium text-slate-500">{showRawText ? "Hide" : "Show"}</span>
              </button>
              {showRawText && (
                <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                  {matched.rawText}
                </pre>
              )}
            </Card>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="secondary" onClick={handleCopyJson}>
              {copied ? "Copied!" : "Copy JSON"}
            </Button>
            <Button variant="secondary" onClick={handleExportCsv}>
              Export CSV
            </Button>
            <Button onClick={handleSave} disabled={saving || saved} className="col-span-2 sm:col-span-1">
              {saved ? "Saved!" : saving ? "Saving…" : "Save Reading"}
            </Button>
            <Button variant="secondary" onClick={startOver}>
              Scan Another
            </Button>
          </div>
          {errorMessage && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
