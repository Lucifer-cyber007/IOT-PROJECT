"""Multi-tenant IoT monitoring API.

Flow: an authenticated client uploads a scan -> OCR -> auto-detect which of
their own registered machines it belongs to (matching.py, by identifier value)
-> template-driven field extraction (llm_parser.py, schema comes from the
matched machine's MachineTemplate) -> reviewed client-side -> persisted as a
Reading via POST /api/readings.
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
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

# Analytics: how much a numeric field can move between consecutive readings on the
# same machine before it's flagged as an anomaly, and how many days without a new
# reading before a machine counts as "overdue" on the dashboard.
ANOMALY_THRESHOLD_PCT = float(os.getenv("ANOMALY_THRESHOLD_PCT", "25"))
OVERDUE_DAYS = int(os.getenv("OVERDUE_DAYS", "14"))


def _parse_numeric(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


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
    if user.status == "suspended":
        raise HTTPException(status_code=403, detail="This account has been suspended.")
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


@app.get("/api/admin/dashboard/summary", response_model=schemas.AdminDashboardSummary)
def get_admin_dashboard_summary(
    db: Session = Depends(get_db), _admin: models.User = Depends(auth.require_admin)
):
    now = datetime.now(timezone.utc)
    clients = db.query(models.Client).all()
    per_client: list[schemas.ClientBreakdown] = []
    total_machines = 0
    total_readings = 0
    for client in clients:
        machine_count = db.query(models.Machine).filter(models.Machine.client_id == client.id).count()
        reading_count = (
            db.query(models.Reading)
            .join(models.Machine)
            .filter(models.Machine.client_id == client.id)
            .count()
        )
        total_machines += machine_count
        total_readings += reading_count
        per_client.append(
            schemas.ClientBreakdown(
                client_id=client.id, name=client.name, machine_count=machine_count, reading_count=reading_count
            )
        )

    readings_this_week = db.query(models.Reading).filter(
        models.Reading.captured_at >= now - timedelta(days=7)
    ).count()

    return schemas.AdminDashboardSummary(
        total_clients=len(clients),
        total_machines=total_machines,
        total_readings=total_readings,
        readings_this_week=readings_this_week,
        per_client=per_client,
    )


# --- Admin: users (client logins) ----------------------------------------


@app.post("/api/admin/users", response_model=schemas.UserOut)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    if payload.role not in {"admin", "client_admin", "technician"}:
        raise HTTPException(
            status_code=400, detail="role must be 'admin', 'client_admin' or 'technician'."
        )
    if payload.role in ("client_admin", "technician") and payload.client_id is None:
        raise HTTPException(status_code=400, detail=f"client_id is required for role '{payload.role}'.")
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
    db: Session = Depends(get_db), _member: models.User = Depends(auth.require_org_member)
):
    return db.query(models.AssetClass).all()


@app.get("/api/machine-templates", response_model=list[schemas.MachineTemplateOut])
def list_machine_templates(
    asset_class_id: str | None = Query(None),
    db: Session = Depends(get_db),
    _member: models.User = Depends(auth.require_org_member),
):
    query = db.query(models.MachineTemplate)
    if asset_class_id:
        query = query.filter(models.MachineTemplate.asset_class_id == asset_class_id)
    return query.all()


# --- Client: machines (own client, scoped further for technicians) --------


@app.get("/api/machines", response_model=list[schemas.MachineOut])
def list_my_machines(
    db: Session = Depends(get_db), member: models.User = Depends(auth.require_org_member)
):
    query = db.query(models.Machine).filter(models.Machine.client_id == member.client_id)
    accessible = auth.accessible_machine_ids(db, member)
    if accessible is not None:
        query = query.filter(models.Machine.id.in_(accessible))
    return query.all()


@app.post("/api/machines", response_model=schemas.MachineOut)
def create_my_machine(
    payload: schemas.MachineCreate,
    db: Session = Depends(get_db),
    client_admin: models.User = Depends(auth.require_client_admin),
):
    return _create_machine(db, client_id=client_admin.client_id, payload=payload)


# --- Client: scan (OCR + auto-detect + template-driven extraction) -------


async def _process_one_scan(
    db: Session,
    client_id: int,
    accessible_ids: set[int] | None,
    filename: str,
    content_type: str | None,
    file_bytes: bytes,
    asset_class_id: str | None,
    machine_id: int | None,
) -> tuple[int, dict]:
    """Validate, OCR, auto-detect and extract a single scanned document.

    `accessible_ids` is `None` for a client_admin (every machine in the client
    is fair game) or a technician's specific assigned-machine-id set - narrows
    both the explicit `machine_id` lookup and the auto-detect candidate pool.

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
        logger.warning("Could not read pages from %s: %s", filename, exc)
        return 400, {"detail": "Could not read that file. Make sure it's a valid image or PDF."}
    if not images:
        return 400, {"detail": "Could not read any pages or images from that file."}

    try:
        ocr_text = await run_ocr(images)
    except OcrError as exc:
        # exc may embed the upstream Vision API's raw error text - log it for
        # debugging, but never echo upstream/internal detail back to the client.
        logger.error("OCR failed for %s: %s", filename, exc)
        return 502, {"detail": "Text extraction failed. Please try again in a moment."}

    if not ocr_text.strip():
        return 422, {
            "detail": "No readable text was found in that file. Try a sharper, well-lit photo.",
            "raw_text": "",
        }

    if machine_id is not None:
        if accessible_ids is not None and machine_id not in accessible_ids:
            return 404, {"detail": "Unknown machine_id for this client."}
        machine = (
            db.query(models.Machine)
            .filter(models.Machine.id == machine_id, models.Machine.client_id == client_id)
            .first()
        )
        if not machine:
            return 404, {"detail": "Unknown machine_id for this client."}
    else:
        candidates_query = db.query(models.Machine).filter(models.Machine.client_id == client_id)
        if accessible_ids is not None:
            candidates_query = candidates_query.filter(models.Machine.id.in_(accessible_ids))
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
        # exc may embed raw upstream Groq response text - log it for debugging,
        # but never echo upstream/internal detail back to the client.
        logger.error("LLM call failed for %s: %s", filename, exc)
        return 502, {
            "detail": "Field extraction failed. Please try again in a moment.",
            "raw_text": ocr_text,
        }

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
    member: models.User = Depends(auth.require_org_member),
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

    accessible_ids = auth.accessible_machine_ids(db, member)
    status_code, payload = await _process_one_scan(
        db,
        member.client_id,
        accessible_ids,
        filename,
        file.content_type,
        file_bytes,
        asset_class_id,
        machine_id,
    )
    if status_code == 200:
        return payload
    return JSONResponse(status_code=status_code, content=payload)


@app.post("/api/scan/batch")
async def scan_batch(
    files: list[UploadFile] = File(...),
    asset_class_id: str | None = Query(None),
    db: Session = Depends(get_db),
    member: models.User = Depends(auth.require_org_member),
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
    client_id = member.client_id
    accessible_ids = auth.accessible_machine_ids(db, member)

    async def process(index: int, filename: str, content_type: str | None, data: bytes) -> dict:
        # Each concurrent task uses its own DB session - a SQLAlchemy Session
        # is not meant to be shared across tasks that can interleave.
        async with semaphore:
            task_db = SessionLocal()
            try:
                try:
                    status_code, payload = await _process_one_scan(
                        task_db,
                        client_id,
                        accessible_ids,
                        filename,
                        content_type,
                        data,
                        asset_class_id,
                        None,
                    )
                except Exception:  # noqa: BLE001 - one file must not sink the batch
                    # Full exception (may include internals like DB/query details)
                    # goes to the server log only - never back to the client.
                    logger.exception("Unexpected failure processing %s", filename)
                    return {
                        "index": index,
                        "filename": filename,
                        "status": "error",
                        "error": "Unexpected error while processing this file.",
                    }
            finally:
                task_db.close()

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
    member: models.User = Depends(auth.require_org_member),
):
    query = db.query(models.Machine).filter(
        models.Machine.id == payload.machine_id, models.Machine.client_id == member.client_id
    )
    accessible = auth.accessible_machine_ids(db, member)
    if accessible is not None:
        query = query.filter(models.Machine.id.in_(accessible))
    machine = query.first()
    if not machine:
        raise HTTPException(status_code=404, detail="Unknown machine_id for this client.")

    reading = models.Reading(
        machine_id=payload.machine_id,
        captured_by_user_id=member.id,
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
    technician_id: int | None = Query(None),
    db: Session = Depends(get_db),
    member: models.User = Depends(auth.require_org_member),
):
    query = (
        db.query(models.Reading)
        .join(models.Machine)
        .filter(models.Machine.client_id == member.client_id)
    )
    if member.role == "technician":
        # Technicians only ever see their own submissions, never the org's.
        query = query.filter(models.Reading.captured_by_user_id == member.id)
    elif technician_id is not None:
        query = query.filter(models.Reading.captured_by_user_id == technician_id)
    if machine_id is not None:
        query = query.filter(models.Reading.machine_id == machine_id)
    return query.order_by(models.Reading.captured_at.desc()).all()


# --- Client: analytics dashboard --------------------------------------------


def _numeric_fields(template: models.MachineTemplate) -> list[dict]:
    return [f for f in template.fields if f.get("normalizer_type") == "number"]


@app.get("/api/machines/{machine_id}/trend", response_model=schemas.MachineTrend)
def get_machine_trend(
    machine_id: int,
    field: str = Query(...),
    db: Session = Depends(get_db),
    member: models.User = Depends(auth.require_org_member),
):
    query = db.query(models.Machine).filter(
        models.Machine.id == machine_id, models.Machine.client_id == member.client_id
    )
    accessible = auth.accessible_machine_ids(db, member)
    if accessible is not None:
        query = query.filter(models.Machine.id.in_(accessible))
    machine = query.first()
    if not machine:
        raise HTTPException(status_code=404, detail="Unknown machine_id for this client.")

    field_schema = next((f for f in _numeric_fields(machine.template) if f["key"] == field), None)
    if not field_schema:
        raise HTTPException(status_code=400, detail="That field isn't a numeric field on this machine.")

    readings = (
        db.query(models.Reading)
        .filter(models.Reading.machine_id == machine_id)
        .order_by(models.Reading.captured_at.asc())
        .all()
    )

    points: list[schemas.TrendPoint] = []
    previous: float | None = None
    for reading in readings:
        value = _parse_numeric(reading.fields.get(field))
        if value is None:
            continue
        is_anomaly = (
            previous is not None
            and previous != 0
            and abs(value - previous) / abs(previous) * 100 > ANOMALY_THRESHOLD_PCT
        )
        points.append(
            schemas.TrendPoint(captured_at=reading.captured_at, value=value, is_anomaly=is_anomaly)
        )
        previous = value

    return schemas.MachineTrend(field_key=field, field_label=field_schema["label"], points=points)


def _recent_anomalies_for_client(db: Session, client_id: int) -> list[schemas.AnomalyFlag]:
    machines = db.query(models.Machine).filter(models.Machine.client_id == client_id).all()
    flags: list[schemas.AnomalyFlag] = []
    for machine in machines:
        for field_schema in _numeric_fields(machine.template):
            key = field_schema["key"]
            last_two = (
                db.query(models.Reading)
                .filter(models.Reading.machine_id == machine.id)
                .order_by(models.Reading.captured_at.desc())
                .limit(2)
                .all()
            )
            if len(last_two) < 2:
                continue
            latest, previous = last_two
            latest_value = _parse_numeric(latest.fields.get(key))
            previous_value = _parse_numeric(previous.fields.get(key))
            if latest_value is None or previous_value is None or previous_value == 0:
                continue
            if abs(latest_value - previous_value) / abs(previous_value) * 100 > ANOMALY_THRESHOLD_PCT:
                flags.append(
                    schemas.AnomalyFlag(
                        machine_id=machine.id,
                        machine_name=machine.name,
                        field_label=field_schema["label"],
                        captured_at=latest.captured_at,
                        value=latest_value,
                        previous_value=previous_value,
                    )
                )
    flags.sort(key=lambda f: f.captured_at, reverse=True)
    return flags


@app.get("/api/dashboard/summary", response_model=schemas.DashboardSummary)
def get_dashboard_summary(
    db: Session = Depends(get_db), client_admin: models.User = Depends(auth.require_client_admin)
):
    now = datetime.now(timezone.utc)
    machines = db.query(models.Machine).filter(models.Machine.client_id == client_admin.client_id).all()
    technician_count = (
        db.query(models.User)
        .filter(models.User.client_id == client_admin.client_id, models.User.role == "technician")
        .count()
    )

    overdue: list[schemas.OverdueMachine] = []
    for machine in machines:
        last = (
            db.query(models.Reading)
            .filter(models.Reading.machine_id == machine.id)
            .order_by(models.Reading.captured_at.desc())
            .first()
        )
        last_at = last.captured_at if last else None
        if last_at is None or (now - last_at.replace(tzinfo=timezone.utc)) > timedelta(days=OVERDUE_DAYS):
            overdue.append(
                schemas.OverdueMachine(machine_id=machine.id, name=machine.name, last_reading_at=last_at)
            )

    readings_base = (
        db.query(models.Reading)
        .join(models.Machine)
        .filter(models.Machine.client_id == client_admin.client_id)
    )
    readings_this_week = readings_base.filter(
        models.Reading.captured_at >= now - timedelta(days=7)
    ).count()
    readings_this_month = readings_base.filter(
        models.Reading.captured_at >= now - timedelta(days=30)
    ).count()

    return schemas.DashboardSummary(
        total_machines=len(machines),
        technician_count=technician_count,
        readings_this_week=readings_this_week,
        readings_this_month=readings_this_month,
        overdue_machines=overdue,
        recent_anomalies=_recent_anomalies_for_client(db, client_admin.client_id),
    )


@app.get("/api/readings/export")
def export_readings(
    format: str = Query("csv"),
    machine_id: int | None = Query(None),
    technician_id: int | None = Query(None),
    asset_class_id: str | None = Query(None),
    date_from: datetime | None = Query(None),
    date_to: datetime | None = Query(None),
    db: Session = Depends(get_db),
    member: models.User = Depends(auth.require_org_member),
):
    if format != "csv":
        raise HTTPException(status_code=400, detail="Only format=csv is supported.")

    query = (
        db.query(models.Reading)
        .join(models.Machine)
        .filter(models.Machine.client_id == member.client_id)
    )
    if member.role == "technician":
        query = query.filter(models.Reading.captured_by_user_id == member.id)
    elif technician_id is not None:
        query = query.filter(models.Reading.captured_by_user_id == technician_id)
    accessible = auth.accessible_machine_ids(db, member)
    if accessible is not None:
        query = query.filter(models.Machine.id.in_(accessible))
    if machine_id is not None:
        query = query.filter(models.Reading.machine_id == machine_id)
    if asset_class_id:
        query = query.join(models.MachineTemplate).filter(
            models.MachineTemplate.asset_class_id == asset_class_id
        )
    if date_from is not None:
        query = query.filter(models.Reading.captured_at >= date_from)
    if date_to is not None:
        query = query.filter(models.Reading.captured_at <= date_to)

    readings = query.order_by(models.Reading.captured_at.desc()).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["reading_id", "machine_name", "asset_class", "captured_at", "capture_method", "field_label", "value"]
    )
    for reading in readings:
        machine = reading.machine
        field_labels = {f["key"]: f["label"] for f in machine.template.fields}
        for key, value in reading.fields.items():
            writer.writerow(
                [
                    reading.id,
                    machine.name,
                    machine.template.asset_class_id,
                    reading.captured_at.isoformat(),
                    reading.capture_method,
                    field_labels.get(key, key),
                    value,
                ]
            )

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=readings.csv"},
    )


# --- Client admin: account requests -----------------------------------------


@app.post("/api/requests", response_model=schemas.AccountRequestOut)
def create_account_request(
    payload: schemas.AccountRequestCreate,
    db: Session = Depends(get_db),
    client_admin: models.User = Depends(auth.require_client_admin),
):
    if payload.role not in ("client_admin", "technician"):
        raise HTTPException(
            status_code=400, detail="role must be 'client_admin' or 'technician'."
        )

    machine_ids: list[int] = []
    if payload.role == "technician" and payload.machine_ids:
        owned = (
            db.query(models.Machine.id)
            .filter(
                models.Machine.id.in_(payload.machine_ids),
                models.Machine.client_id == client_admin.client_id,
            )
            .all()
        )
        machine_ids = [mid for (mid,) in owned]
        if len(machine_ids) != len(set(payload.machine_ids)):
            raise HTTPException(
                status_code=400, detail="One or more machine_ids do not belong to your organization."
            )

    request = models.AccountRequest(
        client_id=client_admin.client_id,
        requested_by_user_id=client_admin.id,
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        role=payload.role,
        employee_id=payload.employee_id,
        department=payload.department,
        machine_ids=machine_ids,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@app.get("/api/requests", response_model=list[schemas.AccountRequestOut])
def list_my_requests(
    db: Session = Depends(get_db), client_admin: models.User = Depends(auth.require_client_admin)
):
    return (
        db.query(models.AccountRequest)
        .filter(models.AccountRequest.client_id == client_admin.client_id)
        .order_by(models.AccountRequest.created_at.desc())
        .all()
    )


# --- Client admin: technician roster + management ---------------------------


def _technician_out(db: Session, tech: models.User) -> schemas.TechnicianOut:
    machines = (
        db.query(models.Machine)
        .join(
            models.TechnicianMachineAccess,
            models.TechnicianMachineAccess.machine_id == models.Machine.id,
        )
        .filter(models.TechnicianMachineAccess.user_id == tech.id)
        .all()
    )
    readings = db.query(models.Reading).filter(models.Reading.captured_by_user_id == tech.id)
    reading_count = readings.count()
    last_reading = readings.order_by(models.Reading.captured_at.desc()).first()
    return schemas.TechnicianOut(
        id=tech.id,
        email=tech.email,
        status=tech.status,
        machines=[schemas.MachineOut.model_validate(m) for m in machines],
        reading_count=reading_count,
        last_reading_at=last_reading.captured_at if last_reading else None,
    )


@app.get("/api/technicians", response_model=list[schemas.TechnicianOut])
def list_technicians(
    db: Session = Depends(get_db), client_admin: models.User = Depends(auth.require_client_admin)
):
    technicians = (
        db.query(models.User)
        .filter(models.User.client_id == client_admin.client_id, models.User.role == "technician")
        .all()
    )
    return [_technician_out(db, tech) for tech in technicians]


def _get_org_technician(db: Session, client_admin: models.User, technician_id: int) -> models.User:
    technician = (
        db.query(models.User)
        .filter(
            models.User.id == technician_id,
            models.User.client_id == client_admin.client_id,
            models.User.role == "technician",
        )
        .first()
    )
    if not technician:
        raise HTTPException(status_code=404, detail="Unknown technician for this client.")
    return technician


@app.patch("/api/technicians/{technician_id}/machines", response_model=schemas.TechnicianOut)
def update_technician_machines(
    technician_id: int,
    payload: schemas.TechnicianMachinesUpdate,
    db: Session = Depends(get_db),
    client_admin: models.User = Depends(auth.require_client_admin),
):
    technician = _get_org_technician(db, client_admin, technician_id)

    owned = (
        db.query(models.Machine.id)
        .filter(
            models.Machine.id.in_(payload.machine_ids),
            models.Machine.client_id == client_admin.client_id,
        )
        .all()
    )
    owned_ids = {mid for (mid,) in owned}
    if owned_ids != set(payload.machine_ids):
        raise HTTPException(
            status_code=400, detail="One or more machine_ids do not belong to your organization."
        )

    db.query(models.TechnicianMachineAccess).filter(
        models.TechnicianMachineAccess.user_id == technician.id
    ).delete()
    for machine_id in owned_ids:
        db.add(models.TechnicianMachineAccess(user_id=technician.id, machine_id=machine_id))
    db.commit()

    return _technician_out(db, technician)


@app.patch("/api/technicians/{technician_id}/status", response_model=schemas.UserOut)
def update_technician_status(
    technician_id: int,
    payload: schemas.TechnicianStatusUpdate,
    db: Session = Depends(get_db),
    client_admin: models.User = Depends(auth.require_client_admin),
):
    if payload.status not in ("active", "suspended"):
        raise HTTPException(status_code=400, detail="status must be 'active' or 'suspended'.")
    technician = _get_org_technician(db, client_admin, technician_id)
    technician.status = payload.status
    db.commit()
    db.refresh(technician)
    return technician


# --- Admin: account request approval -----------------------------------------


@app.get("/api/admin/requests", response_model=list[schemas.AccountRequestOut])
def list_account_requests_admin(
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _admin: models.User = Depends(auth.require_admin),
):
    query = db.query(models.AccountRequest)
    if status_filter:
        query = query.filter(models.AccountRequest.status == status_filter)
    return query.order_by(models.AccountRequest.created_at.desc()).all()


@app.post("/api/admin/requests/{request_id}/approve", response_model=schemas.UserOut)
def approve_account_request(
    request_id: int,
    payload: schemas.AccountRequestApprove,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.require_admin),
):
    request = db.get(models.AccountRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Unknown request.")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="This request has already been decided.")
    if db.query(models.User).filter(models.User.email == request.email).first():
        raise HTTPException(status_code=409, detail="A user with that email already exists.")

    user = models.User(
        email=request.email,
        password_hash=auth.hash_password(payload.password),
        role=request.role,
        client_id=request.client_id,
    )
    db.add(user)
    db.flush()  # assign user.id before referencing it below

    if request.role == "technician":
        for machine_id in request.machine_ids:
            db.add(models.TechnicianMachineAccess(user_id=user.id, machine_id=machine_id))

    request.status = "approved"
    request.decided_by_user_id = admin.id
    request.decided_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)
    return user


@app.post("/api/admin/requests/{request_id}/reject", response_model=schemas.AccountRequestOut)
def reject_account_request(
    request_id: int,
    payload: schemas.AccountRequestReject,
    db: Session = Depends(get_db),
    admin: models.User = Depends(auth.require_admin),
):
    request = db.get(models.AccountRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Unknown request.")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="This request has already been decided.")

    request.status = "rejected"
    request.admin_note = payload.admin_note
    request.decided_by_user_id = admin.id
    request.decided_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(request)
    return request


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
