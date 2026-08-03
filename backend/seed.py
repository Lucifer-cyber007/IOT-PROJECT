"""One-time bootstrap: create tables, seed the 7 asset classes, create the first admin.

Run with: python seed.py
Safe to re-run - skips anything that already exists.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv

import auth
import models
from db import Base, SessionLocal, engine

load_dotenv()

ASSET_CLASSES = [
    ("energy_meter", "Energy Meters", "⚡"),
    ("hvac", "HVAC Systems", "❄"),
    ("ups", "UPS", "🔋"),
    ("data_center", "Data Center", "🖥"),
    ("solar_inverter", "Solar Inverters", "☀"),
    ("dg_set", "DG Sets", "⛽"),
    ("pump_motor", "Pumps & Motors", "🔧"),
]


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for class_id, label, icon in ASSET_CLASSES:
            if not db.get(models.AssetClass, class_id):
                db.add(models.AssetClass(id=class_id, label=label, icon=icon))
        db.commit()
        print(f"Seeded {len(ASSET_CLASSES)} asset classes (skipped any already present).")

        admin_email = os.getenv("ADMIN_EMAIL", "admin@example.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "change-me-now")
        existing = db.query(models.User).filter(models.User.email == admin_email).first()
        if existing:
            print(f"Admin user '{admin_email}' already exists - not touching it.")
        else:
            db.add(
                models.User(
                    email=admin_email,
                    password_hash=auth.hash_password(admin_password),
                    role="admin",
                    client_id=None,
                )
            )
            db.commit()
            print(
                f"Created admin user '{admin_email}'. "
                f"{'Password is ADMIN_PASSWORD from .env.' if os.getenv('ADMIN_PASSWORD') else 'Using the default password - set ADMIN_PASSWORD in .env and re-seed a fresh DB before relying on this.'}"
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
