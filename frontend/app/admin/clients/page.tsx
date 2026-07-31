"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { ClientRecord } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setClients(await api.listClients());
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not load clients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Enter a name.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createClient(name.trim());
      setName("");
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof api.ApiError ? err.message : "Could not create this client.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Tenants who can log in and manage their own equipment."
        action={<Button onClick={() => setShowForm((v) => !v)}>+ New Client</Button>}
      />

      {showForm && (
        <Card className="mb-6 max-w-md">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Name
              </label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Acme Manufacturing"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
            {formError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
            )}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Client"}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-slate-500">No clients yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-500">{client.id}</td>
                  <td className="py-2 pr-4 text-slate-900">{client.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{formatDate(client.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
