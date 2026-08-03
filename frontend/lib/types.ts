export interface AssetClass {
  id: string;
  label: string;
  icon: string;
}

export type NormalizerType = "text" | "digits" | "number" | "date";

export interface FieldSchema {
  key: string;
  label: string;
  placeholder: string;
  keyboard_type: "default" | "numeric" | "decimal-pad";
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

export interface Client {
  id: number;
  name: string;
  created_at: string;
}

export type Role = "admin" | "client_admin" | "technician";

export interface UserAccount {
  id: number;
  email: string;
  role: Role;
  client_id: number | null;
  status: "active" | "suspended";
}

export interface AccountRequest {
  id: number;
  client_id: number;
  requested_by_user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  role: "client_admin" | "technician";
  employee_id: string | null;
  department: string | null;
  machine_ids: number[];
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  decided_by_user_id: number | null;
  decided_at: string | null;
  created_at: string;
}

export interface Technician {
  id: number;
  email: string;
  status: "active" | "suspended";
  machines: Machine[];
  reading_count: number;
  last_reading_at: string | null;
}

export interface TrendPoint {
  captured_at: string;
  value: number;
  is_anomaly: boolean;
}

export interface MachineTrend {
  field_key: string;
  field_label: string;
  points: TrendPoint[];
}

export interface AnomalyFlag {
  machine_id: number;
  machine_name: string;
  field_label: string;
  captured_at: string;
  value: number;
  previous_value: number;
}

export interface OverdueMachine {
  machine_id: number;
  name: string;
  last_reading_at: string | null;
}

export interface DashboardSummary {
  total_machines: number;
  technician_count: number;
  readings_this_week: number;
  readings_this_month: number;
  overdue_machines: OverdueMachine[];
  recent_anomalies: AnomalyFlag[];
}

export interface ClientBreakdown {
  client_id: number;
  name: string;
  machine_count: number;
  reading_count: number;
}

export interface AdminDashboardSummary {
  total_clients: number;
  total_machines: number;
  total_readings: number;
  readings_this_week: number;
  per_client: ClientBreakdown[];
}
