import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";

export interface AuthSession {
  token: string;
  role: "admin" | "client";
  clientId: number | null;
}

// In-memory cache so repeated reads (e.g. one per API call) don't all hit
// disk; `undefined` means "not loaded yet", distinct from `null` ("loaded,
// no session").
let cached: AuthSession | null | undefined;

function authFile(): File {
  return new File(Paths.document, "auth.json");
}

export async function loadSession(): Promise<AuthSession | null> {
  if (cached !== undefined) return cached;
  try {
    const file = authFile();
    if (!file.exists) {
      cached = null;
      return null;
    }
    const parsed = JSON.parse(await file.text());
    cached = parsed && typeof parsed.token === "string" ? parsed : null;
  } catch {
    cached = null;
  }
  return cached ?? null;
}

export async function saveSession(session: AuthSession): Promise<void> {
  cached = session;
  const file = authFile();
  if (!file.exists) file.create();
  file.write(JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  cached = null;
  const file = authFile();
  if (file.exists) file.delete();
}

/** Drives the login/logout gate in App.tsx. */
export function useAuthSession() {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    void loadSession().then((value) => {
      if (mounted) setSession(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (next: AuthSession) => {
    await saveSession(next);
    setSession(next);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  return { session, login, logout };
}
