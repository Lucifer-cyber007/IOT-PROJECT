"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { useAuthSession } from "@/lib/authStore";
import { CheckCircleIcon, ScanIcon, SparkIcon } from "@/components/icons";

const FEATURES = [
  { icon: ScanIcon, text: "Scan documents or gauge readings for any registered machine" },
  { icon: SparkIcon, text: "Auto-detects which machine a scan belongs to" },
  { icon: CheckCircleIcon, text: "Review every extracted field before it's saved" },
];

export default function LoginPage() {
  const { session, login } = useAuthSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) router.replace(session.role === "admin" ? "/admin" : "/portal");
  }, [session, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.login(email.trim(), password);
      login(result);
      router.replace(result.role === "admin" ? "/admin" : "/portal");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden bg-slate-900 px-12 py-14 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 15%, rgba(99,102,241,0.35), transparent 45%), radial-gradient(circle at 85% 85%, rgba(99,102,241,0.25), transparent 45%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-base font-extrabold shadow-lg shadow-indigo-950/40">
            W
          </div>
          <span className="text-lg font-bold tracking-tight">WRV Energies</span>
        </div>

        <div className="relative">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
            Energy Monitoring Portal
          </h1>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            One place to scan, log and review readings across every machine you manage.
          </p>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10">
                  <Icon className="h-3.5 w-3.5 text-indigo-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} WRV Energies</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-sm font-extrabold text-white">
                W
              </div>
              <span className="text-base font-bold text-slate-900">WRV Energies</span>
            </div>
          </div>

          <h2 className="text-xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Enter your account credentials to continue.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
              >
                {error}
              </p>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-shadow focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-shadow focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !email.trim() || !password}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/30 transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
