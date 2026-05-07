"""Monthly knowledge base generation using the LLM."""
import json
import logging
from datetime import datetime, timezone

from db import database as db
from services import llm_service

log = logging.getLogger(__name__)


async def generate_kb_for_competitor(
    competitor_id: int, month: str, generated_by: str = "scheduler"
) -> dict:
    competitor = await db.get_competitor(competitor_id)
    if not competitor:
        raise ValueError(f"Competitor {competitor_id} not found")

    digests = await db.get_digests_for_month(competitor_id, month)
    if not digests:
        raise ValueError(f"No digests found for {competitor['name']} in {month}")

    # Build a summary of all digests for the prompt
    digest_summaries = []
    for d in digests:
        content = d["digest"]
        parts = []
        if content.get("pr"):
            parts.append(f"PR: {'; '.join(content['pr'][:3])}")
        elif content.get("news_mentions"):
            parts.append(f"PR: {'; '.join(content['news_mentions'][:3])}")
        if content.get("newsletter"):
            parts.append(f"Newsletter: {'; '.join(content['newsletter'][:2])}")
        if content.get("web_activity"):
            parts.append(f"Web: {'; '.join(content['web_activity'][:2])}")
        elif content.get("product_moves"):
            parts.append(f"Web: {'; '.join(content['product_moves'][:2])}")
        if content.get("social_media"):
            parts.append(f"Social: {'; '.join(content['social_media'][:2])}")
        elif content.get("social_activity") and content["social_activity"] != "No data available":
            parts.append(f"Social: {content['social_activity'][:150]}")
        digest_summaries.append(f"[{d['digest_date']}] " + " | ".join(parts))

    digest_text = "\n".join(digest_summaries)

    prompt = (
        f"You are a competitive intelligence analyst. Based on the following monthly intelligence "
        f"for {competitor['name']} during {month}, compile a monthly knowledge base entry.\n\n"
        f"MONTHLY DATA:\n{digest_text}\n\n"
        f"Return a JSON object (no markdown) with exactly these keys:\n"
        f"{{\n"
        f'  "executive_summary": "2-3 sentence overview of what happened this month",\n'
        f'  "pr": ["key press releases issued by the company OR significant media coverage this month"],\n'
        f'  "newsletter": ["key blog posts, newsletters, or long-form content published by the company this month"],\n'
        f'  "web_activity": ["key website and product changes this month"],\n'
        f'  "social_media": [\n'
        f'    "Prefix each item with [LinkedIn] or [X/Twitter]. Include: named exec posts (full name + topic), campaigns (#hashtag + purpose), events (name + date + what was said), customer case studies (customer name + result). Be specific, not generic."\n'
        f'  ],\n'
        f'  "suggestions": [\n'
        f'    "short actionable suggestion 1 for E2E Networks based on this intelligence",\n'
        f'    "short actionable suggestion 2",\n'
        f'    "short actionable suggestion 3"\n'
        f'  ],\n'
        f'  "sources": []\n'
        f"}}\n\n"
        f"Rules:\n"
        f"- pr: include both company-issued press releases AND key media coverage — not blog posts\n"
        f"- newsletter: only blog posts, newsletters, product docs — NOT press releases\n"
        f"- social_media: be as specific as possible — platform prefix, exec names, campaign names, event names\n"
        f"- suggestions: SHORT (one sentence max), actionable, specific to E2E Networks strategy\n"
        f"- Each list field: max 5 items, focus on most strategically relevant\n"
        f"- Compile across all digests — do not repeat the same point\n"
        f"- Output valid JSON only"
    )

    messages = [
        {
            "role": "system",
            "content": "You are a competitive intelligence analyst. Respond only with valid JSON.",
        },
        {"role": "user", "content": prompt},
    ]

    content = await llm_service.json_completion(messages)

    content["month"] = month
    content["competitor"] = competitor["name"]
    content["competitor_id"] = competitor_id
    content["generated_at"] = datetime.now(timezone.utc).isoformat()

    await db.upsert_kb_entry(competitor_id, month, json.dumps(content), generated_by)
    return content


async def generate_monthly_kb_all(month: str = None) -> None:
    """Generate KB entries for all active competitors for the given month."""
    if month is None:
        from datetime import date

        today = date.today()
        # Generate for the previous month
        if today.month == 1:
            month = f"{today.year - 1}-12"
        else:
            month = f"{today.year}-{today.month - 1:02d}"

    competitors = await db.list_competitors(active_only=True)
    log.info(
        "Generating monthly KB for %d competitors, month=%s", len(competitors), month
    )
    for comp in competitors:
        try:
            await generate_kb_for_competitor(comp["id"], month, generated_by="scheduler")
            log.info("KB generated for %s (%s)", comp["name"], month)
        except Exception as exc:
            log.warning("KB generation failed for %s: %s", comp["name"], exc)
