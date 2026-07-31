"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export interface NavItem {
  href: string;
  label: string;
}

interface AppShellProps {
  navItems: NavItem[];
  children: React.ReactNode;
}

/** Persistent sidebar + topbar shell - the desktop analog of the mobile app's
 * bottom TabBar, sized for an 8-route client portal / 6-route admin console
 * rather than the old single-page scanner's centered max-w-3xl layout. */
export default function AppShell({ navItems, children }: AppShellProps) {
  const pathname = usePathname();
  const { session, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900">
            <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900">WRV Energies</span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 px-3 py-4">
          <p className="truncate px-3 text-xs text-slate-400" title={session?.role}>
            Signed in as {session?.role}
          </p>
          <button
            type="button"
            onClick={logout}
            className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8">{children}</main>
    </div>
  );
}
