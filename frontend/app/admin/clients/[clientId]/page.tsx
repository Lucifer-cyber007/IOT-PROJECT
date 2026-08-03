"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { ChevronRightIcon, GridIcon, PlusIcon, UserIcon } from "@/components/icons";
import { EmptyState, ErrorBanner, PageHeader, SkeletonList } from "@/components/ui";
import { useToast } from "@/components/Toast";
import type { AssetClass, Client, Machine, MachineTemplate } from "@/lib/types";

export default function ClientDetailPage() {
  const { push } = useToast();
  const params = useParams<{ clientId: string }>();
  const clientId = Number(params.clientId);

  const [client, setClient] = useState<Client | null>(null);
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [assetClasses, setAssetClasses] = useState<AssetClass[]>([]);
  const [templates, setTemplates] = useState<MachineTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [assetClassId, setAssetClassId] = useState("");
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [machineName, setMachineName] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"client_admin" | "technician">("client_admin");
  const [creatingUser, setCreatingUser] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    Promise.all([
      api.adminListClients(),
      api.adminListMachines(clientId),
      api.adminGetAssetClasses(),
      api.adminListTemplates(),
    ])
      .then(([clients, clientMachines, classes, allTemplates]) => {
        setClient(clients.find((c) => c.id === clientId) ?? null);
        setMachines(clientMachines);
        setAssetClasses(classes);
        setTemplates(allTemplates);
      })
      .catch((err) => {
        setError(err instanceof api.ApiError ? err.message : "Could not load this client.");
      });
  }, [clientId]);

  useEffect(refresh, [refresh]);

  const templatesForClass = templates.filter((t) => t.asset_class_id === assetClassId);

  const assignMachine = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!templateId || !machineName.trim() || !identifierValue.trim()) return;
    setAssigning(true);
    setError(null);
    try {
      await api.adminCreateMachine({
        templateId,
        name: machineName.trim(),
        identifierValue: identifierValue.trim(),
        clientId,
      });
      push(`${machineName.trim()} assigned.`);
      setMachineName("");
      setIdentifierValue("");
      refresh();
    } catch (err) {
      const message = err instanceof api.ApiError ? err.message : "Could not assign this machine.";
      setError(message);
      push(message, "error");
    } finally {
      setAssigning(false);
    }
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userEmail.trim() || !userPassword) return;
    setCreatingUser(true);
    try {
      await api.adminCreateUser({
        email: userEmail.trim(),
        password: userPassword,
        role: userRole,
        clientId,
      });
      push(`Login created for ${userEmail.trim()}.`);
      setUserEmail("");
      setUserPassword("");
    } catch (err) {
      push(err instanceof api.ApiError ? err.message : "Could not create this login.", "error");
    } finally {
      setCreatingUser(false);
    }
  };

  return (
    <div>
      <Link
        href="/admin"
        className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        ‹ Back to clients
      </Link>

      <PageHeader title={client?.name ?? "…"} subtitle={`Client #${clientId}`} />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <GridIcon className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Assign a Machine</h2>
          </div>

          <form onSubmit={assignMachine} className="mt-4 space-y-3.5">
            <Field label="Asset Class">
              <select
                value={assetClassId}
                onChange={(event) => {
                  setAssetClassId(event.target.value);
                  setTemplateId(null);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              >
                <option value="">Select…</option>
                {assetClasses.map((ac) => (
                  <option key={ac.id} value={ac.id}>
                    {ac.icon} {ac.label}
                  </option>
                ))}
              </select>
            </Field>

            {assetClassId && (
              <Field label="Template">
                <select
                  value={templateId ?? ""}
                  onChange={(event) => setTemplateId(Number(event.target.value) || null)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                >
                  <option value="">Select…</option>
                  {templatesForClass.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                {templatesForClass.length === 0 && (
                  <p className="mt-1.5 text-xs text-amber-700">
                    No templates for this asset class yet —{" "}
                    <Link href="/admin/templates/new" className="underline">
                      create one
                    </Link>
                    .
                  </p>
                )}
              </Field>
            )}

            <Field label="Name">
              <input
                value={machineName}
                onChange={(event) => setMachineName(event.target.value)}
                placeholder="e.g. Server Room UPS"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>

            <Field label="Identifier (serial / account / meter no.)">
              <input
                value={identifierValue}
                onChange={(event) => setIdentifierValue(event.target.value)}
                placeholder="The number printed on this exact unit"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>

            <button
              type="submit"
              disabled={assigning || !templateId || !machineName.trim() || !identifierValue.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              <PlusIcon className="h-4 w-4" />
              {assigning ? "Assigning…" : "Assign Machine"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <UserIcon className="h-4 w-4" />
            </div>
            <h2 className="text-sm font-bold text-slate-900">Create a Login</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Use this to bootstrap the first client_admin for a new client. After that,
            client_admins should request further logins from their own portal.
          </p>

          <form onSubmit={createUser} className="mt-4 space-y-3.5">
            <Field label="Role">
              <select
                value={userRole}
                onChange={(event) => setUserRole(event.target.value as "client_admin" | "technician")}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              >
                <option value="client_admin">Client Admin</option>
                <option value="technician">Technician</option>
              </select>
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={userEmail}
                onChange={(event) => setUserEmail(event.target.value)}
                placeholder="ops@client.com"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={userPassword}
                onChange={(event) => setUserPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>
            <button
              type="submit"
              disabled={creatingUser || !userEmail.trim() || !userPassword}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {creatingUser ? "Creating…" : "Create Login"}
            </button>
          </form>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">
        Assigned Machines
      </h2>

      {!machines && !error && <SkeletonList rows={3} />}

      {machines && machines.length === 0 && (
        <EmptyState
          icon={<GridIcon className="h-6 w-6" />}
          title="No machines assigned yet"
          message="Use the form above to assign this client's first machine."
        />
      )}

      {machines && machines.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {machines.map((machine) => (
            <div key={machine.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm">
                  {assetClasses.find((ac) => ac.id === machine.template.asset_class_id)?.icon ?? "⚙️"}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{machine.name}</p>
                  <p className="text-xs text-slate-500">
                    {machine.template.name} · {machine.identifier_value}
                  </p>
                </div>
              </div>
              <ChevronRightIcon className="h-4 w-4 text-slate-300" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-500">{label}</label>
      {children}
    </div>
  );
}
