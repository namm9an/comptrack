"""
Detects strategic changes on competitor web pages between runs.

On each run: hashes the crawled page content. If hash differs from stored
snapshot, sends a diff to the LLM for strategic interpretation.
First run establishes a baseline — no change is reported.
"""

import hashlib
import logging
from typing import Optional

from db import database as db
from services import llm_service

log = logging.getLogger(__name__)

_CHANGE_PROMPT = """\
You are a competitive intelligence analyst. A competitor's {page_type} page changed.

PREVIOUS VERSION (truncated to 4000 chars):
{old_text}

CURRENT VERSION (truncated to 4000 chars):
{new_text}

In 2–3 sentences describe what changed strategically. Focus on:
- Pricing changes (new tiers, removed tiers, price drops or increases)
- New or removed product/feature mentions
- Messaging or positioning shifts (taglines, hero copy, value propositions)
- New calls-to-action or removed sections

If the change appears trivial (minor wording, dates, navigation), respond with exactly:
Minor update, no strategic significance.

Respond with only the analysis — no preamble, no markdown."""


async def detect_page_change(
    competitor_id: int,
    page_type: str,
    url: str,
    content: str,
    company_name: str,
) -> dict:
    """Compare crawled content against the last stored snapshot.

    Returns:
        dict with keys: changed (bool), page (str), summary (str | None)
    """
    if not content or len(content.strip()) < 200:
        return {"changed": False, "page": page_type, "summary": None}

    current_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    last: Optional[dict] = await db.get_latest_page_snapshot(competitor_id, page_type)

    if last is None:
        await db.save_page_snapshot(competitor_id, page_type, url, current_hash, content[:50_000])
        log.info("Baseline snapshot stored for %s — %s", company_name, page_type)
        return {"changed": False, "page": page_type, "summary": None}

    if last["content_hash"] == current_hash:
        return {"changed": False, "page": page_type, "summary": None}

    old_text = last["content_text"][:4000]
    new_text = content[:4000]

    try:
        summary = await llm_service.chat_completion(
            messages=[{
                "role": "user",
                "content": _CHANGE_PROMPT.format(
                    page_type=page_type,
                    old_text=old_text,
                    new_text=new_text,
                ),
            }]
        )
        summary = summary.strip()
    except Exception as exc:
        log.warning("LLM change analysis failed for %s %s: %s", company_name, page_type, exc)
        summary = "Page content changed (analysis unavailable)"

    await db.save_page_snapshot(competitor_id, page_type, url, current_hash, content[:50_000])
    log.info("Page change detected for %s — %s", company_name, page_type)
    return {"changed": True, "page": page_type, "summary": summary}
