import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import Cookie, HTTPException, Request, status

from config import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ADMIN_EMAILS,
    ALLOWED_EMAIL_DOMAIN,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    REFRESH_TOKEN_EXPIRE_DAYS,
    SECRET_KEY,
)
from db import database as db

log = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

ALGORITHM = "HS256"


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(email: str, name: str, role: str) -> str:
    payload = {
        "sub": email,
        "name": name,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(64)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ---------------------------------------------------------------------------
# FastAPI dependency — authenticated user
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request,
    access_token: Optional[str] = Cookie(default=None),
) -> dict:
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = verify_access_token(access_token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired or invalid")
    return {"email": payload["sub"], "name": payload["name"], "role": payload["role"]}


# ---------------------------------------------------------------------------
# OAuth flow helpers
# ---------------------------------------------------------------------------

def build_google_auth_url(state: str) -> str:
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
    resp.raise_for_status()
    return resp.json()


async def fetch_google_user(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    resp.raise_for_status()
    return resp.json()


async def login_user(google_user: dict) -> tuple[str, str, dict]:
    """
    Validate domain, upsert DB user, issue JWT pair.
    Returns (access_token, refresh_token, user_dict).
    """
    email: str = google_user.get("email", "")
    domain = email.split("@")[-1] if "@" in email else ""

    if domain != ALLOWED_EMAIL_DOMAIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only @{ALLOWED_EMAIL_DOMAIN} email addresses are allowed.",
        )

    existing = await db.get_user(email)
    if existing:
        role = existing["role"]
    else:
        role = "admin" if email.lower() in ADMIN_EMAILS else "user"

    user = await db.upsert_user(
        email=email,
        name=google_user.get("name", email),
        picture=google_user.get("picture", ""),
        role=role,
    )

    access_token = create_access_token(email, user["name"], user["role"])
    refresh_token = create_refresh_token()
    token_hash = _hash_token(refresh_token)
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    ).isoformat()
    await db.save_refresh_token(email, token_hash, expires_at)

    return access_token, refresh_token, user


async def rotate_refresh_token(old_token: str) -> tuple[str, str, dict]:
    """Validate old refresh token, issue new pair."""
    token_hash = _hash_token(old_token)
    record = await db.get_refresh_token(token_hash)
    if not record:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    expires_at = datetime.fromisoformat(record["expires_at"])
    if expires_at < datetime.now(timezone.utc):
        await db.delete_refresh_token(token_hash)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    user = await db.get_user(record["user_email"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    await db.delete_refresh_token(token_hash)

    new_access = create_access_token(user["email"], user["name"], user["role"])
    new_refresh = create_refresh_token()
    new_hash = _hash_token(new_refresh)
    new_expires = (
        datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    ).isoformat()
    await db.save_refresh_token(user["email"], new_hash, new_expires)

    return new_access, new_refresh, user
