"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { PlusIcon } from "@/components/icons";
import { ErrorBanner } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { AssetClass, NormalizerType } from "@/lib/types";

interface FieldRow {
  uid: string;
  key: string;
  label: string;
  placeholder: string;
  keyboard_type: "default" | "numeric" | "decimal-pad";
  normalizer_type: NormalizerType;
  min_length: string;
  max_length: string;
  synonyms: string;
}

function emptyRow(): FieldRow {
  return {
    uid: Math.random().toString(36).slice(2, 9),
    key: "",
    label: "",
    placeholder: "",
    keyboard_type: "default",
    normalizer_type: "text",
    min_length: "",
    max_length: "",
    synonyms: "",
  };
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10";
const smallInputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10";
const labelClass = "mb-1.5 block text-xs font-semibold text-slate-500";
const smallLabelClass = "mb-1 block text-[11px] font-semibold text-slate-500";

export default function NewTemplatePage() {
  const router = useRouter();
  const { push: pushToast } = useToast();
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [assetClassId, setAssetClassId] = useState("");
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [identifierFieldKey, setIdentifierFieldKey] = useState("");
  const [promptInstructions, setPromptInstructions] = useState("");
  const [fields, setFields] = useState<FieldRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminGetAssetClasses()
      .then(setAssetClasses)
      .catch((err) => setError(err instanceof api.ApiError ? err.message : "Could not load asset classes."));
  }, []);

  const updateField = (uid: string, patch: Partial<FieldRow>) => {
    setFields((prev) => prev.map((row) => (row.uid === uid ? { ...row, ...patch } : row)));
  };

  const removeField = (uid: string) => {
    setFields((prev) => prev.filter((row) => row.uid !== uid));
  };

  const validFields = fields.filter((f) => f.key.trim() && f.label.trim());

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assetClassId || !name.trim() || !identifierFieldKey || validFields.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await api.adminCreateTemplate({
        assetClassId,
        name: name.trim(),
        manufacturer: manufacturer.trim() || null,
        identifierFieldKey,
        fields: validFields.map((f) => ({
          key: f.key.trim(),
          label: f.label.trim(),
          placeholder: f.placeholder.trim(),
          keyboard_type: f.keyboard_type,
          normalizer_type: f.normalizer_type,
          min_length: f.min_length ? Number(f.min_length) : null,
          max_length: f.max_length ? Number(f.max_length) : null,
          synonyms: f.synonyms
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        })),
        promptInstructions: promptInstructions.trim() || null,
      });
      pushToast(`"${name.trim()}" template created.`);
      router.push("/admin/templates");
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : "Could not create this template.";
      setError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/templates"
        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        ‹ Back to templates
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold tracking-tight text-slate-900">
        New Machine Template
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Define the fields extracted from this machine model's documents.
      </p>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <form onSubmit={submit} className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Asset Class</label>
              <select
                value={assetClassId}
                onChange={(event) => setAssetClassId(event.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                {assetClasses.map((ac) => (
                  <option key={ac.id} value={ac.id}>
                    {ac.icon} {ac.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Template Name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. APC Smart-UPS 3000"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Manufacturer (optional)</label>
              <input
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Identifier Field</label>
              <select
                value={identifierFieldKey}
                onChange={(event) => setIdentifierFieldKey(event.target.value)}
                className={inputClass}
              >
                <option value="">Select a field below…</option>
                {validFields.map((f) => (
                  <option key={f.uid} value={f.key.trim()}>
                    {f.key.trim()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Fields</h2>
            <button
              type="button"
              onClick={() => setFields((prev) => [...prev, emptyRow()])}
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add field
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((row, index) => (
              <div key={row.uid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Field {index + 1}
                  </span>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeField(row.uid)}
                      className="text-xs font-medium text-rose-600 hover:text-rose-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={smallLabelClass}>Key (snake_case)</label>
                    <input
                      value={row.key}
                      onChange={(event) => updateField(row.uid, { key: event.target.value })}
                      placeholder="serial_number"
                      className={smallInputClass}
                    />
                  </div>
                  <div>
                    <label className={smallLabelClass}>Label</label>
                    <input
                      value={row.label}
                      onChange={(event) => updateField(row.uid, { label: event.target.value })}
                      placeholder="Serial Number"
                      className={smallInputClass}
                    />
                  </div>
                  <div>
                    <label className={smallLabelClass}>Placeholder</label>
                    <input
                      value={row.placeholder}
                      onChange={(event) => updateField(row.uid, { placeholder: event.target.value })}
                      className={smallInputClass}
                    />
                  </div>
                  <div>
                    <label className={smallLabelClass}>Synonyms (comma-separated)</label>
                    <input
                      value={row.synonyms}
                      onChange={(event) => updateField(row.uid, { synonyms: event.target.value })}
                      placeholder="serial no, s/n"
                      className={smallInputClass}
                    />
                  </div>
                  <div>
                    <label className={smallLabelClass}>Keyboard Type</label>
                    <select
                      value={row.keyboard_type}
                      onChange={(event) =>
                        updateField(row.uid, {
                          keyboard_type: event.target.value as FieldRow["keyboard_type"],
                        })
                      }
                      className={smallInputClass}
                    >
                      <option value="default">Default</option>
                      <option value="numeric">Numeric</option>
                      <option value="decimal-pad">Decimal</option>
                    </select>
                  </div>
                  <div>
                    <label className={smallLabelClass}>Normalizer</label>
                    <select
                      value={row.normalizer_type}
                      onChange={(event) =>
                        updateField(row.uid, {
                          normalizer_type: event.target.value as NormalizerType,
                        })
                      }
                      className={smallInputClass}
                    >
                      <option value="text">Text</option>
                      <option value="digits">Digits</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                    </select>
                  </div>
                  <div>
                    <label className={smallLabelClass}>Min Length</label>
                    <input
                      value={row.min_length}
                      onChange={(event) => updateField(row.uid, { min_length: event.target.value })}
                      inputMode="numeric"
                      className={smallInputClass}
                    />
                  </div>
                  <div>
                    <label className={smallLabelClass}>Max Length</label>
                    <input
                      value={row.max_length}
                      onChange={(event) => updateField(row.uid, { max_length: event.target.value })}
                      inputMode="numeric"
                      className={smallInputClass}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className={labelClass}>Extra Extraction Guidance (optional)</label>
          <textarea
            value={promptInstructions}
            onChange={(event) => setPromptInstructions(event.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Any quirks the extraction model should know about this machine model's documents."
          />
        </div>

        <button
          type="submit"
          disabled={saving || !assetClassId || !name.trim() || !identifierFieldKey || validFields.length === 0}
          className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {saving ? "Creating…" : "Create Template"}
        </button>
      </form>
    </div>
  );
}
