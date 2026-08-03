"""Pydantic request/response models for the API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


# --- Auth --------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    client_id: int | None = None


class UserCreate(BaseModel):
    email: str
    password: str
    role: str  # "admin" | "client_admin" | "technician"
    client_id: int | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: str
    client_id: int | None = None
    status: str = "active"


# --- Clients / asset classes ---------------------------------------------------


class ClientCreate(BaseModel):
    name: str


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: datetime


class AssetClassOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    label: str
    icon: str


# --- Machine templates ---------------------------------------------------------


class FieldSchema(BaseModel):
    key: str
    label: str
    placeholder: str = ""
    keyboard_type: str = "default"  # "default" | "numeric" | "decimal-pad"
    normalizer_type: str = "text"  # "text" | "digits" | "number" | "date"
    min_length: int | None = None
    max_length: int | None = None
    synonyms: list[str] = []


class MachineTemplateCreate(BaseModel):
    asset_class_id: str
    name: str
    manufacturer: str | None = None
    capture_methods: list[str] = ["manual"]
    identifier_field_key: str
    fields: list[FieldSchema]
    prompt_instructions: str | None = None
    quirks: list[str] = []


class MachineTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_class_id: str
    name: str
    manufacturer: str | None
    capture_methods: list[str]
    identifier_field_key: str
    fields: list[FieldSchema]
    prompt_instructions: str | None
    quirks: list[str]


# --- Machines --------------------------------------------------------------


class MachineCreate(BaseModel):
    template_id: int
    name: str
    identifier_value: str
    client_id: int | None = None  # admin only - ignored/forced for client-role callers


class MachineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    template_id: int
    name: str
    identifier_value: str
    created_at: datetime
    template: MachineTemplateOut


# --- Account requests / technicians -------------------------------------------


class AccountRequestCreate(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    role: str  # "client_admin" | "technician"
    employee_id: str | None = None
    department: str | None = None
    machine_ids: list[int] = []  # only meaningful when role == "technician"


class AccountRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_id: int
    requested_by_user_id: int
    full_name: str
    email: str
    phone: str | None
    role: str
    employee_id: str | None
    department: str | None
    machine_ids: list[int]
    status: str
    admin_note: str | None
    decided_by_user_id: int | None
    decided_at: datetime | None
    created_at: datetime


class AccountRequestApprove(BaseModel):
    password: str


class AccountRequestReject(BaseModel):
    admin_note: str


class TechnicianOut(BaseModel):
    id: int
    email: str
    status: str
    machines: list[MachineOut]
    reading_count: int
    last_reading_at: datetime | None


class TechnicianMachinesUpdate(BaseModel):
    machine_ids: list[int]


class TechnicianStatusUpdate(BaseModel):
    status: str  # "active" | "suspended"


# --- Dashboard / analytics ------------------------------------------------------


class TrendPoint(BaseModel):
    captured_at: datetime
    value: float
    is_anomaly: bool


class MachineTrend(BaseModel):
    field_key: str
    field_label: str
    points: list[TrendPoint]


class AnomalyFlag(BaseModel):
    machine_id: int
    machine_name: str
    field_label: str
    captured_at: datetime
    value: float
    previous_value: float


class OverdueMachine(BaseModel):
    machine_id: int
    name: str
    last_reading_at: datetime | None


class DashboardSummary(BaseModel):
    total_machines: int
    technician_count: int
    readings_this_week: int
    readings_this_month: int
    overdue_machines: list[OverdueMachine]
    recent_anomalies: list[AnomalyFlag]


class ClientBreakdown(BaseModel):
    client_id: int
    name: str
    machine_count: int
    reading_count: int


class AdminDashboardSummary(BaseModel):
    total_clients: int
    total_machines: int
    total_readings: int
    readings_this_week: int
    per_client: list[ClientBreakdown]


# --- Readings / scan ---------------------------------------------------------


class ReadingCreate(BaseModel):
    machine_id: int
    capture_method: str  # "ocr" | "manual"
    fields: dict[str, str | None]
    confidence_flags: dict[str, str] | None = None
    raw_text: str | None = None


class ReadingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    machine_id: int
    captured_at: datetime
    capture_method: str
    fields: dict[str, str | None]
    confidence_flags: dict[str, str] | None
    raw_text: str | None


class ScanMatched(BaseModel):
    status: str = "matched"
    machine: MachineOut
    fields: dict[str, str | None]
    confidence_flags: dict[str, str]
    raw_text: str


class ScanUnresolved(BaseModel):
    status: str  # "ambiguous" | "no_match"
    candidates: list[MachineOut]
    raw_text: str
