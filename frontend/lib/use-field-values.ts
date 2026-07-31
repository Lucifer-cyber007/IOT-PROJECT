"use client";

import { useCallback, useState } from "react";
import type { FieldSchema } from "./types";

function toInitialValues(
  fields: FieldSchema[],
  initial?: Record<string, string | null>
): Record<string, string> {
  return fields.reduce<Record<string, string>>((accumulator, field) => {
    accumulator[field.key] = initial?.[field.key] ?? "";
    return accumulator;
  }, {});
}

/** Generalizes the trim/nullify logic duplicated across the mobile app's
 * ManualEntryScreen and ResultsScreen: every field is a controlled string
 * while editing, and collapses to `Record<string, string | null>` (empty ->
 * null) only when building the payload to send to the server. */
export function useFieldValues(fields: FieldSchema[], initial?: Record<string, string | null>) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    toInitialValues(fields, initial)
  );

  const setValue = useCallback((key: string, next: string) => {
    setValues((previous) => ({ ...previous, [key]: next }));
  }, []);

  const reset = useCallback(
    (nextInitial?: Record<string, string | null>) => {
      setValues(toInitialValues(fields, nextInitial));
    },
    [fields]
  );

  const toPayload = useCallback((): Record<string, string | null> => {
    return fields.reduce<Record<string, string | null>>((accumulator, field) => {
      const trimmed = (values[field.key] ?? "").trim();
      accumulator[field.key] = trimmed === "" ? null : trimmed;
      return accumulator;
    }, {});
  }, [fields, values]);

  return { values, setValue, reset, toPayload };
}
