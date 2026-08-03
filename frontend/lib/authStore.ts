"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Role } from "./types";

export interface AuthSession {
  token: string;
  role: Role;
  clientId: number | null;
}

const STORAGE_KEY = "wrv.auth";

export function loadSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.token === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

interface AuthContextValue {
  session: AuthSession | null | undefined;
  login: (next: AuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Drives the whole app's auth state; mounted once in the root layout. */
export function useProvideAuth(): AuthContextValue {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    setSession(loadSession());
  }, []);

  const login = useCallback((next: AuthSession) => {
    saveSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return { session, login, logout };
}

export { AuthContext };

export function useAuthSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthSession must be used within AuthProvider");
  return ctx;
}
