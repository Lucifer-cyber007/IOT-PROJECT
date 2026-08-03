"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangleIcon, CheckCircleIcon } from "./icons";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}

interface ToastContextValue {
  push: (message: string, tone?: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, tone: "success" | "error" = "success") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`animate-toast-in pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-200 bg-white text-emerald-800"
                : "border-rose-200 bg-white text-rose-800"
            }`}
          >
            {toast.tone === "success" ? (
              <CheckCircleIcon className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertTriangleIcon className="h-4 w-4 shrink-0 text-rose-500" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
