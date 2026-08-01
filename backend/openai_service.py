"""OpenAI embeddings + chat. Key 없거나 실패해도 서버는 계속 동작."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_OPENAI_BASE = "https://api.openai.com/v1"
_EMBED_MODEL = "text-embedding-3-small"
_CHAT_MODEL = "gpt-4o-mini"
_MAX_REASON_TRACKS = 5


def _api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def is_configured() -> bool:
    return bool(_api_key())


def _base_url() -> str:
    return os.getenv("OPENAI_BASE_URL", _OPENAI_BASE).rstrip("/")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


async def create_embedding(client: httpx.AsyncClient, text: str) -> list[float] | None:
    if not is_configured() or not text.strip():
        return None
    model = os.getenv("OPENAI_EMBED_MODEL", _EMBED_MODEL)
    try:
        resp = await client.post(
            f"{_base_url()}/embeddings",
            headers=_headers(),
            json={"model": model, "input": text[:8192]},
            timeout=20.0,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
    except Exception:
        return None


def _track_reason_bits(tracks: list[dict], limit: int = 3) -> list[str]:
    bits: list[str] = []
    for t in tracks[:6]:
        for r in t.get("reasons") or ([t["reason"]] if t.get("reason") else []):
            text = str(r).strip()
            if text and text not in bits:
                bits.append(text)
            if len(bits) >= limit:
                return bits
    return bits


def fallback_recommendation_reason(user_query: str, tracks: list[dict]) -> str:
    if not tracks:
        return ""
    query = (user_query or "").strip() or "요청하신 취향"
    artists = list(
        dict.fromkeys(a for t in tracks[:4] if (a := (t.get("artist") or "").strip()))
    )
    focus = ", ".join(_track_reason_bits(tracks)) or "비슷한 분위기와 장르"
    artist_part = f"{', '.join(artists[:2])} 등의 곡" if artists else "선별된 곡들"
    return f"「{query}」에 맞춰 {focus} 기준으로 골랐어요. {artist_part}이 잘 어울립니다."


def _build_reason_prompt(user_query: str, tracks: list[dict]) -> str:
    lines = [
        f'사용자가 다음을 요청했습니다: "{user_query}"',
        "",
        "아래 음악들이 추천되었습니다:",
    ]
    for i, t in enumerate(tracks[:_MAX_REASON_TRACKS], 1):
        tags = ", ".join((t.get("genre_tags") or [])[:4])
        reasons = t.get("reasons") or t.get("recommendation_reasons") or []
        if isinstance(reasons, str):
            reasons = [reasons]
        reason_text = "; ".join(reasons[:2]) or str(t.get("reason") or "")
        line = f"{i}. {t.get('title', '')} — {t.get('artist', '')}"
        if tags:
            line += f"  [장르: {tags}]"
        if reason_text:
            line += f"  ({reason_text})"
        lines.append(line)
    lines += [
        "",
        "위 추천 결과 전체에 대해 사용자의 요청과 어떻게 연결되는지",
        "자연스럽고 따뜻한 한국어로 2~3문장으로 설명해주세요.",
        "각 곡을 나열하지 말고 전체적인 큐레이션 이유를 설명하세요.",
    ]
    return "\n".join(lines)


async def generate_recommendation_reason(
    client: httpx.AsyncClient,
    user_query: str,
    tracks: list[dict],
) -> str:
    if not tracks:
        return ""
    fallback = fallback_recommendation_reason(user_query, tracks)
    if not is_configured():
        return fallback

    model = (
        os.getenv("OPENAI_CHAT_MODEL", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or _CHAT_MODEL
    )
    try:
        resp = await client.post(
            f"{_base_url()}/chat/completions",
            headers=_headers(),
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "당신은 음악 큐레이터입니다. "
                            "사용자의 음악 취향에 맞는 추천 결과를 "
                            "따뜻하고 자연스러운 한국어로만 설명합니다."
                        ),
                    },
                    {"role": "user", "content": _build_reason_prompt(user_query, tracks)},
                ],
                "max_tokens": 300,
                "temperature": 0.7,
            },
            timeout=45.0,
        )
        if resp.status_code >= 400:
            logger.warning("OpenAI chat failed: %s %s", resp.status_code, resp.text[:300])
            return fallback
        content = (resp.json()["choices"][0]["message"].get("content") or "").strip()
        return content or fallback
    except Exception as exc:
        logger.warning("OpenAI recommendation_reason failed: %s", exc)
        return fallback
