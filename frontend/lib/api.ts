import { clearSession, loadSession } from "./authStore";
import type {
  AccountRequest,
  AdminDashboardSummary,
  AssetClass,
  Client,
  DashboardSummary,
  Machine,
  MachineTemplate,
  MachineTrend,
  Reading,
  Role,
  Technician,
  UserAccount,
} from "./types";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_BATCH_FILES = 10;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function describeApiBase(): string {
  return API_BASE_URL;
}

function authHeader(): Record<string, string> {
  const session = loadSession();
  if (!session) throw new ApiError("Not logged in.", 401);
  return { Authorization: `Bearer ${session.token}` };
}

/** FastAPI validation errors put an array in `detail`; normalize both shapes. */
function readDetail(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (typeof first?.msg === "string") return first.msg;
  }
  return fallback;
}

async function toResult<T>(response: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body - handled below.
  }

  if (response.status === 401) {
    clearSession();
    throw new ApiError("Your session expired. Please log in again.", 401);
  }
  if (!response.ok) {
    throw new ApiError(
      readDetail(payload, `The server returned an error (HTTP ${response.status}).`),
      response.status
    );
  }
  return payload as T;
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) Object.assign(headers, authHeader());

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      `Could not reach the server at ${API_BASE_URL}. Make sure the backend is running.`,
      0
    );
  }

  return toResult<T>(response);
}

async function requestFormData<T>(
  path: string,
  formData: FormData,
  timeoutMs: number
): Promise<T> {
  const headers = authHeader();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers,
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("The request timed out. Check your connection and try again.", 0);
    }
    throw new ApiError(
      `Could not reach the server at ${API_BASE_URL}. Make sure the backend is running.`,
      0
    );
  } finally {
    clearTimeout(timeout);
  }

  return toResult<T>(response);
}

// --- Auth --------------------------------------------------------------------

export interface LoginResult {
  token: string;
  role: Role;
  clientId: number | null;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const body = await request<{
    access_token: string;
    role: Role;
    client_id: number | null;
  }>("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
  return { token: body.access_token, role: body.role, clientId: body.client_id };
}

export async function getMe(): Promise<UserAccount> {
  return request<UserAccount>("/api/auth/me");
}

// --- Asset classes / machine templates (read-only reference data) ------------

export async function getAssetClasses(): Promise<AssetClass[]> {
  return request<AssetClass[]>("/api/asset-classes");
}

export async function getMachineTemplates(assetClassId?: string): Promise<MachineTemplate[]> {
  const query = assetClassId ? `?asset_class_id=${encodeURIComponent(assetClassId)}` : "";
  return request<MachineTemplate[]>(`/api/machine-templates${query}`);
}

// --- Machines (this client's own) ---------------------------------------------

export async function getMyMachines(): Promise<Machine[]> {
  return request<Machine[]>("/api/machines");
}

// --- Scan (single + batch) ----------------------------------------------------

export type ScanResult =
  | {
      status: "matched";
      machine: Machine;
      fields: Record<string, string | null>;
      confidence_flags: Record<string, string>;
      raw_text: string;
    }
  | { status: "ambiguous" | "no_match"; candidates: Machine[]; raw_text: string };

export async function scanOne(
  file: File,
  options: { assetClassId?: string; machineId?: number } = {}
): Promise<ScanResult> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const params = new URLSearchParams();
  if (options.assetClassId) params.set("asset_class_id", options.assetClassId);
  if (options.machineId != null) params.set("machine_id", String(options.machineId));
  const query = params.toString() ? `?${params.toString()}` : "";

  return requestFormData<ScanResult>(`/api/scan${query}`, formData, 90_000);
}

export interface BatchScanItem {
  index: number;
  filename: string;
  status: "matched" | "ambiguous" | "no_match" | "error";
  machine?: Machine;
  fields?: Record<string, string | null>;
  confidence_flags?: Record<string, string>;
  candidates?: Machine[];
  raw_text?: string;
  error?: string;
}

export interface BatchScanResult {
  results: BatchScanItem[];
  matched: number;
  unresolved: number;
  failed: number;
}

export async function scanBatch(
  files: File[],
  options: { assetClassId?: string } = {}
): Promise<BatchScanResult> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file, file.name);

  const params = new URLSearchParams();
  if (options.assetClassId) params.set("asset_class_id", options.assetClassId);
  const query = params.toString() ? `?${params.toString()}` : "";

  return requestFormData<BatchScanResult>(`/api/scan/batch${query}`, formData, 180_000);
}

// --- Readings ------------------------------------------------------------------

export async function createReading(input: {
  machineId: number;
  captureMethod: "ocr" | "manual";
  fields: Record<string, string | null>;
  confidenceFlags?: Record<string, string> | null;
  rawText?: string | null;
}): Promise<Reading> {
  return request<Reading>("/api/readings", {
    method: "POST",
    body: {
      machine_id: input.machineId,
      capture_method: input.captureMethod,
      fields: input.fields,
      confidence_flags: input.confidenceFlags ?? null,
      raw_text: input.rawText ?? null,
    },
  });
}

export async function getMyReadings(options: { machineId?: number; technicianId?: number } = {}): Promise<Reading[]> {
  const params = new URLSearchParams();
  if (options.machineId != null) params.set("machine_id", String(options.machineId));
  if (options.technicianId != null) params.set("technician_id", String(options.technicianId));
  const query = params.toString() ? `?${params.toString()}` : "";
  return request<Reading[]>(`/api/readings${query}`);
}

// --- Admin ----------------------------------------------------------------------

export async function adminListClients(): Promise<Client[]> {
  return request<Client[]>("/api/admin/clients");
}

export async function adminCreateClient(name: string): Promise<Client> {
  return request<Client>("/api/admin/clients", { method: "POST", body: { name } });
}

export async function adminCreateUser(input: {
  email: string;
  password: string;
  role: Role;
  clientId?: number;
}): Promise<UserAccount> {
  return request<UserAccount>("/api/admin/users", {
    method: "POST",
    body: {
      email: input.email,
      password: input.password,
      role: input.role,
      client_id: input.clientId ?? null,
    },
  });
}

export async function adminGetAssetClasses(): Promise<AssetClass[]> {
  return request<AssetClass[]>("/api/admin/asset-classes");
}

export async function adminListTemplates(): Promise<MachineTemplate[]> {
  return request<MachineTemplate[]>("/api/admin/machine-templates");
}

export async function adminCreateTemplate(input: {
  assetClassId: string;
  name: string;
  manufacturer?: string | null;
  identifierFieldKey: string;
  fields: MachineTemplate["fields"];
  promptInstructions?: string | null;
}): Promise<MachineTemplate> {
  return request<MachineTemplate>("/api/admin/machine-templates", {
    method: "POST",
    body: {
      asset_class_id: input.assetClassId,
      name: input.name,
      manufacturer: input.manufacturer ?? null,
      capture_methods: ["manual", "ocr"],
      identifier_field_key: input.identifierFieldKey,
      fields: input.fields,
      prompt_instructions: input.promptInstructions ?? null,
      quirks: [],
    },
  });
}

export async function adminListMachines(clientId?: number): Promise<Machine[]> {
  const query = clientId != null ? `?client_id=${clientId}` : "";
  return request<Machine[]>(`/api/admin/machines${query}`);
}

export async function adminCreateMachine(input: {
  templateId: number;
  name: string;
  identifierValue: string;
  clientId: number;
}): Promise<Machine> {
  return request<Machine>("/api/admin/machines", {
    method: "POST",
    body: {
      template_id: input.templateId,
      name: input.name,
      identifier_value: input.identifierValue,
      client_id: input.clientId,
    },
  });
}

// --- Client admin: account requests ---------------------------------------------

export async function createAccountRequest(input: {
  fullName: string;
  email: string;
  phone?: string;
  role: "client_admin" | "technician";
  employeeId?: string;
  department?: string;
  machineIds?: number[];
}): Promise<AccountRequest> {
  return request<AccountRequest>("/api/requests", {
    method: "POST",
    body: {
      full_name: input.fullName,
      email: input.email,
      phone: input.phone ?? null,
      role: input.role,
      employee_id: input.employeeId ?? null,
      department: input.department ?? null,
      machine_ids: input.machineIds ?? [],
    },
  });
}

export async function getMyRequests(): Promise<AccountRequest[]> {
  return request<AccountRequest[]>("/api/requests");
}

// --- Client admin: technician roster + management ---------------------------------

export async function getTechnicians(): Promise<Technician[]> {
  return request<Technician[]>("/api/technicians");
}

export async function updateTechnicianMachines(
  technicianId: number,
  machineIds: number[]
): Promise<Technician> {
  return request<Technician>(`/api/technicians/${technicianId}/machines`, {
    method: "PATCH",
    body: { machine_ids: machineIds },
  });
}

export async function updateTechnicianStatus(
  technicianId: number,
  status: "active" | "suspended"
): Promise<UserAccount> {
  return request<UserAccount>(`/api/technicians/${technicianId}/status`, {
    method: "PATCH",
    body: { status },
  });
}

// --- Admin: account request approval ----------------------------------------------

export async function adminListRequests(status?: "pending" | "approved" | "rejected"): Promise<AccountRequest[]> {
  const query = status ? `?status=${status}` : "";
  return request<AccountRequest[]>(`/api/admin/requests${query}`);
}

export async function adminApproveRequest(requestId: number, password: string): Promise<UserAccount> {
  return request<UserAccount>(`/api/admin/requests/${requestId}/approve`, {
    method: "POST",
    body: { password },
  });
}

export async function adminRejectRequest(requestId: number, adminNote: string): Promise<AccountRequest> {
  return request<AccountRequest>(`/api/admin/requests/${requestId}/reject`, {
    method: "POST",
    body: { admin_note: adminNote },
  });
}

// --- Analytics -------------------------------------------------------------------

export async function getMachineTrend(machineId: number, field: string): Promise<MachineTrend> {
  return request<MachineTrend>(`/api/machines/${machineId}/trend?field=${encodeURIComponent(field)}`);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>("/api/dashboard/summary");
}

export async function adminGetDashboardSummary(): Promise<AdminDashboardSummary> {
  return request<AdminDashboardSummary>("/api/admin/dashboard/summary");
}

export async function exportReadingsCsv(filters: {
  machineId?: number;
  technicianId?: number;
  assetClassId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<void> {
  const params = new URLSearchParams({ format: "csv" });
  if (filters.machineId != null) params.set("machine_id", String(filters.machineId));
  if (filters.technicianId != null) params.set("technician_id", String(filters.technicianId));
  if (filters.assetClassId) params.set("asset_class_id", filters.assetClassId);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/readings/export?${params.toString()}`, {
      headers: authHeader(),
    });
  } catch {
    throw new ApiError(`Could not reach the server at ${API_BASE_URL}.`, 0);
  }
  if (!response.ok) {
    throw new ApiError(`The export failed (HTTP ${response.status}).`, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "readings.csv";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
