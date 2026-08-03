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
    role: str  # "admin" | "client"
    client_id: int | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: str
    client_id: int | None = None


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
