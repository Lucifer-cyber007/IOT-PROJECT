import type { FieldSchema, KeyboardType, NormalizerType } from "@/lib/types";
import Button from "@/components/ui/Button";

const KEYBOARD_TYPES: KeyboardType[] = ["default", "numeric", "decimal-pad"];
const NORMALIZER_TYPES: NormalizerType[] = ["text", "digits", "number", "date"];

function emptyField(): FieldSchema {
  return {
    key: "",
    label: "",
    placeholder: "",
    keyboard_type: "default",
    normalizer_type: "text",
    min_length: null,
    max_length: null,
    synonyms: [],
  };
}

/**
 * New from scratch - no mobile/old-frontend precedent, since neither has any
 * admin UI. Kept intentionally simple: a plain array of field rows with
 * up/down reordering buttons rather than drag-and-drop, disproportionate for
 * a builder that will realistically hold 5-15 rows.
 */
interface FieldSchemaBuilderProps {
  fields: FieldSchema[];
  identifierFieldKey: string;
  onChange: (fields: FieldSchema[]) => void;
  onIdentifierChange: (key: string) => void;
}

export default function FieldSchemaBuilder({
  fields,
  identifierFieldKey,
  onChange,
  onIdentifierChange,
}: FieldSchemaBuilderProps) {
  const updateField = (index: number, patch: Partial<FieldSchema>) => {
    const next = fields.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeField = (index: number) => {
    const removedKey = fields[index].key;
    const next = fields.filter((_, i) => i !== index);
    onChange(next);
    if (removedKey === identifierFieldKey) onIdentifierChange("");
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = fields.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={index} className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Field {index + 1}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moveField(index, -1)}
                  disabled={index === 0}
                  aria-label="Move field up"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveField(index, 1)}
                  disabled={index === fields.length - 1}
                  aria-label="Move field down"
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => removeField(index)}
                  aria-label="Remove field"
                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <input
                value={field.key}
                onChange={(event) => updateField(index, { key: event.target.value })}
                placeholder="key (e.g. rr_number)"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              />
              <input
                value={field.label}
                onChange={(event) => updateField(index, { label: event.target.value })}
                placeholder="Label"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              />
              <input
                value={field.placeholder}
                onChange={(event) => updateField(index, { placeholder: event.target.value })}
                placeholder="Placeholder"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              />
              <select
                value={field.keyboard_type}
                onChange={(event) =>
                  updateField(index, { keyboard_type: event.target.value as KeyboardType })
                }
                className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              >
                {KEYBOARD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={field.normalizer_type}
                onChange={(event) =>
                  updateField(index, { normalizer_type: event.target.value as NormalizerType })
                }
                className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              >
                {NORMALIZER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <input
                value={field.synonyms.join(", ")}
                onChange={(event) =>
                  updateField(index, {
                    synonyms: event.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Synonyms (comma-separated)"
                className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...fields, emptyField()])}
      >
        + Add Field
      </Button>

      {fields.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Identifier field
          </label>
          <select
            value={identifierFieldKey}
            onChange={(event) => onIdentifierChange(event.target.value)}
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="">Choose which field is the identifier…</option>
            {fields
              .filter((f) => f.key.trim() !== "")
              .map((f) => (
                <option key={f.key} value={f.key}>
                  {f.key}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            This field&apos;s value (e.g. a serial or account number) is what scans are
            auto-matched against.
          </p>
        </div>
      )}
    </div>
  );
}
