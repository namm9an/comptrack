"""
Crawl4AI wrapper — async, graceful failure.

LinkedIn is a known failure case: they block crawlers aggressively.
This service attempts the crawl and returns None on failure.
The UI should show "data unavailable" in that case — not an error.
"""

import logging
from typing import Optional

from config import MAX_SEARCH_RESULTS

log = logging.getLogger(__name__)

CRAWL_CHAR_LIMIT = 8000  # max chars per crawled page before truncation


async def crawl_url(url: str, label: str = "") -> Optional[str]:
    """
    Crawl a URL and return cleaned markdown text, or None on failure.
    """
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

        browser_cfg = BrowserConfig(headless=True, verbose=False)
        run_cfg = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, word_count_threshold=10)

        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=url, config=run_cfg)

        if not result.success:
            log.warning("Crawl failed for %s (%s): %s", label or url, url, result.error_message)
            return None

        text = result.markdown or result.cleaned_html or ""
        if len(text) > CRAWL_CHAR_LIMIT:
            text = text[:CRAWL_CHAR_LIMIT] + "\n[truncated]"

        return text.strip() or None

    except Exception as exc:
        log.warning("Crawl exception for %s (%s): %s", label or url, url, exc)
        return None


async def crawl_website(website_url: str, company_name: str) -> dict:
    """
    Crawl the competitor's homepage. Returns structured result.
    """
    if not website_url:
        return {"available": False, "reason": "no website URL configured", "content": None}

    content = await crawl_url(website_url, label=f"{company_name} website")
    if content:
        return {"available": True, "content": content, "url": website_url}
    return {"available": False, "reason": "crawl failed or empty", "content": None}


async def crawl_linkedin(linkedin_url: str, company_name: str) -> dict:
    """
    Attempt LinkedIn crawl. High likelihood of failure — handled gracefully.
    """
    if not linkedin_url:
        return {"available": False, "reason": "no LinkedIn URL configured", "content": None}

    content = await crawl_url(linkedin_url, label=f"{company_name} LinkedIn")
    if content:
        return {"available": True, "content": content, "url": linkedin_url}
    return {
        "available": False,
        "reason": "LinkedIn data unavailable (blocked or no content)",
        "content": None,
    }
