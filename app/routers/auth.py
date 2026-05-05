import hashlib
import secrets

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from auth.google_oauth import (
    build_google_auth_url,
    exchange_code_for_tokens,
    fetch_google_user,
    get_current_user,
    login_user,
    rotate_refresh_token,
)
from config import COOKIE_SECURE, FRONTEND_URL, REFRESH_TOKEN_EXPIRE_DAYS
from db import database as db
from models.schemas import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

# OAuth state is bound to the browser via a short-lived HttpOnly cookie (10 min).
# This replaces the previous in-memory dict which was unbounded and broke with
# multiple workers (security review C3).


@router.get("/google")
async def google_login():
    state = secrets.token_urlsafe(32)
    url = build_google_auth_url(state)
    redirect = RedirectResponse(url=url)
    # Bind state to browser — prevents CSRF and survives multi-worker deployments
    redirect.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=600,
    )
    return redirect


@router.get("/google/callback")
async def google_callback(request: Request, code: str, state: str):
    cookie_state = request.cookies.get("oauth_state")
    if not cookie_state or not secrets.compare_digest(cookie_state, state):
        raise HTTPException(status_code=400, detail="Invalid or missing OAuth state")

    tokens = await exchange_code_for_tokens(code)
    google_user = await fetch_google_user(tokens["access_token"])
    access_token, refresh_token, _user = await login_user(google_user)

    redirect = RedirectResponse(url=FRONTEND_URL, status_code=302)
    redirect.delete_cookie("oauth_state")
    _set_auth_cookies(redirect, access_token, refresh_token)
    return redirect


@router.post("/refresh")
async def refresh(
    response: Response,
    token: str = Cookie(default=None, alias="refresh_token"),
):
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    new_access, new_refresh, _user = await rotate_refresh_token(token)
    _set_auth_cookies(response, new_access, new_refresh)
    return {"ok": True}


@router.post("/logout")
async def logout(
    response: Response,
    token: str = Cookie(default=None, alias="refresh_token"),
):
    # Logout does NOT require a valid access token — a user with an expired
    # access cookie must still be able to revoke their refresh token (H4 fix).
    if token:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        await db.delete_refresh_token(token_hash)
    _clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    record = await db.get_user(user["email"])
    if not record:
        raise HTTPException(status_code=404, detail="User not found")
    return record


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=15 * 60,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    response.delete_cookie("oauth_state")
