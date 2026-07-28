"""Electricity Bill Extractor - FastAPI backend.

Flow: upload -> (PDF rasterize) -> Google Cloud Vision OCR -> Groq field extraction -> JSON.
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from llm_parser import LlmError, LlmParseError, parse_bill
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
    version="1.0.0",
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


@app.get("/api/health")
async def health() -> dict:
    """Cheap readiness probe that also reports which API keys are configured."""
    return {
        "status": "ok",
        "mock_mode": _is_mock_mode(),
        "vision_key_configured": bool(os.getenv("GOOGLE_CLOUD_VISION_API_KEY")),
        "groq_key_configured": bool(os.getenv("GROQ_API_KEY")),
        "max_upload_mb": MAX_UPLOAD_MB,
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
    extension = os.path.splitext(filename)[1].lower()
    content_type = (file.content_type or "").split(";")[0].strip().lower()

    # Some browsers send application/octet-stream for camera captures, so fall
    # back to the extension before rejecting.
    if content_type not in ALLOWED_MIME_TYPES:
        if extension not in ALLOWED_EXTENSIONS:
            return _error(
                415,
                f"Unsupported file type '{content_type or extension or 'unknown'}'. "
                "Please upload a JPG, PNG, WEBP or PDF.",
            )
        content_type = "application/pdf" if extension == ".pdf" else "image/jpeg"

    if content_type == "image/jpg":
        content_type = "image/jpeg"

    file_bytes = await file.read()
    await file.close()

    if not file_bytes:
        return _error(400, "The uploaded file is empty.")

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        actual_mb = len(file_bytes) / (1024 * 1024)
        return _error(
            413,
            f"File is {actual_mb:.1f}MB, which exceeds the {MAX_UPLOAD_MB}MB limit. "
            "Try a smaller photo or a compressed PDF.",
        )

    if _is_mock_mode():
        logger.info("MOCK_MODE is on - returning mock data for %s", filename)
        return MOCK_RESPONSE

    # 1. Normalize to image bytes (rasterizing PDFs in memory).
    try:
        images = prepare_images(file_bytes, content_type)
    except OcrError as exc:
        return _error(400, str(exc))

    if not images:
        return _error(400, "Could not read any pages or images from that file.")

    # 2. OCR.
    try:
        ocr_text = await run_ocr(images)
    except OcrError as exc:
        logger.error("OCR failed for %s: %s", filename, exc)
        return _error(502, f"Text extraction failed. {exc}")

    if not ocr_text.strip():
        return _error(
            422,
            "No readable text was found in that file. Try a sharper, well-lit photo of the bill.",
            raw_text="",
        )

    # 3. Structured field extraction.
    try:
        result = await parse_bill(ocr_text)
        if include_raw_text:
            result["raw_text"] = ocr_text
        return result
    except LlmParseError as exc:
        logger.error("LLM parse failed for %s: %s", filename, exc)
        return _error(
            422,
            "We read the bill but could not structure the fields automatically. "
            "You can enter them manually below.",
            raw_text=ocr_text,
        )
    except LlmError as exc:
        logger.error("LLM call failed for %s: %s", filename, exc)
        return _error(502, f"Field extraction failed. {exc}", raw_text=ocr_text)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
