import { clearStoredSession, getStoredToken } from "./auth-context";
import type {
  AssetClass,
  BatchScanResponse,
  ClientRecord,
  FieldSchema,
  Machine,
  MachineTemplate,
  Reading,
  Role,
  ScanResult,
  UserRecord,
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
  const token = getStoredToken();
  if (!token) throw new ApiError("Not logged in.", 401);
  return { Authorization: `Bearer ${token}` };
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
    clearStoredSession();
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
      `Could not reach the server at ${API_BASE_URL}. Check that the backend is running.`,
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
      `Could not reach the server at ${API_BASE_URL}. Check that the backend is running.`,
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
  const body = await request<{ access_token: string; role: Role; client_id: number | null }>(
    "/api/auth/login",
    { method: "POST", body: { email, password }, auth: false }
  );
  return { token: body.access_token, role: body.role, clientId: body.client_id };
}

export async function getMe(): Promise<UserRecord> {
  return request<UserRecord>("/api/auth/me");
}

export interface HealthOut {
  status: string;
  vision_key_configured: boolean;
  groq_key_configured: boolean;
  max_upload_mb: number;
  max_batch_files: number;
}

export async function getHealth(): Promise<HealthOut> {
  return request<HealthOut>("/api/health", { auth: false });
}

// --- Admin: clients ------------------------------------------------------------

export async function createClient(name: string): Promise<ClientRecord> {
  return request<ClientRecord>("/api/admin/clients", { method: "POST", body: { name } });
}

export async function listClients(): Promise<ClientRecord[]> {
  return request<ClientRecord[]>("/api/admin/clients");
}

// --- Admin: users ----------------------------------------------------------------

export interface CreateUserInput {
  email: string;
  password: string;
  role: Role;
  clientId?: number;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  return request<UserRecord>("/api/admin/users", {
    method: "POST",
    body: {
      email: input.email,
      password: input.password,
      role: input.role,
      client_id: input.clientId ?? null,
    },
  });
}

// --- Admin: asset classes / machine templates / machines ------------------------

export async function listAssetClassesAdmin(): Promise<AssetClass[]> {
  return request<AssetClass[]>("/api/admin/asset-classes");
}

export interface CreateMachineTemplateInput {
  assetClassId: string;
  name: string;
  manufacturer?: string | null;
  captureMethods: string[];
  identifierFieldKey: string;
  fields: FieldSchema[];
  promptInstructions?: string | null;
  quirks: string[];
}

export async function createMachineTemplate(
  input: CreateMachineTemplateInput
): Promise<MachineTemplate> {
  return request<MachineTemplate>("/api/admin/machine-templates", {
    method: "POST",
    body: {
      asset_class_id: input.assetClassId,
      name: input.name,
      manufacturer: input.manufacturer ?? null,
      capture_methods: input.captureMethods,
      identifier_field_key: input.identifierFieldKey,
      fields: input.fields,
      prompt_instructions: input.promptInstructions ?? null,
      quirks: input.quirks,
    },
  });
}

export async function listMachineTemplatesAdmin(): Promise<MachineTemplate[]> {
  return request<MachineTemplate[]>("/api/admin/machine-templates");
}

export async function createMachineAdmin(input: {
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

export async function listMachinesAdmin(clientId?: number): Promise<Machine[]> {
  const query = clientId != null ? `?client_id=${clientId}` : "";
  return request<Machine[]>(`/api/admin/machines${query}`);
}

// --- Client: asset classes / machine templates (read-only reference data) ------

export async function getAssetClasses(): Promise<AssetClass[]> {
  return request<AssetClass[]>("/api/asset-classes");
}

export async function getMachineTemplates(assetClassId?: string): Promise<MachineTemplate[]> {
  const query = assetClassId ? `?asset_class_id=${encodeURIComponent(assetClassId)}` : "";
  return request<MachineTemplate[]>(`/api/machine-templates${query}`);
}

// --- Client: machines (own only) -------------------------------------------------

export async function getMyMachines(): Promise<Machine[]> {
  return request<Machine[]>("/api/machines");
}

export async function createMachine(
  templateId: number,
  name: string,
  identifierValue: string
): Promise<Machine> {
  return request<Machine>("/api/machines", {
    method: "POST",
    body: { template_id: templateId, name, identifier_value: identifierValue },
  });
}

// --- Client: scan (single + batch) ------------------------------------------------

export async function scanOne(
  file: File,
  options: { assetClassId?: string; machineId?: number } = {}
): Promise<ScanResult> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  if (options.assetClassId) params.set("asset_class_id", options.assetClassId);
  if (options.machineId != null) params.set("machine_id", String(options.machineId));
  const query = params.toString() ? `?${params.toString()}` : "";

  return requestFormData<ScanResult>(`/api/scan${query}`, formData, 90_000);
}

export async function scanBatch(
  files: File[],
  options: { assetClassId?: string } = {}
): Promise<BatchScanResponse> {
  const formData = new FormData();
  for (const file of files) formData.append("files", file);

  const params = new URLSearchParams();
  if (options.assetClassId) params.set("asset_class_id", options.assetClassId);
  const query = params.toString() ? `?${params.toString()}` : "";

  return requestFormData<BatchScanResponse>(`/api/scan/batch${query}`, formData, 180_000);
}

// --- Client: readings --------------------------------------------------------------

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

export async function getMyReadings(machineId?: number): Promise<Reading[]> {
  const query = machineId != null ? `?machine_id=${machineId}` : "";
  return request<Reading[]>(`/api/readings${query}`);
}
