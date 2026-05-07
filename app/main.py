import logging
import sys
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request

from config import BACKEND_PORT, CORS_ORIGINS, LLM_BASE_URL, SEARXNG_BASE_URL
from db.database import close_db, get_db
from middleware.ip_restriction import IPRestrictionMiddleware
from routers import admin, auth, competitors, jobs, knowledge_base, reports
from scheduler.jobs import start_scheduler, stop_scheduler
from services import llm_service
from auth.google_oauth import get_current_user

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_db()
    start_scheduler()
    log.info("CompTrack backend started on port %s", BACKEND_PORT)
    yield
    stop_scheduler()
    await llm_service.close()
    await close_db()
    log.info("CompTrack backend shut down")


app = FastAPI(
    title="CompTrack API",
    description="Competitor intelligence platform for E2E Networks",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# IP restriction runs before CORS
app.add_middleware(IPRestrictionMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(competitors.router)
app.include_router(jobs.router)
app.include_router(admin.router)
app.include_router(knowledge_base.router)
app.include_router(reports.router)


@app.get("/api/health", tags=["health"])
async def health():
    """
    Public liveness probe — returns only ok/degraded status.
    Internal endpoint details are omitted to avoid leaking topology.
    Full connectivity details are available at /api/admin/health (admin only).
    """
    llm_ok = False
    searxng_ok = False

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{LLM_BASE_URL}/models", headers={"Authorization": "Bearer x"})
            llm_ok = resp.status_code < 500
    except Exception as exc:
        log.warning("LLM health probe failed: %s", exc)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{SEARXNG_BASE_URL}/search?q=test&format=json")
            searxng_ok = resp.status_code == 200
    except Exception as exc:
        log.warning("SearXNG health probe failed: %s", exc)

    return {
        "status": "ok" if (llm_ok and searxng_ok) else "degraded",
        "llm": "ok" if llm_ok else "unavailable",
        "searxng": "ok" if searxng_ok else "unavailable",
    }


@app.get("/api/admin/health", tags=["admin"])
async def admin_health(user: dict = Depends(get_current_user)):
    """Detailed health status with endpoint URLs — admin session required."""
    if user["role"] != "admin":
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin access required")

    llm_ok = False
    searxng_ok = False

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{LLM_BASE_URL}/models", headers={"Authorization": "Bearer x"})
            llm_ok = resp.status_code < 500
    except Exception as exc:
        log.warning("LLM health probe failed: %s", exc)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{SEARXNG_BASE_URL}/search?q=test&format=json")
            searxng_ok = resp.status_code == 200
    except Exception as exc:
        log.warning("SearXNG health probe failed: %s", exc)

    return {
        "status": "ok" if (llm_ok and searxng_ok) else "degraded",
        "llm_connected": llm_ok,
        "llm_endpoint": LLM_BASE_URL,
        "searxng_connected": searxng_ok,
        "searxng_endpoint": SEARXNG_BASE_URL,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=BACKEND_PORT, reload=False)
