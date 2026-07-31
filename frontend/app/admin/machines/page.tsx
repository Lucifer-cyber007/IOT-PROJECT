"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { ClientRecord, Machine } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

export default function AdminMachinesPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientId, setClientId] = useState<number | "">("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listClients()
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .listMachinesAdmin(clientId === "" ? undefined : clientId)
      .then(setMachines)
      .catch((err) =>
        setError(err instanceof api.ApiError ? err.message : "Could not load machines.")
      )
      .finally(() => setLoading(false));
  }, [clientId]);

  return (
    <div>
      <PageHeader
        title="Machines"
        description="Equipment units assigned to clients."
        action={
          <Link href="/admin/machines/new">
            <Button>+ New Machine</Button>
          </Link>
        }
      />

      <div className="mb-4 max-w-xs">
        <select
          value={clientId}
          onChange={(event) => setClientId(event.target.value === "" ? "" : Number(event.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : machines.length === 0 ? (
          <p className="text-sm text-slate-500">No machines yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Template</th>
                <th className="py-2 pr-4">Identifier</th>
                <th className="py-2 pr-4">Client ID</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((machine) => (
                <tr key={machine.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-900">{machine.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{machine.template.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{machine.identifier_value}</td>
                  <td className="py-2 pr-4 text-slate-500">{machine.client_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
