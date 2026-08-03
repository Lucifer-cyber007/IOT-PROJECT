"""ORM models for the multi-tenant client/machine/reading system."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    users: Mapped[list["User"]] = relationship(back_populates="client")
    machines: Mapped[list["Machine"]] = relationship(back_populates="client")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # "admin" | "client"
    role: Mapped[str] = mapped_column(String(20))
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    client: Mapped[Client | None] = relationship(back_populates="users")


class AssetClass(Base):
    """The 7 top-level categories (Energy Meters, HVAC, UPS, ...). Seeded once."""

    __tablename__ = "asset_classes"

    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    label: Mapped[str] = mapped_column(String(100))
    icon: Mapped[str] = mapped_column(String(10))

    templates: Mapped[list["MachineTemplate"]] = relationship(back_populates="asset_class")


class MachineTemplate(Base):
    """A reusable machine model/template (e.g. "APC Smart-UPS 3000").

    `fields` is the field schema: a JSON list of
    {key, label, placeholder, keyboard_type, normalizer_type, min_length?, max_length?, synonyms?}.
    `normalizer_type` is one of "text" | "digits" | "number" | "date" and drives both
    the dynamically-built extraction prompt and post-extraction validation.
    `identifier_field_key` names which field in `fields` holds the real-world
    identifier (serial/account/meter number) used to auto-detect a scanned machine.
    `prompt_instructions` is optional free-text appended to the generic auto-built
    prompt for templates that need extra extraction guidance.
    `quirks` is a list of named special-case post-processing hooks (see
    extraction.py's QUIRKS registry) - empty for ordinary templates.
    """

    __tablename__ = "machine_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_class_id: Mapped[str] = mapped_column(ForeignKey("asset_classes.id"))
    name: Mapped[str] = mapped_column(String(200))
    manufacturer: Mapped[str | None] = mapped_column(String(200), nullable=True)
    capture_methods: Mapped[list[str]] = mapped_column(JSON, default=list)
    identifier_field_key: Mapped[str] = mapped_column(String(100))
    fields: Mapped[list[dict]] = mapped_column(JSON, default=list)
    prompt_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    quirks: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    asset_class: Mapped[AssetClass] = relationship(back_populates="templates")
    machines: Mapped[list["Machine"]] = relationship(back_populates="template")


class Machine(Base):
    """An actual owned unit - what mobile's local `Asset` becomes, server-side."""

    __tablename__ = "machines"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    template_id: Mapped[int] = mapped_column(ForeignKey("machine_templates.id"))
    name: Mapped[str] = mapped_column(String(200))
    identifier_value: Mapped[str] = mapped_column(String(200), index=True)
    created_at: Mapped[datetime] = mapped_column(default=_utcnow)

    client: Mapped[Client] = relationship(back_populates="machines")
    template: Mapped[MachineTemplate] = relationship(back_populates="machines")
    readings: Mapped[list["Reading"]] = relationship(back_populates="machine")


class Reading(Base):
    """A captured data point for a specific machine."""

    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id"))
    captured_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    captured_at: Mapped[datetime] = mapped_column(default=_utcnow)
    # "ocr" | "manual"
    capture_method: Mapped[str] = mapped_column(String(20))
    fields: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence_flags: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    machine: Mapped[Machine] = relationship(back_populates="readings")
