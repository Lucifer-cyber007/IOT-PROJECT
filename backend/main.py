"""Electricity Bill Extractor - FastAPI backend.

Flow: upload -> (PDF rasterize) -> Google Cloud Vision OCR -> Vertex AI (Gemini)
field extraction -> JSON.
"""

from __future__ import annotations

import asyncio
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from excel_export import build_workbook
from llm_parser import FIELDS, LlmError, LlmParseError, parse_bill
from vision_ocr import OcrError, prepare_images, run_ocr

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("bill_extractor")

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
}

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "10"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Cap on files per batch request, and how many we OCR/parse at once.
#
# BATCH_CONCURRENCY defaults low and conservative: a freshly created GCP project
# often starts with a modest per-minute quota for a Gemini model on Vertex AI
# that only scales up with usage history, so a burst of concurrent requests can
# still trip a 429 on day one even though Vertex AI's ceiling is generally far
# higher than Groq's free tier once established. Raise this once you've
# confirmed your project's actual quota (Cloud Console -> IAM & Admin -> Quotas).
MAX_BATCH_FILES = int(os.getenv("MAX_BATCH_FILES", "25"))
BATCH_CONCURRENCY = int(os.getenv("BATCH_CONCURRENCY", "2"))
# Extra spacing between a batch's requests starting, on top of the concurrency
# cap above - smooths out the burst further so a wave of N requests doesn't
# all land on Vertex AI in the same instant.
BATCH_STAGGER_SECONDS = float(os.getenv("BATCH_STAGGER_SECONDS", "0.4"))

MOCK_RESPONSE = {
    "name": "RAMESH KUMAR S",
    "rr_number": "HB123456",
    "address": "No 42, 3rd Cross, Jayanagar 4th Block, Bengaluru 560011",
    "account_number": "1234567890",
    "units_consumed": "142",
    "amount_to_pay": "1245.60",
    "tariff": "LT-2(a)",
    "bill_date": "05-03-2024",
    "confidence_flags": {"account_number": "low_confidence"},
}


def _allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(
    title="Electricity Bill Extractor API",
    description="Extracts structured billing data from electricity bill images and PDFs.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _error(status: int, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": message, **extra})


def _is_mock_mode() -> bool:
    return os.getenv("MOCK_MODE", "0").strip().lower() in {"1", "true", "yes"}


def _normalize_content_type(filename: str, raw_content_type: str | None) -> str | None:
    """Resolve an upload's mime type, falling back to its extension.

    Returns None when the file type is not supported. Some browsers send
    application/octet-stream for camera captures, hence the extension fallback.
    """
    extension = os.path.splitext(filename)[1].lower()
    content_type = (raw_content_type or "").split(";")[0].strip().lower()

    if content_type not in ALLOWED_MIME_TYPES:
        if extension not in ALLOWED_EXTENSIONS:
            return None
        content_type = "application/pdf" if extension == ".pdf" else "image/jpeg"

    return "image/jpeg" if content_type == "image/jpg" else content_type


async def _run_pipeline(
    filename: str,
    raw_content_type: str | None,
    file_bytes: bytes,
    include_raw_text: bool = False,
) -> tuple[int, dict]:
    """Run one upload through the full pipeline.

    Returns an (http_status, payload) pair so both the single and batch endpoints
    can share exactly the same validation and error wording.
    """
    content_type = _normalize_content_type(filename, raw_content_type)
    if content_type is None:
        given = (raw_content_type or os.path.splitext(filename)[1] or "unknown").strip()
        return 415, {
            "detail": f"Unsupported file type '{given}'. Please upload a JPG, PNG, WEBP or PDF."
        }

    if not file_bytes:
        return 400, {"detail": "The uploaded file is empty."}

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        actual_mb = len(file_bytes) / (1024 * 1024)
        return 413, {
            "detail": (
                f"File is {actual_mb:.1f}MB, which exceeds the {MAX_UPLOAD_MB}MB limit. "
                "Try a smaller photo or a compressed PDF."
            )
        }

    if _is_mock_mode():
        logger.info("MOCK_MODE is on - returning mock data for %s", filename)
        return 200, dict(MOCK_RESPONSE)

    # 1. Normalize to image bytes (rasterizing PDFs in memory).
    try:
        images = prepare_images(file_bytes, content_type)
    except OcrError as exc:
        return 400, {"detail": str(exc)}

    if not images:
        return 400, {"detail": "Could not read any pages or images from that file."}

    # 2. OCR.
    try:
        ocr_text = await run_ocr(images)
    except OcrError as exc:
        logger.error("OCR failed for %s: %s", filename, exc)
        return 502, {"detail": f"Text extraction failed. {exc}"}

    if not ocr_text.strip():
        return 422, {
            "detail": (
                "No readable text was found in that file. "
                "Try a sharper, well-lit photo of the bill."
            ),
            "raw_text": "",
        }

    # 3. Structured field extraction.
    try:
        result = await parse_bill(ocr_text)
        if include_raw_text:
            result["raw_text"] = ocr_text
        return 200, result
    except LlmParseError as exc:
        logger.error("LLM parse failed for %s: %s", filename, exc)
        return 422, {
            "detail": (
                "We read the bill but could not structure the fields automatically. "
                "You can enter them manually below."
            ),
            "raw_text": ocr_text,
        }
    except LlmError as exc:
        logger.error("LLM call failed for %s: %s", filename, exc)
        return 502, {"detail": f"Field extraction failed. {exc}", "raw_text": ocr_text}


@app.get("/api/health")
async def health() -> dict:
    """Cheap readiness probe that also reports whether the app is configured to run.

    This does not verify the credentials actually work (e.g. a wrong project ID
    or a service account missing the Vertex AI User role) - only that the app
    has been given something to try. A real /api/extract call is the only way
    to confirm auth is actually valid.
    """
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    return {
        "status": "ok",
        "mock_mode": _is_mock_mode(),
        "vision_key_configured": bool(os.getenv("GOOGLE_CLOUD_VISION_API_KEY")),
        "vertex_project_configured": bool(os.getenv("VERTEX_PROJECT_ID")),
        "vertex_credentials_configured": bool(
            credentials_path and os.path.isfile(credentials_path)
        ),
        "max_upload_mb": MAX_UPLOAD_MB,
        "max_batch_files": MAX_BATCH_FILES,
    }


@app.post("/api/extract")
async def extract(file: UploadFile = File(...), include_raw_text: bool = False):
    """Extract structured billing fields from an uploaded bill image or PDF.

    Pass `?include_raw_text=1` to also get the raw OCR text back on success. The
    default response keeps strictly to the documented field schema; the flag is a
    diagnostic aid for when a field comes out wrong and you need to see what the
    OCR actually produced.
    """
    filename = file.filename or "upload"
    file_bytes = await file.read()
    await file.close()

    status, payload = await _run_pipeline(
        filename, file.content_type, file_bytes, include_raw_text
    )
    if status == 200:
        return payload
    return JSONResponse(status_code=status, content=payload)


@app.post("/api/extract-batch")
async def extract_batch(
    files: list[UploadFile] = File(...), include_raw_text: bool = False
):
    """Extract several bills in one request.

    Always responds 200 with a per-file result, so one bad photo in a batch of
    twenty never discards the nineteen that worked. Inspect each item's `status`.
    """
    if not files:
        return _error(400, "No files were uploaded.")

    if len(files) > MAX_BATCH_FILES:
        return _error(
            413,
            f"{len(files)} files were sent, but the limit is {MAX_BATCH_FILES} per batch.",
        )

    uploads: list[tuple[str, str | None, bytes]] = []
    for upload in files:
        uploads.append((upload.filename or "upload", upload.content_type, await upload.read()))
        await upload.close()

    semaphore = asyncio.Semaphore(max(1, BATCH_CONCURRENCY))

    async def process(index: int, filename: str, content_type: str | None, data: bytes) -> dict:
        # Stagger task starts so a large batch doesn't fire in simultaneous
        # waves of BATCH_CONCURRENCY requests - see BATCH_STAGGER_SECONDS above.
        await asyncio.sleep(index * BATCH_STAGGER_SECONDS)

        async with semaphore:
            try:
                status, payload = await _run_pipeline(
                    filename, content_type, data, include_raw_text
                )
            except Exception as exc:  # noqa: BLE001 - one file must not sink the batch
                logger.exception("Unexpected failure processing %s", filename)
                return {
                    "index": index,
                    "filename": filename,
                    "status": "error",
                    "error": f"Unexpected error: {exc}",
                }

        if status == 200:
            return {"index": index, "filename": filename, "status": "ok", "data": payload}

        return {
            "index": index,
            "filename": filename,
            "status": "error",
            "error": payload.get("detail", "Extraction failed."),
            "raw_text": payload.get("raw_text", ""),
        }

    results = await asyncio.gather(
        *(process(i, name, ctype, data) for i, (name, ctype, data) in enumerate(uploads))
    )
    ordered = sorted(results, key=lambda item: item["index"])

    return {
        "results": ordered,
        "succeeded": sum(1 for item in ordered if item["status"] == "ok"),
        "failed": sum(1 for item in ordered if item["status"] == "error"),
    }


@app.post("/api/export/xlsx")
async def export_xlsx(payload: dict):
    """Build an .xlsx workbook from rows of (possibly user-edited) bill fields.

    The frontend posts what is currently on screen rather than the original
    extraction, so manual corrections make it into the spreadsheet.
    """
    rows = payload.get("rows")
    if not isinstance(rows, list) or not rows:
        return _error(400, "Provide a non-empty 'rows' array to export.")

    cleaned: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        entry = {field: row.get(field) for field in FIELDS}
        entry["source_file"] = row.get("source_file")
        cleaned.append(entry)

    if not cleaned:
        return _error(400, "None of the supplied rows were valid objects.")

    filename = str(payload.get("filename") or "electricity-bills.xlsx")
    if not filename.lower().endswith(".xlsx"):
        filename += ".xlsx"

    return build_workbook(cleaned, filename)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
