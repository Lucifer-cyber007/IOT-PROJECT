import type { ConfidenceFlag, FieldSchema } from "@/lib/types";
import DynamicFieldInput from "./DynamicFieldInput";

/**
 * Renders one editable input per FieldSchema, driven entirely by the machine's
 * template - not a static field list. One component, three consumers: manual
 * entry, single-scan results, and batch-scan review's matched items (all
 * editable here, unlike mobile which made batch items read-only - see plan).
 */
interface FieldSchemaFormProps {
  fields: FieldSchema[];
  values: Record<string, string>;
  confidenceFlags?: Record<string, ConfidenceFlag>;
  readOnly?: boolean;
  onChange: (key: string, value: string) => void;
}

export default function FieldSchemaForm({
  fields,
  values,
  confidenceFlags,
  readOnly = false,
  onChange,
}: FieldSchemaFormProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <DynamicFieldInput
          key={field.key}
          field={field}
          value={values[field.key] ?? ""}
          flag={confidenceFlags?.[field.key]}
          readOnly={readOnly}
          onChange={(next) => onChange(field.key, next)}
        />
      ))}
    </div>
  );
}
