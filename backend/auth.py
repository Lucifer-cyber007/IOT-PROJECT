"""Password hashing, JWT issuance/verification, and role-scoped FastAPI dependencies."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from db import get_db
from models import TechnicianMachineAccess, User

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24 * 7

_bearer = HTTPBearer()


def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not set on the server.")
    return secret


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "client_id": user.client_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token."
        ) from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    payload = _decode_token(credentials.credentials)
    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    if user.status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This account has been suspended."
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return user


def require_org_member(user: User = Depends(get_current_user)) -> User:
    """Any authenticated user in a client organization - client_admin or technician."""
    if user.role not in ("client_admin", "technician") or user.client_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Client access required."
        )
    return user


def require_client_admin(user: User = Depends(get_current_user)) -> User:
    """Org-management actions - requesting/approving logins, managing technicians."""
    if user.role != "client_admin" or user.client_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Client admin access required."
        )
    return user


def accessible_machine_ids(db: Session, user: User) -> set[int] | None:
    """The set of machine IDs `user` may see, or `None` meaning "all of their client's".

    A client_admin has implicit access to every machine in their own client. A
    technician is narrowed down to whatever `TechnicianMachineAccess` grants them.
    """
    if user.role == "client_admin":
        return None
    rows = db.query(TechnicianMachineAccess.machine_id).filter(
        TechnicianMachineAccess.user_id == user.id
    )
    return {machine_id for (machine_id,) in rows}
