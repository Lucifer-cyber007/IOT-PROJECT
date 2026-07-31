"use client";

import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import type { ClientRecord, Role } from "@/lib/types";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

/**
 * The backend has no GET /api/admin/users - a created login cannot be listed
 * or recovered anywhere in this system. Confirmed approach: ship this as a
 * one-way creation form with a persistent warning, rather than faking a table
 * or adding a backend endpoint (out of scope for this frontend-only build).
 */
export default function AdminUsersPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("client");
  const [clientId, setClientId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    api
      .listClients()
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter an email and password.");
      return;
    }
    if (role === "client" && clientId == null) {
      setError("Choose a client for this login.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createUser({
        email: email.trim(),
        password,
        role,
        clientId: clientId ?? undefined,
      });
      setCreated({ email: email.trim(), password });
      setEmail("");
      setPassword("");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not create this user.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Users" description="Create logins for admins or clients." />

      <div className="mb-6 max-w-md rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Created logins are not listed anywhere.</p>
        <p className="mt-1">
          There is no way to view or recover a user&apos;s email/password after this form. Write
          them down now if you&apos;ll need them.
        </p>
      </div>

      {created && (
        <Card className="mb-6 max-w-md border-emerald-200 bg-emerald-50">
          <p className="text-sm font-semibold text-emerald-900">User created</p>
          <p className="mt-2 text-sm text-emerald-800">
            Email: <span className="font-mono">{created.email}</span>
            <br />
            Password: <span className="font-mono">{created.password}</span>
          </p>
        </Card>
      )}

      <Card className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Password
            </label>
            <input
              type="text"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Role
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            >
              <option value="client">Client</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {role === "client" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Client
              </label>
              <select
                value={clientId ?? ""}
                onChange={(event) => setClientId(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="" disabled>
                  Choose a client…
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create User"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
