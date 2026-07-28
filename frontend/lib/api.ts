import type { ExtractionResult } from "./types";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type ExtractOutcome =
  | { kind: "success"; data: ExtractionResult }
  /** OCR worked but the fields could not be structured — fall back to manual entry. */
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

export async function extractBill(
  file: File,
  signal?: AbortSignal
): Promise<ExtractOutcome> {
  const formData = new FormData();
  formData.append("file", file, file.name);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/extract`, {
      method: "POST",
      body: formData,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      `Could not reach the server at ${API_BASE_URL}. Check that the backend is running.`,
      0
    );
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (e.g. a proxy error page) — handled below.
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
          ? ((body as { raw_text: string }).raw_text)
          : "",
    };
  }

  if (!response.ok) {
    throw new ApiError(
      readDetail(body, `The server returned an error (HTTP ${response.status}).`),
      response.status
    );
  }

  return { kind: "success", data: body as ExtractionResult };
}
