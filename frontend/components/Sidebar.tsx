"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { useAuthSession } from "@/lib/authStore";
import { LogOutIcon } from "./icons";

interface SidebarProps {
  subtitle: string;
  links: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-sm font-extrabold text-white shadow-lg shadow-indigo-950/40">
        W
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold tracking-tight text-white">WRV Energies</p>
        <p className="truncate text-xs text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

function NavLinks({
  links,
  pathname,
  onNavigate,
}: {
  links: SidebarProps["links"];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 space-y-1 px-3">
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-indigo-400" />
            )}
            <Icon className={`h-[18px] w-[18px] ${active ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"}`} />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountFooter({ email, onLogout }: { email: string | null; onLogout: () => void }) {
  return (
    <div className="border-t border-white/10 px-3 py-4">
      {email && <p className="truncate px-3 pb-2 text-xs text-slate-500">{email}</p>}
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOutIcon className="h-[18px] w-[18px] text-slate-500" />
        Log out
      </button>
    </div>
  );
}

export default function Sidebar({ subtitle, links }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuthSession();
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api
      .getMe()
      .then((me) => setEmail(me.email))
      .catch(() => setEmail(null));
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const doLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <>
      {/* Desktop: persistent sidebar */}
      <aside className="hidden h-screen w-64 shrink-0 flex-col bg-slate-900 lg:flex">
        <div className="px-5 py-6">
          <Brand subtitle={subtitle} />
        </div>
        <NavLinks links={links} pathname={pathname} />
        <AccountFooter email={email} onLogout={doLogout} />
      </aside>

      {/* Mobile: top bar + slide-in drawer */}
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3 lg:hidden">
        <Brand subtitle={subtitle} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="animate-fade-in-up absolute inset-y-0 left-0 flex w-72 flex-col bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-6">
              <Brand subtitle={subtitle} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M6 18 18 6" />
                </svg>
              </button>
            </div>
            <NavLinks links={links} pathname={pathname} onNavigate={() => setOpen(false)} />
            <AccountFooter email={email} onLogout={doLogout} />
          </aside>
        </div>
      )}
    </>
  );
}
