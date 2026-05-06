import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from auth.google_oauth import get_current_user
from db import database as db
from models.schemas import JobRunOut, JobTriggerIn
from services import tracker

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
log = logging.getLogger(__name__)


def _require_admin(user: dict) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("", response_model=list[JobRunOut])
async def list_jobs(
    competitor_id: int = None,
    limit: int = 50,
    user: dict = Depends(get_current_user),
):
    return await db.list_job_runs(competitor_id=competitor_id, limit=limit)


@router.get("/{job_run_id}/digests")
async def get_job_digests(
    job_run_id: int,
    user: dict = Depends(get_current_user),
):
    """Return all digests produced by a job run, with competitor names."""
    job = await db.get_job_run(job_run_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job run not found")
    return await db.list_digests_by_job(job_run_id)


@router.get("/{job_run_id}", response_model=JobRunOut)
async def get_job(
    job_run_id: int,
    user: dict = Depends(get_current_user),
):
    job = await db.get_job_run(job_run_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job run not found")
    return job


@router.post("/trigger", response_model=JobRunOut, status_code=202)
async def trigger_job(
    body: JobTriggerIn,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)

    # Locking: reject if same competitor+type job is already running
    already_running = await db.has_running_job(body.competitor_id, body.job_type)
    if already_running:
        raise HTTPException(
            status_code=409,
            detail=f"A {body.job_type} job is already running for this competitor. Wait for it to finish.",
        )

    if body.competitor_id is not None:
        comp = await db.get_competitor(body.competitor_id)
        if not comp:
            raise HTTPException(status_code=404, detail="Competitor not found")
        competitors = [comp]
    else:
        competitors = await db.list_competitors(active_only=True)

    job_run = await db.create_job_run(
        competitor_id=body.competitor_id,
        job_type=body.job_type,
        triggered_by=user["email"],
    )
    job_run_id = job_run["id"]

    async def _run():
        await db.update_job_run(job_run_id, status="running")
        try:
            await tracker.run_job_for_competitors(job_run_id, competitors, body.job_type)
            await db.update_job_run(
                job_run_id,
                status="completed",
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
            log.info("Manual job %s completed (id=%s)", body.job_type, job_run_id)
        except Exception as exc:
            log.error("Manual job %s failed (id=%s): %s", body.job_type, job_run_id, exc)
            await db.update_job_run(
                job_run_id,
                status="failed",
                completed_at=datetime.now(timezone.utc).isoformat(),
                error=str(exc),
            )

    background_tasks.add_task(_run)
    return job_run


@router.delete("/{job_run_id}", status_code=204)
async def delete_job(
    job_run_id: int,
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    job = await db.get_job_run(job_run_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job run not found")
    if job["status"] == "running":
        raise HTTPException(status_code=409, detail="Cannot delete a running job")
    deleted = await db.delete_job_run(job_run_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job run not found")
