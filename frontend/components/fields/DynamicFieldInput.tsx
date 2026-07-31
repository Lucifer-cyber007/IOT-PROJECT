import type { ConfidenceFlag, FieldSchema } from "@/lib/types";

/** FieldSchema.keyboard_type is what actually drives input behavior on mobile;
 * normalizer_type is a server-side-only concept there, used here only for a
 * placeholder hint on date fields. */
function inputModeFor(keyboardType: FieldSchema["keyboard_type"]): "text" | "numeric" | "decimal" {
  if (keyboardType === "numeric") return "numeric";
  if (keyboardType === "decimal-pad") return "decimal";
  return "text";
}

interface DynamicFieldInputProps {
  field: FieldSchema;
  value: string;
  flag?: ConfidenceFlag;
  readOnly?: boolean;
  onChange: (next: string) => void;
}

export default function DynamicFieldInput({
  field,
  value,
  flag,
  readOnly = false,
  onChange,
}: DynamicFieldInputProps) {
  const inputId = `field-${field.key}`;
  const placeholder =
    field.placeholder || (field.normalizer_type === "date" ? "DD-MM-YYYY" : undefined);

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
        >
          {field.label}
        </label>
        {flag && (
          <span
            title={
              flag === "not_found"
                ? "This field was not found in the document"
                : "The scan was unsure about this value"
            }
            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
          >
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            Please verify
          </span>
        )}
      </div>

      <input
        id={inputId}
        type="text"
        inputMode={inputModeFor(field.keyboard_type)}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-lg border px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
          readOnly ? "bg-slate-50 text-slate-600" : ""
        } ${
          flag
            ? "border-amber-300 bg-amber-50/40 focus:border-amber-400"
            : "border-slate-300 focus:border-slate-500"
        }`}
      />
    </div>
  );
}
