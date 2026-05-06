"""
SearXNG search wrapper — async, with retry and graceful failure.
Returns empty results (not exceptions) when SearXNG is unreachable.
"""

import logging
from typing import Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from config import MAX_SEARCH_RESULTS, SEARXNG_BASE_URL

log = logging.getLogger(__name__)


async def search(
    query: str,
    categories: str = "general",
    time_range: Optional[str] = None,
    max_results: int = MAX_SEARCH_RESULTS,
) -> list[dict]:
    """
    Query SearXNG and return a list of result dicts:
      [{title, url, content, score}]

    Returns [] if SearXNG is unreachable or returns an error.
    """
    params: dict = {
        "q": query,
        "format": "json",
        "categories": categories,
        "pageno": 1,
    }
    if time_range:
        params["time_range"] = time_range

    try:
        return await _do_search(params, max_results)
    except Exception as exc:
        log.warning("SearXNG search failed for query %r: %s", query, exc)
        return []


@retry(wait=wait_exponential(multiplier=1, min=1, max=10), stop=stop_after_attempt(2))
async def _do_search(params: dict, max_results: int) -> list[dict]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(f"{SEARXNG_BASE_URL}/search", params=params)
    resp.raise_for_status()
    raw = resp.json()

    results = []
    for r in raw.get("results", [])[:max_results]:
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": (r.get("content") or r.get("snippet") or "")[:1000],
            "score": r.get("score", 0),
        })
    return results


async def search_twitter_content(handle: str, company_name: str) -> list[dict]:
    """Improved Twitter/X search — native profile URLs + syndicated content."""
    q1 = f"site:x.com/{handle} OR site:twitter.com/{handle}"
    q2 = f'"{company_name}" tweeted OR "on twitter" OR "on x" announcement OR launch'
    r1 = await search(q1, categories="general", time_range="week")
    r2 = await search(q2, categories="general", time_range="week")
    seen: set[str] = set()
    deduped: list[dict] = []
    for r in r1 + r2:
        if r["url"] not in seen:
            seen.add(r["url"])
            deduped.append(r)
    return deduped[:MAX_SEARCH_RESULTS]


async def search_twitter(handle: str, company_name: str = "") -> list[dict]:
    """Search Twitter/X for a given handle; delegates to search_twitter_content."""
    return await search_twitter_content(handle, company_name)


async def search_linkedin(linkedin_url: str, company_name: str) -> list[dict]:
    """
    Attempt LinkedIn search via SearXNG. LinkedIn frequently blocks scraping;
    this is best-effort. Returns [] on failure — callers should handle gracefully.
    """
    query = f'site:linkedin.com "{company_name}"'
    results = await search(query, categories="general", time_range="month")
    if not results:
        log.info("LinkedIn search returned no results for %s (expected — LinkedIn blocks bots)", company_name)
    return results


async def search_news(company_name: str) -> list[dict]:
    query = f'"{company_name}" announcement OR launch OR funding OR partnership'
    return await search(query, categories="news", time_range="week")


async def search_people(individuals: list[dict], company_name: str) -> list[dict]:
    """Search for tracked individuals by name and company (kept for backwards compatibility)."""
    results = []
    for person in individuals[:5]:  # cap at 5 individuals to avoid rate limits
        query = f'"{person["name"]}" {company_name}'
        hits = await search(query, categories="general", time_range="month")
        for h in hits:
            h["person"] = person["name"]
        results.extend(hits)
    return results


async def search_events(company_name: str) -> list[dict]:
    """Find conference appearances, keynotes, summits, webinars."""
    query = f'"{company_name}" conference OR summit OR keynote OR webinar OR "speaking at"'
    return await search(query, categories="general", time_range="week")


async def search_press(company_name: str) -> list[dict]:
    """Find press releases and major tech press coverage."""
    query = (
        f'"{company_name}" '
        f'(site:prnewswire.com OR site:businesswire.com OR site:techcrunch.com '
        f'OR site:venturebeat.com OR site:theregister.com OR site:zdnet.com)'
    )
    return await search(query, categories="general", time_range="week")


async def search_individuals_all(individuals: list[dict], company_name: str) -> list[dict]:
    """Search tracked individuals — runs on both daily and weekly jobs.

    Finds conference talks, interviews, quotes, and announcements for each person.
    Replaces the weekly-only search_people function (keep search_people for compat).
    """
    results: list[dict] = []
    for person in individuals[:5]:
        name = person["name"]
        q1 = f'"{name}" "{company_name}"'
        q2 = f'"{name}" talk OR interview OR quote OR announcement OR "speaking at" OR keynote'
        hits = await search(q1, categories="general", time_range="week")
        hits += await search(q2, categories="general", time_range="week")
        for h in hits:
            h["person"] = name
        results.extend(hits)
    seen: set[str] = set()
    deduped: list[dict] = []
    for r in results:
        if r["url"] not in seen:
            seen.add(r["url"])
            deduped.append(r)
    return deduped
