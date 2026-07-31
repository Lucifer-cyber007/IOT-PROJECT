"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { AssetClass, MachineTemplate } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<MachineTemplate[]>([]);
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [templateList, classList] = await Promise.all([
          api.listMachineTemplatesAdmin(),
          api.listAssetClassesAdmin(),
        ]);
        setTemplates(templateList);
        setAssetClasses(classList);
      } catch (err) {
        setError(err instanceof api.ApiError ? err.message : "Could not load templates.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const classLabel = (id: string) => assetClasses.find((c) => c.id === id)?.label ?? id;

  return (
    <div>
      <PageHeader
        title="Machine Templates"
        description="Field schemas that define what data a machine model captures."
        action={
          <Link href="/admin/templates/new">
            <Button>+ New Template</Button>
          </Link>
        }
      />

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-slate-500">No templates yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Asset Class</th>
                <th className="py-2 pr-4">Manufacturer</th>
                <th className="py-2 pr-4">Fields</th>
                <th className="py-2 pr-4">Identifier</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-900">{template.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{classLabel(template.asset_class_id)}</td>
                  <td className="py-2 pr-4 text-slate-600">{template.manufacturer ?? "—"}</td>
                  <td className="py-2 pr-4 text-slate-600">{template.fields.length}</td>
                  <td className="py-2 pr-4 text-slate-600">{template.identifier_field_key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
