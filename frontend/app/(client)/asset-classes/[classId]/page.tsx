"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { AssetClass, Machine, MachineTemplate } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

export default function AssetClassPage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;
  const router = useRouter();

  const [assetClass, setAssetClass] = useState<AssetClass | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [templates, setTemplates] = useState<MachineTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [classes, myMachines, classTemplates] = await Promise.all([
        api.getAssetClasses(),
        api.getMyMachines(),
        api.getMachineTemplates(classId),
      ]);
      setAssetClass(classes.find((c) => c.id === classId) ?? null);
      setMachines(myMachines.filter((m) => m.template.asset_class_id === classId));
      setTemplates(classTemplates);
      if (classTemplates.length === 1) setTemplateId(classTemplates[0].id);
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not load this asset class.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const handleAddAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!templateId || !name.trim() || !identifierValue.trim()) {
      setFormError("Choose a template and fill in both fields.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createMachine(templateId, name.trim(), identifierValue.trim());
      setName("");
      setIdentifierValue("");
      setShowAddForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof api.ApiError ? err.message : "Could not add this asset.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;

  return (
    <div>
      <PageHeader
        title={assetClass ? `${assetClass.icon} ${assetClass.label}` : "Asset Class"}
        description={`${machines.length} registered asset${machines.length === 1 ? "" : "s"}`}
        action={
          <div className="flex gap-2">
            {machines.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => router.push(`/asset-classes/${classId}/batch-scan`)}
              >
                Batch Scan
              </Button>
            )}
            <Button onClick={() => setShowAddForm((v) => !v)}>+ Add Asset</Button>
          </div>
        }
      />

      {showAddForm && (
        <Card className="mb-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Add Asset</h2>
          <form onSubmit={handleAddAsset} className="space-y-4">
            {templates.length > 1 && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Template
                </label>
                <select
                  value={templateId ?? ""}
                  onChange={(event) => setTemplateId(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                >
                  <option value="" disabled>
                    Choose a template…
                  </option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {templates.length === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No machine templates exist for this asset class yet. An admin needs to create one
                first.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Factory Floor Meter"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Identifier
                </label>
                <input
                  value={identifierValue}
                  onChange={(event) => setIdentifierValue(event.target.value)}
                  placeholder="Serial / account / meter number"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            </div>
            {formError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
            )}
            <Button type="submit" disabled={submitting || templates.length === 0}>
              {submitting ? "Adding…" : "Add Asset"}
            </Button>
          </form>
        </Card>
      )}

      {machines.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">No assets yet. Add one to get started.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {machines.map((machine) => (
            <Link key={machine.id} href={`/machines/${machine.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <h3 className="text-sm font-semibold text-slate-900">{machine.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {machine.template.name} &middot; {machine.identifier_value}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
