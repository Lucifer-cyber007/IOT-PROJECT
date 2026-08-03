import { clearSession, loadSession } from "./authStore";
import type { AssetClass, Machine, MachineTemplate, Reading } from "./types";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
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

/** A file chosen from the camera, the photo library or the document picker. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

export function describeApiBase(): string {
  return API_BASE_URL;
}

async function authHeader(): Promise<Record<string, string>> {
  const session = await loadSession();
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
    await clearSession();
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
  if (auth) Object.assign(headers, await authHeader());

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      `Could not reach the server at ${API_BASE_URL}.\n\nMake sure the backend is running and ` +
        `your phone is on the same Wi-Fi network.`,
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
  const headers = await authHeader();
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
      `Could not reach the server at ${API_BASE_URL}.\n\nMake sure the backend is running and ` +
        `your phone is on the same Wi-Fi network.`,
      0
    );
  } finally {
    clearTimeout(timeout);
  }

  return toResult<T>(response);
}

function toFormFile(file: PickedFile): Blob {
  // React Native's FormData takes this {uri, name, type} shape for file parts.
  return { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob;
}

export function guessMimeType(uri: string, provided?: string | null): string {
  if (provided && provided !== "application/octet-stream") return provided;
  const lower = uri.split("?")[0].toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function fileNameFrom(uri: string, fallback: string): string {
  const last = uri.split("?")[0].split("/").pop();
  return last && last.includes(".") ? last : fallback;
}

// --- Auth --------------------------------------------------------------------

export interface LoginResult {
  token: string;
  role: "admin" | "client_admin" | "technician";
  clientId: number | null;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const body = await request<{
    access_token: string;
    role: "admin" | "client_admin" | "technician";
    client_id: number | null;
  }>("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
  return { token: body.access_token, role: body.role, clientId: body.client_id };
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
  file: PickedFile,
  options: { assetClassId?: string; machineId?: number } = {}
): Promise<ScanResult> {
  const formData = new FormData();
  formData.append("file", toFormFile(file));

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
  files: PickedFile[],
  options: { assetClassId?: string } = {}
): Promise<BatchScanResult> {
  const formData = new FormData();
  for (const file of files) formData.append("files", toFormFile(file));

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

export async function getMyReadings(machineId?: number): Promise<Reading[]> {
  const query = machineId != null ? `?machine_id=${machineId}` : "";
  return request<Reading[]>(`/api/readings${query}`);
}
