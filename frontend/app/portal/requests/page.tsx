"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { Badge, EmptyState, ErrorBanner, PageHeader, SkeletonList } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { InboxIcon, PlusIcon } from "@/components/icons";
import type { AccountRequest, Machine } from "@/lib/types";

const STATUS_TONE = {
  pending: "amber",
  approved: "emerald",
  rejected: "rose",
} as const;

export default function RequestsPage() {
  const { push } = useToast();
  const [requests, setRequests] = useState<AccountRequest[] | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"technician" | "client_admin">("technician");
  const [employeeId, setEmployeeId] = useState("");
  const [department, setDepartment] = useState("");
  const [machineIds, setMachineIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    Promise.all([api.getMyRequests(), api.getMyMachines()])
      .then(([reqs, myMachines]) => {
        setRequests(reqs);
        setMachines(myMachines);
      })
      .catch((err) => setError(err instanceof api.ApiError ? err.message : "Could not load requests."));
  }, []);

  useEffect(refresh, [refresh]);

  const toggleMachine = (id: number) => {
    setMachineIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPhone("");
    setRole("technician");
    setEmployeeId("");
    setDepartment("");
    setMachineIds([]);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    setSubmitting(true);
    try {
      await api.createAccountRequest({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        role,
        employeeId: employeeId.trim() || undefined,
        department: department.trim() || undefined,
        machineIds: role === "technician" ? machineIds : [],
      });
      push("Request submitted - a platform admin will review it.");
      resetForm();
      setShowForm(false);
      refresh();
    } catch (err) {
      push(err instanceof api.ApiError ? err.message : "Could not submit this request.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Requests"
        subtitle="Request a new login for your organization - a platform admin creates it after review."
        action={
          !showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700"
            >
              <PlusIcon className="h-4 w-4" />
              New Request
            </button>
          )
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {showForm && (
        <form onSubmit={submit} className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full Name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>
            <Field label="Phone (optional)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>
            <Field label="Role">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "technician" | "client_admin")}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              >
                <option value="technician">Technician</option>
                <option value="client_admin">Admin (client_admin)</option>
              </select>
            </Field>
            <Field label="Employee ID (optional)">
              <input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>
            <Field label="Department (optional)">
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </Field>
          </div>

          {role === "technician" && (
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-500">
                Machines this technician can access
              </label>
              {machines.length === 0 ? (
                <p className="text-sm text-slate-400">No machines in your organization yet.</p>
              ) : (
                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {machines.map((machine) => (
                    <label
                      key={machine.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={machineIds.includes(machine.id)}
                        onChange={() => toggleMachine(machine.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-slate-800">{machine.name}</span>
                      <span className="text-xs text-slate-400">{machine.template.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !fullName.trim() || !email.trim()}
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-700 disabled:bg-slate-300 disabled:shadow-none"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </form>
      )}

      {!requests && !error && <SkeletonList rows={3} />}

      {requests && requests.length === 0 && !showForm && (
        <EmptyState
          icon={<InboxIcon className="h-6 w-6" />}
          title="No requests yet"
          message="Request a new technician or admin login above."
        />
      )}

      {requests && requests.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {requests.map((req) => (
            <div key={req.id} className="px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{req.full_name}</p>
                <Badge tone={STATUS_TONE[req.status]}>{req.status}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {req.email} · {req.role === "technician" ? "Technician" : "Admin"}
                {req.machine_ids.length > 0 ? ` · ${req.machine_ids.length} machine(s)` : ""}
              </p>
              {req.admin_note && (
                <p className="mt-1 text-xs text-slate-500">Note: {req.admin_note}</p>
              )}
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
