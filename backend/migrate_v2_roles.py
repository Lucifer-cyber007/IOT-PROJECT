"""One-off migration for the three-tier role model (admin / client_admin / technician).

`Base.metadata.create_all()` only ever adds tables that don't exist yet - it never
alters an existing table or rewrites data - so the two changes to the existing
`users` table (a new `status` column, renaming `role='client'` rows) need this
explicit script. Safe to re-run: every step checks before it acts.

Usage: `python migrate_v2_roles.py` (run once, before starting the server on an
existing app.db).
"""

from __future__ import annotations

from sqlalchemy import inspect, text

import models  # noqa: F401 - import registers all models on Base.metadata
from db import Base, engine


def _add_status_column() -> None:
    inspector = inspect(engine)
    columns = {col["name"] for col in inspector.get_columns("users")}
    if "status" in columns:
        print("users.status already exists - skipping.")
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active'"))
    print("Added users.status.")


def _rename_client_role() -> None:
    with engine.begin() as conn:
        result = conn.execute(text("UPDATE users SET role = 'client_admin' WHERE role = 'client'"))
    print(f"Migrated {result.rowcount} user(s) from role='client' to role='client_admin'.")


def _create_new_tables() -> None:
    Base.metadata.create_all(bind=engine)
    print("Ensured technician_machine_access and account_requests tables exist.")


if __name__ == "__main__":
    _add_status_column()
    _rename_client_role()
    _create_new_tables()
    print("Migration complete.")
