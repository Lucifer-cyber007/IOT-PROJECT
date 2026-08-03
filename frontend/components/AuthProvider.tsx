"use client";

import { AuthContext, useProvideAuth } from "@/lib/authStore";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideAuth();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
