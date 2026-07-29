import type { ExtractionResult } from "./types";

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

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

export type ExtractOutcome =
  | { kind: "success"; data: ExtractionResult; rawText: string }
  /** OCR worked but the fields could not be structured - fall back to manual entry. */
  | { kind: "manual_fallback"; message: string; rawText: string };

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

export function describeApiBase(): string {
  return API_BASE_URL;
}

export async function extractBill(file: PickedFile): Promise<ExtractOutcome> {
  const formData = new FormData();
  // React Native's FormData takes this {uri, name, type} shape for file parts.
  formData.append("file", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  // React Native has no built-in request timeout, so drive one from an AbortController.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/extract?include_raw_text=1`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("The request timed out. Check your connection and try again.", 0);
    }
    throw new ApiError(
      `Could not reach the server at ${API_BASE_URL}.\n\nMake sure the backend is running with ` +
        `--host 0.0.0.0 and that your phone is on the same Wi-Fi network.`,
      0
    );
  } finally {
    clearTimeout(timeout);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. a proxy error page) - handled below.
  }

  if (response.status === 422) {
    return {
      kind: "manual_fallback",
      message: readDetail(
        body,
        "We could not structure the fields automatically. Please enter them manually."
      ),
      rawText:
        typeof (body as { raw_text?: unknown })?.raw_text === "string"
          ? (body as { raw_text: string }).raw_text
          : "",
    };
  }

  if (!response.ok) {
    throw new ApiError(
      readDetail(body, `The server returned an error (HTTP ${response.status}).`),
      response.status
    );
  }

  const { raw_text, ...data } = body as ExtractionResult & { raw_text?: string };
  return {
    kind: "success",
    data: data as ExtractionResult,
    rawText: typeof raw_text === "string" ? raw_text : "",
  };
}
