"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { BuildingIcon, ChevronRightIcon, GridIcon, PlusIcon } from "@/components/icons";
import { EmptyState, ErrorBanner, PageHeader, SkeletonGrid, StatCard } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { Client, Machine } from "@/lib/types";

export default function AdminDashboard() {
  const { push } = useToast();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [machineCounts, setMachineCounts] = useState<Map<number, number>>(new Map());
  const [totalMachines, setTotalMachines] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    Promise.all([api.adminListClients(), api.adminListMachines()])
      .then(([clientList, machines]: [Client[], Machine[]]) => {
        setClients(clientList);
        setTotalMachines(machines.length);
        const counts = new Map<number, number>();
        for (const machine of machines) {
          counts.set(machine.client_id, (counts.get(machine.client_id) ?? 0) + 1);
        }
        setMachineCounts(counts);
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load clients.");
      });
  }, []);

  useEffect(refresh, [refresh]);

  const createClient = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.adminCreateClient(newName.trim());
      push(`"${newName.trim()}" created.`);
      setNewName("");
      refresh();
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : "Could not create client.";
      setError(message);
      push(message, "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <PageHeader title="Clients" subtitle="Each client only sees the machines you assign them below." />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Total Clients" value={clients?.length ?? "—"} icon={<BuildingIcon className="h-5 w-5" />} />
        <StatCard label="Total Machines" value={totalMachines} icon={<GridIcon className="h-5 w-5" />} />
      </div>

      <form
        onSubmit={createClient}
        className="mt-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New client name"
          className="min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          <PlusIcon className="h-4 w-4" />
          {creating ? "Adding…" : "New Client"}
        </button>
      </form>

      {!clients && !error && (
        <div className="mt-6">
          <SkeletonGrid items={4} />
        </div>
      )}

      {clients && clients.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={<BuildingIcon className="h-6 w-6" />}
            title="No clients yet"
            message="Create your first client above, then assign them machines and a login."
          />
        </div>
      )}

      {clients && clients.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/admin/clients/${client.id}`}
              className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600">
                  {client.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                  <p className="text-xs text-slate-500">
                    {machineCounts.get(client.id) ?? 0} machine
                    {(machineCounts.get(client.id) ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <ChevronRightIcon className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
