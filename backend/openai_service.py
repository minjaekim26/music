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


async def chat_completion(
    client: httpx.AsyncClient,
    messages: list[dict[str, str]],
) -> tuple[str, str]:
    """Return (assistant_text, model_name). Raises on missing key; empty string if API error."""
    if not is_configured():
        raise ValueError("OpenAI API 키가 설정되지 않았습니다.")

    model = (
        os.getenv("OPENAI_CHAT_MODEL", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or _CHAT_MODEL
    )
    system = {
        "role": "system",
        "content": (
            "당신은 distribution 음악 탐색 앱의 AI 어시스턴트입니다. "
            "음악 검색, 장르 설명, 아티스트·곡 추천, playlist 아이디어, 취향 상담을 "
            "친근한 한국어로 도와줍니다. "
            "앱 기능: 곡/아티스트 검색, Every Noise 장르 맵, 키워드·자연어 취향 추천, 유사곡. "
            "모르는 정보는 지어내지 말고, 구체적인 검색어나 장르를 제안하세요."
        ),
    }
    payload_messages = [system]
    for m in messages[-20:]:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            payload_messages.append({"role": role, "content": content[:4000]})

    if len(payload_messages) < 2:
        raise ValueError("메시지가 비어 있습니다.")

    resp = await client.post(
        f"{_base_url()}/chat/completions",
        headers=_headers(),
        json={
            "model": model,
            "messages": payload_messages,
            "max_tokens": 800,
            "temperature": 0.75,
        },
        timeout=60.0,
    )
    if resp.status_code >= 400:
        logger.warning("OpenAI chat failed: %s %s", resp.status_code, resp.text[:300])
        raise RuntimeError("OpenAI 응답 오류")
    content = (resp.json()["choices"][0]["message"].get("content") or "").strip()
    if not content:
        raise RuntimeError("OpenAI가 빈 응답을 반환했습니다.")
    return content, model


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
