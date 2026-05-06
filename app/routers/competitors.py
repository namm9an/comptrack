from fastapi import APIRouter, Depends, HTTPException, status

from auth.google_oauth import get_current_user
from db import database as db
from models.schemas import (
    CompetitorIn,
    CompetitorOut,
    CompetitorUpdate,
    DigestOut,
    JobPostingOut,
    SuggestionIn,
    SuggestionOut,
    TrackedIndividualIn,
    TrackedIndividualOut,
)

router = APIRouter(prefix="/api/competitors", tags=["competitors"])


def _require_admin(user: dict) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def _build_competitor_out(comp: dict, include_digest: bool = True) -> dict:
    individuals = await db.list_individuals(comp["id"])
    latest_digest = await db.get_latest_digest(comp["id"]) if include_digest else None
    return {
        **comp,
        "active": bool(comp["active"]),
        "individuals": individuals,
        "latest_digest": latest_digest,
    }


@router.get("", response_model=list[CompetitorOut])
async def list_competitors(
    include_inactive: bool = False,
    user: dict = Depends(get_current_user),
):
    active_only = not include_inactive
    competitors = await db.list_competitors(active_only=active_only)
    result = []
    for c in competitors:
        result.append(await _build_competitor_out(c))
    return result


@router.get("/{competitor_id}", response_model=CompetitorOut)
async def get_competitor(
    competitor_id: int,
    user: dict = Depends(get_current_user),
):
    comp = await db.get_competitor(competitor_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competitor not found")
    return await _build_competitor_out(comp)


@router.post("", response_model=CompetitorOut, status_code=201)
async def create_competitor(
    body: CompetitorIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    data = body.model_dump()
    individuals = data.pop("individuals", [])
    data["added_by"] = user["email"]
    comp = await db.create_competitor(data)
    for ind in individuals:
        await db.add_individual(comp["id"], ind)
    return await _build_competitor_out(comp)


@router.put("/{competitor_id}", response_model=CompetitorOut)
async def update_competitor(
    competitor_id: int,
    body: CompetitorUpdate,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    comp = await db.get_competitor(competitor_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competitor not found")
    updated = await db.update_competitor(competitor_id, body.model_dump(exclude_none=True))
    return await _build_competitor_out(updated)


@router.patch("/{competitor_id}/deactivate", status_code=200)
async def deactivate_competitor(
    competitor_id: int,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    comp = await db.get_competitor(competitor_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competitor not found")
    await db.deactivate_competitor(competitor_id)
    return {"ok": True, "competitor_id": competitor_id}


# ---------------------------------------------------------------------------
# Tracked individuals
# ---------------------------------------------------------------------------

@router.get("/{competitor_id}/individuals", response_model=list[TrackedIndividualOut])
async def list_individuals(
    competitor_id: int,
    user: dict = Depends(get_current_user),
):
    return await db.list_individuals(competitor_id)


@router.post("/{competitor_id}/individuals", response_model=TrackedIndividualOut, status_code=201)
async def add_individual(
    competitor_id: int,
    body: TrackedIndividualIn,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    return await db.add_individual(competitor_id, body.model_dump())


@router.delete("/{competitor_id}/individuals/{individual_id}", status_code=200)
async def remove_individual(
    competitor_id: int,
    individual_id: int,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    await db.delete_individual(individual_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Digests for a competitor
# ---------------------------------------------------------------------------

@router.get("/{competitor_id}/digests", response_model=list[DigestOut])
async def list_digests(
    competitor_id: int,
    limit: int = 20,
    user: dict = Depends(get_current_user),
):
    return await db.list_digests(competitor_id, limit=limit)


# ---------------------------------------------------------------------------
# Suggestions
# ---------------------------------------------------------------------------

@router.post("/suggestions", response_model=SuggestionOut, status_code=201)
async def suggest_competitor(
    body: SuggestionIn,
    user: dict = Depends(get_current_user),
):
    data = body.model_dump()
    data["suggested_by"] = user["email"]
    return await db.create_suggestion(data)


# ---------------------------------------------------------------------------
# Job postings
# ---------------------------------------------------------------------------

@router.get("/{competitor_id}/job-postings", response_model=list[JobPostingOut])
async def list_competitor_job_postings(
    competitor_id: int,
    status: str = "active",
    user: dict = Depends(get_current_user),
) -> list[dict]:
    """Return job postings for a competitor. status param: 'active' | 'removed' | 'all'."""
    comp = await db.get_competitor(competitor_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competitor not found")
    return await db.list_job_postings(competitor_id, status=status if status != "all" else None)
