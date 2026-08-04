"""OpenAI-compatible LLM env — Gemini(기본), Groq, OpenRouter, OpenAI."""

from __future__ import annotations

import os
import time

# Google Gemini free tier — 2.5-flash-lite는 신규 키 404 → 2.0-flash-lite
_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai"
_GEMINI_MODEL = "gemini-2.0-flash-lite"
_RATE_LIMIT_COOLDOWN_SEC = 120.0
_rate_limit_until: float = 0.0


def mark_rate_limited(cooldown: float = _RATE_LIMIT_COOLDOWN_SEC) -> None:
    """429/quota 후 잠시 LLM 호출 스킵 — rules/fallback만 사용."""
    global _rate_limit_until
    _rate_limit_until = time.monotonic() + cooldown


def is_rate_limited() -> bool:
    return time.monotonic() < _rate_limit_until


def api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def is_configured() -> bool:
    return bool(api_key())


def base_url() -> str:
    return os.getenv("OPENAI_BASE_URL", _GEMINI_BASE).rstrip("/")


def chat_model() -> str:
    return (
        os.getenv("OPENAI_CHAT_MODEL", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or _GEMINI_MODEL
    )


def counsel_model() -> str:
    """AI DJ 답변·장르 설명 — 품질 우선 (기본 flash, lite 아님)."""
    return (
        os.getenv("OPENAI_COUNSEL_MODEL", "").strip()
        or os.getenv("OPENAI_CHAT_MODEL", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or "gemini-2.5-flash"
    )


def headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key()}",
        "Content-Type": "application/json",
    }


def provider_label() -> str:
    url = base_url().lower()
    if "generativelanguage.googleapis.com" in url:
        return "gemini"
    if "groq.com" in url:
        return "groq"
    if "openrouter.ai" in url:
        return "openrouter"
    if "openai.com" in url:
        return "openai"
    return "openai-compatible"
