"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Role } from "./types";

export interface AuthSession {
  token: string;
  role: Role;
  clientId: number | null;
}

const STORAGE_KEY = "wrv_auth";

/**
 * `undefined` = still checking localStorage (avoids a login-screen flash on
 * first paint), `null` = checked, signed out. Mirrors the mobile app's
 * authStore.ts three-state pattern, swapping expo-file-system for localStorage.
 */
type SessionState = AuthSession | null | undefined;

interface AuthContextValue {
  session: SessionState;
  login: (session: AuthSession) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Fired by clearStoredSession() so any mounted AuthProvider re-syncs immediately
 * (e.g. after the API layer clears a session on a 401), without needing a reload. */
const SESSION_CLEARED_EVENT = "wrv-auth:session-cleared";

function readStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.token === "string" &&
      (parsed.role === "admin" || parsed.role === "client")
    ) {
      return parsed as AuthSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState>(undefined);

  useEffect(() => {
    setSession(readStoredSession());
    const onCleared = () => setSession(null);
    window.addEventListener(SESSION_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(SESSION_CLEARED_EVENT, onCleared);
  }, []);

  const login = useCallback((next: AuthSession) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
}

/** Read the current token synchronously, for use inside lib/api.ts. */
export function getStoredToken(): string | null {
  return readStoredSession()?.token ?? null;
}

/** Clear the session outside of a component (e.g. on a 401 from the API layer). */
export function clearStoredSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(SESSION_CLEARED_EVENT));
}
