"use client";

import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { Badge, EmptyState, ErrorBanner, PageHeader, SkeletonList } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { InboxIcon } from "@/components/icons";
import type { AccountRequest, Client } from "@/lib/types";

const STATUS_TONE = {
  pending: "amber",
  approved: "emerald",
  rejected: "rose",
} as const;

export default function AdminRequestsPage() {
  const { push } = useToast();
  const [requests, setRequests] = useState<AccountRequest[] | null>(null);
  const [clients, setClients] = useState<Map<number, Client>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(() => {
    setError(null);
    Promise.all([api.adminListRequests(), api.adminListClients()])
      .then(([reqs, clientList]) => {
        setRequests(reqs);
        setClients(new Map(clientList.map((c) => [c.id, c])));
      })
      .catch((err) => setError(err instanceof api.ApiError ? err.message : "Could not load requests."));
  }, []);

  useEffect(refresh, [refresh]);

  const startDecision = (id: number, nextMode: "approve" | "reject") => {
    setDecidingId(id);
    setMode(nextMode);
    setPassword("");
    setRejectNote("");
  };

  const cancelDecision = () => {
    setDecidingId(null);
    setMode(null);
  };

  const submitDecision = async () => {
    if (decidingId == null) return;
    setSubmitting(true);
    try {
      if (mode === "approve") {
        if (!password.trim()) return;
        await api.adminApproveRequest(decidingId, password.trim());
        push("Request approved - login created.");
      } else {
        if (!rejectNote.trim()) return;
        await api.adminRejectRequest(decidingId, rejectNote.trim());
        push("Request rejected.");
      }
      cancelDecision();
      refresh();
    } catch (err) {
      push(err instanceof api.ApiError ? err.message : "Could not process this request.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const pending = requests?.filter((r) => r.status === "pending") ?? [];
  const decided = requests?.filter((r) => r.status !== "pending") ?? [];

  return (
    <div>
      <PageHeader
        title="Account Requests"
        subtitle="New logins requested by client admins - review and create, or reject with a note."
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {!requests && !error && <SkeletonList rows={3} />}

      {requests && pending.length === 0 && (
        <div className="mb-8">
          <EmptyState icon={<InboxIcon className="h-6 w-6" />} title="No pending requests" message="You're all caught up." />
        </div>
      )}

      {pending.length > 0 && (
        <div className="mb-8 space-y-3">
          {pending.map((req) => (
            <div key={req.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{req.full_name}</p>
                <Badge tone="amber">pending</Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {req.email} · {req.role === "technician" ? "Technician" : "Client Admin"} ·{" "}
                {clients.get(req.client_id)?.name ?? `Client #${req.client_id}`}
                {req.machine_ids.length > 0 && ` · ${req.machine_ids.length} machine(s) requested`}
              </p>
              {req.employee_id && (
                <p className="mt-0.5 text-xs text-slate-500">Employee ID: {req.employee_id}</p>
              )}

              {decidingId === req.id ? (
                <div className="mt-3 space-y-2">
                  {mode === "approve" ? (
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set a password for this login"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                    />
                  ) : (
                    <input
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Reason for rejecting"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelDecision}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitDecision}
                      disabled={submitting || (mode === "approve" ? !password.trim() : !rejectNote.trim())}
                      className={`w-full rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300 ${
                        mode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                      }`}
                    >
                      {submitting ? "Working…" : mode === "approve" ? "Confirm Approve" : "Confirm Reject"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startDecision(req.id, "reject")}
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => startDecision(req.id, "approve")}
                    className="rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">
            Past Decisions
          </h2>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {decided.map((req) => (
              <div key={req.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{req.full_name}</p>
                  <Badge tone={STATUS_TONE[req.status]}>{req.status}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {req.email} · {clients.get(req.client_id)?.name ?? `Client #${req.client_id}`}
                </p>
                {req.admin_note && <p className="mt-1 text-xs text-slate-500">Note: {req.admin_note}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
