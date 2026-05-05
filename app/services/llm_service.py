"""
LLM service — primary + fallback, all config from environment variables.

Primary:  Llama 3.3 70B  (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL)
Fallback: Qwen3 32B      (FALLBACK_LLM_BASE_URL / FALLBACK_LLM_API_KEY / FALLBACK_LLM_MODEL)

Swap either model/endpoint by changing .env only — no code changes required.
Fallback is activated automatically when the primary fails all retries.
"""

import json
import logging
import re
from typing import Any, Optional

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from config import (
    FALLBACK_LLM_API_KEY,
    FALLBACK_LLM_BASE_URL,
    FALLBACK_LLM_ENABLED,
    FALLBACK_LLM_MODEL,
    LLM_API_KEY,
    LLM_BASE_URL,
    LLM_MAX_TOKENS,
    LLM_MODEL,
    LLM_TEMPERATURE,
)

log = logging.getLogger(__name__)

_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=120.0)
    return _client


def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> blocks from reasoning models (Qwen3, DeepSeek, etc.)."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# Low-level: single-endpoint completion with retry
# ---------------------------------------------------------------------------

@retry(wait=wait_exponential(multiplier=1, min=2, max=30), stop=stop_after_attempt(3))
async def _do_chat(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> str:
    url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    resp = await _get_client().post(url, json=payload, headers=_headers(api_key))
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    return _strip_thinking(content)


@retry(wait=wait_exponential(multiplier=1, min=2, max=30), stop=stop_after_attempt(3))
async def _do_json(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    url = f"{base_url}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }
    try:
        resp = await _get_client().post(url, json=payload, headers=_headers(api_key))
        resp.raise_for_status()
        content = _strip_thinking(resp.json()["choices"][0]["message"]["content"])
        return json.loads(content)
    except Exception:
        # Some endpoints don't support response_format — retry without it
        del payload["response_format"]
        resp = await _get_client().post(url, json=payload, headers=_headers(api_key))
        resp.raise_for_status()
        content = _strip_thinking(resp.json()["choices"][0]["message"]["content"])
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not parse JSON from LLM response: {content[:200]}")


# ---------------------------------------------------------------------------
# Public API — primary with automatic fallback to Qwen3 32B
# ---------------------------------------------------------------------------

async def chat_completion(
    messages: list[dict[str, str]],
    temperature: float = LLM_TEMPERATURE,
    max_tokens: int = LLM_MAX_TOKENS,
) -> str:
    try:
        return await _do_chat(LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, messages, temperature, max_tokens)
    except Exception as primary_exc:
        if not FALLBACK_LLM_ENABLED:
            raise
        log.warning("Primary LLM failed (%s) — falling back to %s", primary_exc, FALLBACK_LLM_MODEL)
        return await _do_chat(
            FALLBACK_LLM_BASE_URL, FALLBACK_LLM_API_KEY, FALLBACK_LLM_MODEL,
            messages, temperature, max_tokens,
        )


async def json_completion(
    messages: list[dict[str, str]],
    temperature: float = 0.1,
    max_tokens: int = LLM_MAX_TOKENS,
) -> dict[str, Any]:
    try:
        return await _do_json(LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, messages, temperature, max_tokens)
    except Exception as primary_exc:
        if not FALLBACK_LLM_ENABLED:
            raise
        log.warning("Primary LLM failed (%s) — falling back to %s", primary_exc, FALLBACK_LLM_MODEL)
        return await _do_json(
            FALLBACK_LLM_BASE_URL, FALLBACK_LLM_API_KEY, FALLBACK_LLM_MODEL,
            messages, temperature, max_tokens,
        )


async def close() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None
