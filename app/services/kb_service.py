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
        summary_parts = []
        if content.get("summary"):
            summary_parts.append(f"Summary: {content['summary']}")
        if content.get("news_mentions"):
            summary_parts.append(f"News: {'; '.join(content['news_mentions'][:5])}")
        if content.get("product_moves"):
            summary_parts.append(f"Product: {'; '.join(content['product_moves'][:3])}")
        social = content.get("social_activity") or ""
        if social and social != "No data available":
            summary_parts.append(f"Social: {social[:200]}")
        digest_summaries.append(f"[{d['digest_date']}] " + " | ".join(summary_parts))

    digest_text = "\n".join(digest_summaries)

    prompt = (
        f"You are a competitive intelligence analyst. Based on the following daily/weekly "
        f"intelligence digests for {competitor['name']} during {month}, compile a comprehensive "
        f"monthly knowledge base entry.\n\n"
        f"DIGESTS:\n{digest_text}\n\n"
        f"Respond with a JSON object (no markdown, no code blocks) with exactly these keys:\n"
        f"{{\n"
        f'  "executive_summary": "2-3 sentence overview of the month",\n'
        f'  "key_developments": ["list", "of", "major", "developments"],\n'
        f'  "product_launches": ["list", "of", "product", "announcements"],\n'
        f'  "hiring_trends": "summary of hiring activity",\n'
        f'  "social_media_highlights": "notable social/PR activity",\n'
        f'  "competitive_intelligence": "strategic insights for E2E Networks",\n'
        f'  "news_coverage": ["notable", "news", "items"],\n'
        f'  "sources": []\n'
        f"}}"
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
