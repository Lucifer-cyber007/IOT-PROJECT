"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { FileIcon, PlusIcon } from "@/components/icons";
import { Badge, EmptyState, ErrorBanner, PageHeader, SkeletonGrid } from "@/components/ui";
import type { AssetClass, MachineTemplate } from "@/lib/types";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MachineTemplate[] | null>(null);
  const [assetClasses, setAssetClasses] = useState<Map<string, AssetClass>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.adminListTemplates(), api.adminGetAssetClasses()])
      .then(([templateList, classes]) => {
        setTemplates(templateList);
        setAssetClasses(new Map(classes.map((c) => [c.id, c])));
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load templates.");
      });
  }, []);

  return (
    <div>
      <PageHeader
        title="Machine Templates"
        subtitle="Reusable field schemas your admin-created machines are built from."
        action={
          <Link
            href="/admin/templates/new"
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700"
          >
            <PlusIcon className="h-4 w-4" />
            New Template
          </Link>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!templates && !error && <SkeletonGrid items={4} />}

      {templates && templates.length === 0 && (
        <EmptyState
          icon={<FileIcon className="h-6 w-6" />}
          title="No templates yet"
          message="Templates define the fields extracted from a machine's documents. Create your first one."
          action={
            <Link
              href="/admin/templates/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Template
            </Link>
          }
        />
      )}

      {templates && templates.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {templates.map((template) => {
            const assetClass = assetClasses.get(template.asset_class_id);
            return (
              <div
                key={template.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                      {assetClass?.icon ?? "⚙️"}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{template.name}</p>
                      <p className="text-xs text-slate-500">{assetClass?.label ?? template.asset_class_id}</p>
                    </div>
                  </div>
                  <Badge tone="indigo">{template.fields.length} fields</Badge>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Identifier field: <span className="font-medium text-slate-700">{template.identifier_field_key}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
