"use client";

import type { ConfidenceFlag, FieldSchema } from "@/lib/types";

interface FieldEditorProps {
  fields: FieldSchema[];
  values: Record<string, string | null>;
  flags?: Record<string, ConfidenceFlag> | null;
  onChange: (key: string, value: string) => void;
}

export default function FieldEditor({ fields, values, flags, onChange }: FieldEditorProps) {
  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const flag = flags?.[field.key];
        return (
          <div key={field.key}>
            <div className="mb-1.5 flex items-center gap-2">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {field.label}
              </label>
              {flag && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-amber-800">
                  PLEASE VERIFY
                </span>
              )}
            </div>
            <input
              type={field.keyboard_type === "numeric" ? "text" : "text"}
              inputMode={
                field.keyboard_type === "numeric"
                  ? "numeric"
                  : field.keyboard_type === "decimal-pad"
                    ? "decimal"
                    : "text"
              }
              value={values[field.key] ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
              className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 transition-shadow focus:outline-none focus:ring-4 ${
                flag
                  ? "border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-amber-500/10"
                  : "border-slate-200 bg-slate-50 focus:border-indigo-500 focus:ring-indigo-500/10"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
