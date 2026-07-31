"""Multi-tenant IoT monitoring API.

Flow: an authenticated client uploads a scan -> OCR -> auto-detect which of
their own registered machines it belongs to (matching.py, by identifier value)
-> template-driven field extraction (llm_parser.py, schema comes from the
matched machine's MachineTemplate) -> reviewed client-side -> persisted as a
Reading via POST /api/readings.
"""

from __future__ import annotations

import asyncio
import logging
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import auth
import models
import schemas
from db import Base, SessionLocal, engine, get_db
from llm_parser import LlmError, LlmParseError, parse_document
from matching import find_matching_machines
from vision_ocr import OcrError, prepare_images, run_ocr

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("iot_backend")

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
MAX_BATCH_FILES = int(os.getenv("MAX_BATCH_FILES", "10"))
# Kept low deliberately: Groq's free tier caps at 12,000 tokens/minute and one
# extraction uses roughly 2,000-2,200 of them - a handful of concurrent scans
# can exhaust the whole budget in a single burst before any of them lands.
BATCH_CONCURRENCY = int(os.getenv("BATCH_CONCURRENCY", "2"))


def _allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(
    title="Multi-Asset IoT Monitoring API",
    description="Multi-tenant client/machine/reading platform with template-driven OCR extraction.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


def _error(status_code: int, message: str, **extra) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": message, **extra})


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "vision_key_configured": bool(os.getenv("GOOGLE_CLOUD_VISION_API_KEY")),
        "groq_key_configured": bool(os.getenv("GROQ_API_KEY")),
        "max_upload_mb": MAX_UPLOAD_MB,
        "max_batch_files": MAX_BATCH_FILES,
    }


# --- Auth ---------------------------------------------------------------


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = auth.create_access_token(user)
    return schemas.TokenResponse(access_token=token, role=user.role, client_id=user.client_id)


@app.get("/api/auth/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(auth.get_current_user)):
    return user


# --- Admin: clients -------------------------------------------------------


@app.post("/api/admin/clients", response_model=schemas.ClientOut)
def create_client(
    payload: schemas.ClientCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    client = models.Client(name=payload.name)
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@app.get("/api/admin/clients", response_model=list[schemas.ClientOut])
def list_clients(db: Session = Depends(get_db), _admin: models.User = Depends(auth.require_admin)):
    return db.query(models.Client).order_by(models.Client.created_at.desc()).all()


# --- Admin: users (client logins) ----------------------------------------


@app.post("/api/admin/users", response_model=schemas.UserOut)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    if payload.role not in {"admin", "client"}:
        raise HTTPException(status_code=400, detail="role must be 'admin' or 'client'.")
    if payload.role == "client" and payload.client_id is None:
        raise HTTPException(status_code=400, detail="client_id is required for role 'client'.")
    if payload.client_id is not None and not db.get(models.Client, payload.client_id):
        raise HTTPException(status_code=404, detail="Unknown client_id.")
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="A user with that email already exists.")

    user = models.User(
        email=payload.email,
        password_hash=auth.hash_password(payload.password),
        role=payload.role,
        client_id=payload.client_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# --- Admin: asset classes (read-only, seeded) -----------------------------


@app.get("/api/admin/asset-classes", response_model=list[schemas.AssetClassOut])
def list_asset_classes_admin(
    db: Session = Depends(get_db), _admin: models.User = Depends(auth.require_admin)
):
    return db.query(models.AssetClass).all()


# --- Admin: machine templates ----------------------------------------------


@app.post("/api/admin/machine-templates", response_model=schemas.MachineTemplateOut)
def create_machine_template(
    payload: schemas.MachineTemplateCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    if not db.get(models.AssetClass, payload.asset_class_id):
        raise HTTPException(status_code=404, detail="Unknown asset_class_id.")

    field_keys = {f.key for f in payload.fields}
    if payload.identifier_field_key not in field_keys:
        raise HTTPException(
            status_code=400, detail="identifier_field_key must be one of the template's fields."
        )

    template = models.MachineTemplate(
        asset_class_id=payload.asset_class_id,
        name=payload.name,
        manufacturer=payload.manufacturer,
        capture_methods=payload.capture_methods,
        identifier_field_key=payload.identifier_field_key,
        fields=[f.model_dump() for f in payload.fields],
        prompt_instructions=payload.prompt_instructions,
        quirks=payload.quirks,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@app.get("/api/admin/machine-templates", response_model=list[schemas.MachineTemplateOut])
def list_machine_templates_admin(
    db: Session = Depends(get_db), _admin: models.User = Depends(auth.require_admin)
):
    return db.query(models.MachineTemplate).all()


# --- Admin: machines (assign to any client) -------------------------------


def _create_machine(db: Session, client_id: int, payload: schemas.MachineCreate) -> models.Machine:
    template = db.get(models.MachineTemplate, payload.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Unknown template_id.")
    if not db.get(models.Client, client_id):
        raise HTTPException(status_code=404, detail="Unknown client_id.")

    machine = models.Machine(
        client_id=client_id,
        template_id=payload.template_id,
        name=payload.name,
        identifier_value=payload.identifier_value,
    )
    db.add(machine)
    db.commit()
    db.refresh(machine)
    return machine


@app.post("/api/admin/machines", response_model=schemas.MachineOut)
def create_machine_admin(
    payload: schemas.MachineCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    if payload.client_id is None:
        raise HTTPException(status_code=400, detail="client_id is required.")
    return _create_machine(db, client_id=payload.client_id, payload=payload)


@app.get("/api/admin/machines", response_model=list[schemas.MachineOut])
def list_machines_admin(
    client_id: int | None = Query(None),
    db: Session = Depends(get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    query = db.query(models.Machine)
    if client_id is not None:
        query = query.filter(models.Machine.client_id == client_id)
    return query.all()


# --- Client: asset classes + templates (read-only, for building forms) ---


@app.get("/api/asset-classes", response_model=list[schemas.AssetClassOut])
def list_asset_classes(
    db: Session = Depends(get_db), _client: models.User = Depends(auth.require_client)
):
    return db.query(models.AssetClass).all()


@app.get("/api/machine-templates", response_model=list[schemas.MachineTemplateOut])
def list_machine_templates(
    asset_class_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _client: models.User = Depends(auth.require_client),
):
    query = db.query(models.MachineTemplate)
    if asset_class_id:
        query = query.filter(models.MachineTemplate.asset_class_id == asset_class_id)
    return query.all()


# --- Client: machines (own only) ------------------------------------------


@app.get("/api/machines", response_model=list[schemas.MachineOut])
def list_my_machines(
    db: Session = Depends(get_db), client: models.User = Depends(auth.require_client)
):
    return db.query(models.Machine).filter(models.Machine.client_id == client.client_id).all()


@app.post("/api/machines", response_model=schemas.MachineOut)
def create_my_machine(
    payload: schemas.MachineCreate,
    db: Session = Depends(get_db),
    client: models.User = Depends(auth.require_client),
):
    return _create_machine(db, client_id=client.client_id, payload=payload)


# --- Client: scan (OCR + auto-detect + template-driven extraction) -------


async def _process_one_scan(
    db: Session,
    client_id: int,
    filename: str,
    content_type: str | None,
    file_bytes: bytes,
    asset_class_id: str | None,
    machine_id: int | None,
) -> tuple[int, dict]:
    """Validate, OCR, auto-detect and extract a single scanned document.

    Returns `(200, payload)` for every non-error outcome - including the
    "couldn't tell which machine" cases (`status: "ambiguous"|"no_match"`) -
    or `(error_status, {"detail": ..., "raw_text"?: ...})` on failure. Shared
    by the single-file and batch endpoints so validation and error wording
    cannot drift apart between them.
    """
    extension = os.path.splitext(filename)[1].lower()
    normalized_type = (content_type or "").split(";")[0].strip().lower()

    if normalized_type not in ALLOWED_MIME_TYPES:
        if extension not in ALLOWED_EXTENSIONS:
            return 415, {
                "detail": f"Unsupported file type '{normalized_type or extension or 'unknown'}'. "
                "Please upload a JPG, PNG, WEBP or PDF."
            }
        normalized_type = "application/pdf" if extension == ".pdf" else "image/jpeg"
    if normalized_type == "image/jpg":
        normalized_type = "image/jpeg"

    if not file_bytes:
        return 400, {"detail": "The uploaded file is empty."}
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        actual_mb = len(file_bytes) / (1024 * 1024)
        return 413, {
            "detail": f"File is {actual_mb:.1f}MB, which exceeds the {MAX_UPLOAD_MB}MB limit."
        }

    try:
        images = prepare_images(file_bytes, normalized_type)
    except OcrError as exc:
        return 400, {"detail": str(exc)}
    if not images:
        return 400, {"detail": "Could not read any pages or images from that file."}

    try:
        ocr_text = await run_ocr(images)
    except OcrError as exc:
        logger.error("OCR failed for %s: %s", filename, exc)
        return 502, {"detail": f"Text extraction failed. {exc}"}

    if not ocr_text.strip():
        return 422, {
            "detail": "No readable text was found in that file. Try a sharper, well-lit photo.",
            "raw_text": "",
        }

    if machine_id is not None:
        machine = (
            db.query(models.Machine)
            .filter(models.Machine.id == machine_id, models.Machine.client_id == client_id)
            .first()
        )
        if not machine:
            return 404, {"detail": "Unknown machine_id for this client."}
    else:
        candidates_query = db.query(models.Machine).filter(models.Machine.client_id == client_id)
        if asset_class_id:
            candidates_query = candidates_query.join(models.MachineTemplate).filter(
                models.MachineTemplate.asset_class_id == asset_class_id
            )
        candidates = candidates_query.all()
        matches = find_matching_machines(candidates, ocr_text)

        if len(matches) != 1:
            return 200, {
                "status": "ambiguous" if len(matches) > 1 else "no_match",
                "candidates": [
                    schemas.MachineOut.model_validate(m).model_dump(mode="json")
                    for m in (matches or candidates)
                ],
                "raw_text": ocr_text,
            }
        machine = matches[0]

    template = machine.template
    try:
        extracted = await parse_document(
            ocr_text,
            fields=template.fields,
            prompt_instructions=template.prompt_instructions,
            quirks=template.quirks,
        )
    except LlmParseError as exc:
        logger.error("LLM parse failed for %s: %s", filename, exc)
        return 422, {
            "detail": "We read the document but could not structure the fields automatically.",
            "raw_text": ocr_text,
        }
    except LlmError as exc:
        logger.error("LLM call failed for %s: %s", filename, exc)
        return 502, {"detail": f"Field extraction failed. {exc}", "raw_text": ocr_text}

    confidence_flags = extracted.pop("confidence_flags", {})
    return 200, {
        "status": "matched",
        "machine": schemas.MachineOut.model_validate(machine).model_dump(mode="json"),
        "fields": extracted,
        "confidence_flags": confidence_flags,
        "raw_text": ocr_text,
    }


@app.post("/api/scan")
async def scan(
    file: UploadFile = File(...),
    asset_class_id: str | None = Query(None),
    machine_id: int | None = Query(None),
    db: Session = Depends(get_db),
    client: models.User = Depends(auth.require_client),
):
    """Upload a scan for auto-detection (or pass `machine_id` to skip it).

    Returns `{"status": "matched", "machine": ..., "fields": ..., ...}` when a
    single machine was resolved, or `{"status": "ambiguous"|"no_match",
    "candidates": [...], "raw_text": ...}` when the caller should re-submit the
    same image with an explicit `machine_id` from those candidates.
    """
    filename = file.filename or "upload"
    file_bytes = await file.read()
    await file.close()

    status_code, payload = await _process_one_scan(
        db, client.client_id, filename, file.content_type, file_bytes, asset_class_id, machine_id
    )
    if status_code == 200:
        return payload
    return JSONResponse(status_code=status_code, content=payload)


@app.post("/api/scan/batch")
async def scan_batch(
    files: list[UploadFile] = File(...),
    asset_class_id: str | None = Query(None),
    client: models.User = Depends(auth.require_client),
):
    """Scan up to `MAX_BATCH_FILES` documents in one request.

    Always responds 200 with a per-file result, so one bad photo in a batch
    never discards the rest:
    ```
    {"results": [{"index": 0, "filename": "...", "status": "matched"|"ambiguous"|"no_match"|"error", ...}],
     "matched": N, "unresolved": N, "failed": N}
    ```
    Auto-detection is scoped to `asset_class_id` if given, else across all of
    the client's machines. Nothing is persisted here - review client-side and
    call POST /api/readings per accepted item, same as the single-file flow.
    """
    if not files:
        return _error(400, "No files were uploaded.")
    if len(files) > MAX_BATCH_FILES:
        return _error(
            413, f"{len(files)} files were sent, but the limit is {MAX_BATCH_FILES} per batch."
        )

    uploads: list[tuple[str, str | None, bytes]] = []
    for upload in files:
        uploads.append((upload.filename or "upload", upload.content_type, await upload.read()))
        await upload.close()

    semaphore = asyncio.Semaphore(max(1, BATCH_CONCURRENCY))
    client_id = client.client_id

    async def process(index: int, filename: str, content_type: str | None, data: bytes) -> dict:
        # Each concurrent task uses its own DB session - a SQLAlchemy Session
        # is not meant to be shared across tasks that can interleave.
        async with semaphore:
            db = SessionLocal()
            try:
                try:
                    status_code, payload = await _process_one_scan(
                        db, client_id, filename, content_type, data, asset_class_id, None
                    )
                except Exception as exc:  # noqa: BLE001 - one file must not sink the batch
                    logger.exception("Unexpected failure processing %s", filename)
                    return {
                        "index": index,
                        "filename": filename,
                        "status": "error",
                        "error": f"Unexpected error: {exc}",
                    }
            finally:
                db.close()

        if status_code == 200:
            result = {"index": index, "filename": filename, **payload}
            result.setdefault("status", "matched")
            return result

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
        "matched": sum(1 for item in ordered if item["status"] == "matched"),
        "unresolved": sum(1 for item in ordered if item["status"] in ("ambiguous", "no_match")),
        "failed": sum(1 for item in ordered if item["status"] == "error"),
    }


# --- Client: readings -------------------------------------------------------


@app.post("/api/readings", response_model=schemas.ReadingOut)
def create_reading(
    payload: schemas.ReadingCreate,
    db: Session = Depends(get_db),
    client: models.User = Depends(auth.require_client),
):
    machine = (
        db.query(models.Machine)
        .filter(
            models.Machine.id == payload.machine_id, models.Machine.client_id == client.client_id
        )
        .first()
    )
    if not machine:
        raise HTTPException(status_code=404, detail="Unknown machine_id for this client.")

    reading = models.Reading(
        machine_id=payload.machine_id,
        captured_by_user_id=client.id,
        capture_method=payload.capture_method,
        fields=payload.fields,
        confidence_flags=payload.confidence_flags,
        raw_text=payload.raw_text,
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


@app.get("/api/readings", response_model=list[schemas.ReadingOut])
def list_my_readings(
    machine_id: int | None = Query(None),
    db: Session = Depends(get_db),
    client: models.User = Depends(auth.require_client),
):
    query = (
        db.query(models.Reading)
        .join(models.Machine)
        .filter(models.Machine.client_id == client.client_id)
    )
    if machine_id is not None:
        query = query.filter(models.Reading.machine_id == machine_id)
    return query.order_by(models.Reading.captured_at.desc()).all()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
