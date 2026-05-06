"""
Tracks job postings on competitor careers pages.

Crawled careers page content is parsed by the LLM to extract structured listings.
Diffs against previously stored postings to surface new and removed roles.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from db import database as db
from services import llm_service

log = logging.getLogger(__name__)

_EXTRACT_JOBS_PROMPT = """\
Extract all job postings from the careers page content below.
Return a JSON array. Each element must be an object with these fields:
  "title": job title (string, required)
  "department": team or department name (string or null)
  "location": office city or "Remote" (string or null)
  "url": direct link to this job posting (string or null)

If no job postings are found, return an empty array: []
Return ONLY a valid JSON array — no markdown fences, no explanation.

CAREERS PAGE CONTENT:
{content}"""


def _normalise_title(title: str) -> str:
    """Lowercase and strip a job title for comparison."""
    return title.lower().strip()


async def track_jobs(
    competitor_id: int,
    careers_url: str,
    company_name: str,
    crawled_content: str,
) -> dict[str, Any]:
    """Extract job postings and diff against stored postings.

    Returns a dict with keys:
        available (bool), new_roles, removed_roles, total_active,
        trend, dept_breakdown — or available=False + reason on failure.
    """
    if not crawled_content or len(crawled_content.strip()) < 100:
        return {"available": False, "reason": "No careers page content crawled"}

    prompt = _EXTRACT_JOBS_PROMPT.format(content=crawled_content[:8000])
    try:
        raw: Any = await llm_service.json_completion(
            messages=[{"role": "user", "content": prompt}]
        )
        # json_completion returns a dict; the LLM may wrap the array or return it directly
        if isinstance(raw, list):
            postings: list[dict] = raw
        elif isinstance(raw, dict):
            for key in ("jobs", "postings", "results", "data"):
                if isinstance(raw.get(key), list):
                    postings = raw[key]
                    break
            else:
                postings = []
        else:
            postings = []
    except Exception as exc:
        log.warning("Job extraction failed for %s: %s", company_name, exc)
        return {"available": False, "reason": str(exc)}

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    existing: list[dict] = await db.list_active_job_postings(competitor_id)

    existing_norm = {_normalise_title(p["title"]) for p in existing}
    current_norm = {_normalise_title(p["title"]) for p in postings if p.get("title")}
    current_norm.discard("")

    new_norm = current_norm - existing_norm
    removed_norm = existing_norm - current_norm

    await db.upsert_job_postings(competitor_id, postings, today)
    await db.mark_job_postings_removed(competitor_id, list(removed_norm), today)

    dept_counts: dict[str, int] = {}
    for p in postings:
        dept = (p.get("department") or "Other").strip() or "Other"
        dept_counts[dept] = dept_counts.get(dept, 0) + 1

    new_roles = [p["title"] for p in postings if _normalise_title(p.get("title", "")) in new_norm][:10]
    removed_roles = [p["title"] for p in existing if _normalise_title(p.get("title", "")) in removed_norm][:10]

    delta = len(postings) - len(existing)
    trend = f"+{delta}" if delta > 0 else (str(delta) if delta < 0 else "no change")

    return {
        "available": True,
        "new_roles": new_roles,
        "removed_roles": removed_roles,
        "total_active": len(postings),
        "trend": trend,
        "dept_breakdown": dict(sorted(dept_counts.items(), key=lambda x: -x[1])[:6]),
    }
