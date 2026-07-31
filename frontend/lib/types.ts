/**
 * Wire-format types matching backend/schemas.py exactly (snake_case, no camelCase
 * transform layer) - the same convention the mobile app's lib/types.ts already uses.
 */

export type Role = "admin" | "client";

export type NormalizerType = "text" | "digits" | "number" | "date";
export type KeyboardType = "default" | "numeric" | "decimal-pad";

export interface AssetClass {
  id: string;
  label: string;
  icon: string;
}

export interface FieldSchema {
  key: string;
  label: string;
  placeholder: string;
  keyboard_type: KeyboardType;
  normalizer_type: NormalizerType;
  min_length: number | null;
  max_length: number | null;
  synonyms: string[];
}

export interface MachineTemplate {
  id: number;
  asset_class_id: string;
  name: string;
  manufacturer: string | null;
  capture_methods: string[];
  identifier_field_key: string;
  fields: FieldSchema[];
  prompt_instructions: string | null;
  quirks: string[];
}

export interface Machine {
  id: number;
  client_id: number;
  template_id: number;
  name: string;
  identifier_value: string;
  created_at: string;
  template: MachineTemplate;
}

export type ConfidenceFlag = "low_confidence" | "not_found";

export interface Reading {
  id: number;
  machine_id: number;
  captured_at: string;
  capture_method: "ocr" | "manual";
  fields: Record<string, string | null>;
  confidence_flags: Record<string, ConfidenceFlag> | null;
  raw_text: string | null;
}

export interface ClientRecord {
  id: number;
  name: string;
  created_at: string;
}

export interface UserRecord {
  id: number;
  email: string;
  role: Role;
  client_id: number | null;
}

// --- Scan -------------------------------------------------------------------

export interface ScanMatched {
  status: "matched";
  machine: Machine;
  fields: Record<string, string | null>;
  confidence_flags: Record<string, ConfidenceFlag>;
  raw_text: string;
}

export interface ScanUnresolved {
  status: "ambiguous" | "no_match";
  candidates: Machine[];
  raw_text: string;
}

export type ScanResult = ScanMatched | ScanUnresolved;

export interface BatchScanItem {
  index: number;
  filename: string;
  status: "matched" | "ambiguous" | "no_match" | "error";
  machine?: Machine;
  fields?: Record<string, string | null>;
  confidence_flags?: Record<string, ConfidenceFlag>;
  candidates?: Machine[];
  raw_text?: string;
  error?: string;
}

export interface BatchScanResponse {
  results: BatchScanItem[];
  matched: number;
  unresolved: number;
  failed: number;
}
