from fastapi import APIRouter, Depends, HTTPException

from auth.google_oauth import get_current_user
from db import database as db
from models.schemas import SuggestionOut, SuggestionReview, UserOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _require_admin(user: dict) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    _require_admin(user)
    db_conn = await db.get_db()

    c = await db_conn.execute("SELECT COUNT(*) FROM competitors WHERE active=1")
    active_competitors = (await c.fetchone())[0]

    c = await db_conn.execute("SELECT COUNT(*) FROM job_runs")
    total_jobs = (await c.fetchone())[0]

    c = await db_conn.execute("SELECT COUNT(*) FROM digests")
    total_digests = (await c.fetchone())[0]

    c = await db_conn.execute("SELECT COUNT(*) FROM users")
    total_users = (await c.fetchone())[0]

    c = await db_conn.execute("SELECT COUNT(*) FROM competitor_suggestions WHERE status='pending'")
    pending_suggestions = (await c.fetchone())[0]

    return {
        "active_competitors": active_competitors,
        "total_jobs": total_jobs,
        "total_digests": total_digests,
        "total_users": total_users,
        "pending_suggestions": pending_suggestions,
    }


@router.get("/users", response_model=list[UserOut])
async def list_users(user: dict = Depends(get_current_user)):
    _require_admin(user)
    return await db.list_users()


@router.get("/suggestions", response_model=list[SuggestionOut])
async def list_suggestions(
    status: str = None,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    return await db.list_suggestions(status=status)


@router.patch("/suggestions/{suggestion_id}/review", response_model=SuggestionOut)
async def review_suggestion(
    suggestion_id: int,
    body: SuggestionReview,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    result = await db.review_suggestion(suggestion_id, body.status, user["email"])
    if not result:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    # Auto-create competitor when approved — check by name to avoid duplicates
    if body.status == "approved":
        existing = await db.list_competitors(active_only=False)
        names = {c["name"].lower() for c in existing}
        if result["name"].lower() not in names:
            await db.create_competitor({
                "name": result["name"],
                "category": result["category"],
                "website_url": result.get("website_url"),
                "added_by": result["suggested_by"],
            })

    return result


@router.get("/llm-usage")
async def llm_usage(user: dict = Depends(get_current_user)):
    _require_admin(user)
    return await db.get_llm_usage_stats()
