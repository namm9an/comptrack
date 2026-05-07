"""
APScheduler job definitions.

Daily job  → 06:00 IST (Asia/Kolkata)
Weekly job → Monday 06:00 IST

Both jobs iterate all active competitors sequentially.
"""

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from config import SCHEDULER_TIMEZONE
from db import database as db
from services import kb_service, tracker

log = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone=SCHEDULER_TIMEZONE)


async def _run_scheduled_job(job_type: str) -> None:
    competitors = await db.list_competitors(active_only=True)
    if not competitors:
        log.info("No active competitors — skipping %s job", job_type)
        return

    job_run = await db.create_job_run(
        competitor_id=None,
        job_type=job_type,
        triggered_by="scheduler",
    )
    job_run_id = job_run["id"]
    log.info("Scheduled %s job started (job_run_id=%s, competitors=%d)", job_type, job_run_id, len(competitors))

    await db.update_job_run(job_run_id, status="running")
    try:
        await tracker.run_job_for_competitors(job_run_id, competitors, job_type)
        await db.update_job_run(
            job_run_id,
            status="completed",
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        log.info("Scheduled %s job completed (job_run_id=%s)", job_type, job_run_id)
    except Exception as exc:
        log.error("Scheduled %s job failed (job_run_id=%s): %s", job_type, job_run_id, exc)
        await db.update_job_run(
            job_run_id,
            status="failed",
            completed_at=datetime.now(timezone.utc).isoformat(),
            error=str(exc),
        )


async def daily_job() -> None:
    await _run_scheduled_job("daily")


async def weekly_job() -> None:
    await _run_scheduled_job("weekly")


async def monthly_kb_job() -> None:
    log.info("Monthly KB generation started")
    try:
        await kb_service.generate_monthly_kb_all()
        log.info("Monthly KB generation completed")
    except Exception as exc:
        log.error("Monthly KB generation failed: %s", exc)


def start_scheduler() -> None:
    scheduler.add_job(
        daily_job,
        CronTrigger(hour=6, minute=0, timezone=SCHEDULER_TIMEZONE),
        id="daily_tracker",
        name="Daily competitor tracking",
        replace_existing=True,
        coalesce=True,           # skip missed runs that pile up (e.g. after restart)
        misfire_grace_time=3600, # fire up to 1h late if the process was restarting at 06:00
        max_instances=1,
    )
    scheduler.add_job(
        weekly_job,
        CronTrigger(day_of_week="mon", hour=6, minute=0, timezone=SCHEDULER_TIMEZONE),
        id="weekly_tracker",
        name="Weekly competitor tracking",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
        max_instances=1,
    )
    scheduler.add_job(
        monthly_kb_job,
        CronTrigger(day=1, hour=7, minute=0, timezone=SCHEDULER_TIMEZONE),
        id="monthly_kb",
        name="Monthly knowledge base generation",
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
        max_instances=1,
    )
    scheduler.start()
    log.info(
        "Scheduler started — daily at 06:00 IST, weekly Mon 06:00 IST, monthly KB 1st 07:00 IST"
    )


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
        log.info("Scheduler stopped")
