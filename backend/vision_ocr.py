"""Google Cloud Vision OCR plus the PDF/image preparation helpers that feed it.

Everything here works on in-memory bytes; nothing touches the filesystem.
"""

from __future__ import annotations

import base64
import io
import logging
import os

import fitz  # PyMuPDF
import httpx
from PIL import Image

logger = logging.getLogger(__name__)

VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate"

# 300 DPI relative to PyMuPDF's default 72 DPI rendering.
PDF_RENDER_ZOOM = 300 / 72
MAX_PDF_PAGES = 2

# Vision caps a request at 20MB total; base64 inflates by ~33%, so keep each
# image well under that. Anything larger gets downscaled/re-encoded.
MAX_IMAGE_BYTES = 6 * 1024 * 1024
MAX_IMAGE_EDGE = 4000


class OcrError(RuntimeError):
    """Raised when Vision cannot be reached or returns an error payload."""


def _shrink_if_needed(image_bytes: bytes) -> bytes:
    """Downscale / re-encode an image that is too large for the Vision request."""
    if len(image_bytes) <= MAX_IMAGE_BYTES:
        return image_bytes

    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            img = img.convert("RGB")
            img.thumbnail((MAX_IMAGE_EDGE, MAX_IMAGE_EDGE), Image.LANCZOS)

            for quality in (90, 80, 70, 60):
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=quality, optimize=True)
                if buf.tell() <= MAX_IMAGE_BYTES:
                    return buf.getvalue()
            return buf.getvalue()
    except Exception:  # noqa: BLE001 - a bad re-encode shouldn't kill the request
        logger.warning("Could not re-encode oversized image, sending as-is", exc_info=True)
        return image_bytes


def pdf_to_images(pdf_bytes: bytes) -> list[bytes]:
    """Rasterize the first pages of a PDF to PNG bytes at ~300 DPI, in memory."""
    images: list[bytes] = []
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise OcrError(f"Could not read the PDF: {exc}") from exc

    with doc:
        if doc.page_count == 0:
            raise OcrError("The PDF has no pages.")

        matrix = fitz.Matrix(PDF_RENDER_ZOOM, PDF_RENDER_ZOOM)
        for page_index in range(min(doc.page_count, MAX_PDF_PAGES)):
            pixmap = doc.load_page(page_index).get_pixmap(matrix=matrix, alpha=False)
            images.append(_shrink_if_needed(pixmap.tobytes("png")))

    return images


def prepare_images(file_bytes: bytes, content_type: str) -> list[bytes]:
    """Turn an uploaded file into a list of image byte strings ready for OCR."""
    if content_type == "application/pdf":
        return pdf_to_images(file_bytes)
    return [_shrink_if_needed(file_bytes)]


async def run_ocr(images: list[bytes], api_key: str | None = None) -> str:
    """Send images to Vision DOCUMENT_TEXT_DETECTION and return the raw text.

    Multiple images (e.g. two PDF pages) go out in a single batch request and
    come back joined with a page separator.
    """
    api_key = api_key or os.getenv("GOOGLE_CLOUD_VISION_API_KEY")
    if not api_key:
        raise OcrError("GOOGLE_CLOUD_VISION_API_KEY is not set on the server.")

    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(img).decode("ascii")},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                "imageContext": {"languageHints": ["en"]},
            }
            for img in images
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                VISION_ENDPOINT, params={"key": api_key}, json=payload
            )
    except httpx.HTTPError as exc:
        raise OcrError(f"Could not reach Google Cloud Vision: {exc}") from exc

    if response.status_code != 200:
        detail = response.text[:500]
        raise OcrError(f"Vision API returned HTTP {response.status_code}: {detail}")

    body = response.json()
    pages: list[str] = []
    for index, item in enumerate(body.get("responses", [])):
        if "error" in item:
            message = item["error"].get("message", "unknown error")
            raise OcrError(f"Vision API error on page {index + 1}: {message}")

        text = (item.get("fullTextAnnotation") or {}).get("text", "")
        if text.strip():
            pages.append(text.strip())

    return "\n\n--- PAGE BREAK ---\n\n".join(pages)
