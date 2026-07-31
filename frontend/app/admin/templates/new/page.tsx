"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { AssetClass, FieldSchema } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import FieldSchemaBuilder from "@/components/admin/FieldSchemaBuilder";

const CAPTURE_METHOD_OPTIONS = [
  { value: "ocr", label: "Scan (OCR)" },
  { value: "manual", label: "Manual entry" },
];

export default function NewTemplatePage() {
  const router = useRouter();
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [assetClassId, setAssetClassId] = useState("");
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [captureMethods, setCaptureMethods] = useState<string[]>(["ocr", "manual"]);
  const [promptInstructions, setPromptInstructions] = useState("");
  const [quirksInput, setQuirksInput] = useState("");
  const [fields, setFields] = useState<FieldSchema[]>([]);
  const [identifierFieldKey, setIdentifierFieldKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAssetClassesAdmin()
      .then(setAssetClasses)
      .catch(() => setAssetClasses([]));
  }, []);

  const toggleCaptureMethod = (value: string) => {
    setCaptureMethods((previous) =>
      previous.includes(value) ? previous.filter((v) => v !== value) : [...previous, value]
    );
  };

  const validate = (): string | null => {
    if (!assetClassId) return "Choose an asset class.";
    if (!name.trim()) return "Enter a name.";
    if (fields.length === 0) return "Add at least one field.";
    if (fields.some((f) => !f.key.trim() || !f.label.trim())) {
      return "Every field needs a key and a label.";
    }
    const keys = fields.map((f) => f.key.trim());
    if (new Set(keys).size !== keys.length) return "Field keys must be unique.";
    if (!identifierFieldKey || !keys.includes(identifierFieldKey)) {
      return "Choose which field is the identifier.";
    }
    if (captureMethods.length === 0) return "Choose at least one capture method.";
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createMachineTemplate({
        assetClassId,
        name: name.trim(),
        manufacturer: manufacturer.trim() || null,
        captureMethods,
        identifierFieldKey,
        fields,
        promptInstructions: promptInstructions.trim() || null,
        quirks: quirksInput
          .split(",")
          .map((q) => q.trim())
          .filter(Boolean),
      });
      router.push("/admin/templates");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not create this template.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="New Machine Template" />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        <Card className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Asset class
            </label>
            <select
              value={assetClassId}
              onChange={(event) => setAssetClassId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">Choose an asset class…</option>
              {assetClasses.map((assetClass) => (
                <option key={assetClass.id} value={assetClass.id}>
                  {assetClass.icon} {assetClass.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. APC Smart-UPS 3000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Manufacturer (optional)
              </label>
              <input
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Capture methods
            </label>
            <div className="flex gap-4">
              {CAPTURE_METHOD_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={captureMethods.includes(option.value)}
                    onChange={() => toggleCaptureMethod(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Custom extraction guidance (optional)
            </label>
            <textarea
              rows={2}
              value={promptInstructions}
              onChange={(event) => setPromptInstructions(event.target.value)}
              placeholder="Extra instructions for the extraction model, if this machine's documents need it."
              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quirks (optional, comma-separated)
            </label>
            <input
              value={quirksInput}
              onChange={(event) => setQuirksInput(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Fields</h2>
          <FieldSchemaBuilder
            fields={fields}
            identifierFieldKey={identifierFieldKey}
            onChange={setFields}
            onIdentifierChange={setIdentifierFieldKey}
          />
        </Card>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create Template"}
          </Button>
          <Button variant="secondary" type="button" onClick={() => router.push("/admin/templates")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
