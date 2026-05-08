from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from auth.google_oauth import get_current_user
from db import database as db
from services import kb_service

router = APIRouter(prefix="/api/knowledge-base", tags=["knowledge-base"])


def _require_admin(user: dict) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("")
async def list_kb(
    competitor_id: Optional[int] = None,
    user: dict = Depends(get_current_user),  # any authenticated user
):
    return await db.list_knowledge_base(competitor_id=competitor_id)


@router.get("/{competitor_id}/{month}")
async def get_kb_entry(
    competitor_id: int,
    month: str,
    user: dict = Depends(get_current_user),  # any authenticated user
):
    entry = await db.get_kb_entry(competitor_id, month)
    if not entry:
        raise HTTPException(status_code=404, detail="Knowledge base entry not found")
    return entry


@router.delete("/{kb_id}")
async def delete_kb_entry(
    kb_id: int,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    deleted = await db.delete_kb_entry(kb_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Knowledge base entry not found")
    return {"deleted": True, "id": kb_id}


@router.post("/generate")
async def generate_kb(
    competitor_id: Optional[int] = None,
    month: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)

    if month is None:
        today = date.today()
        # Default to current month
        month = f"{today.year}-{today.month:02d}"

    if competitor_id is not None:
        try:
            await kb_service.generate_kb_for_competitor(
                competitor_id, month, generated_by=user["email"]
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return {"status": "generated", "month": month, "competitor_id": competitor_id}

    competitors = await db.list_competitors(active_only=True)
    results = []
    for comp in competitors:
        try:
            await kb_service.generate_kb_for_competitor(
                comp["id"], month, generated_by=user["email"]
            )
            results.append(
                {"competitor_id": comp["id"], "name": comp["name"], "status": "ok"}
            )
        except Exception as exc:
            results.append(
                {
                    "competitor_id": comp["id"],
                    "name": comp["name"],
                    "status": "failed",
                    "error": str(exc),
                }
            )
    return {"month": month, "results": results}
