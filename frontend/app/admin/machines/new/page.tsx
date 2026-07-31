"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { ClientRecord, MachineTemplate } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

export default function NewMachinePage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [templates, setTemplates] = useState<MachineTemplate[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [templateId, setTemplateId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listClients(), api.listMachineTemplatesAdmin()])
      .then(([clientList, templateList]) => {
        setClients(clientList);
        setTemplates(templateList);
      })
      .catch(() => {
        setClients([]);
        setTemplates([]);
      });
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clientId || !templateId || !name.trim() || !identifierValue.trim()) {
      setError("Fill in every field.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createMachineAdmin({
        clientId,
        templateId,
        name: name.trim(),
        identifierValue: identifierValue.trim(),
      });
      router.push("/admin/machines");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not create this machine.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="New Machine" />

      <Card className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Client
            </label>
            <select
              value={clientId}
              onChange={(event) =>
                setClientId(event.target.value === "" ? "" : Number(event.target.value))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">Choose a client…</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Template
            </label>
            <select
              value={templateId}
              onChange={(event) =>
                setTemplateId(event.target.value === "" ? "" : Number(event.target.value))
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="">Choose a template…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
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
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Machine"}
            </Button>
            <Button variant="secondary" type="button" onClick={() => router.push("/admin/machines")}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
