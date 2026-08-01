"""OpenAI 전용 서비스 레이어.

모든 OpenAI API 호출(Embeddings + Chat)은 이 파일에서만 수행합니다.
OPENAI_API_KEY 미설정 / API 실패 시 None 또는 빈 문자열을 반환하며
호출부는 별도 예외 처리 없이 폴백 동작합니다.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_OPENAI_BASE = "https://api.openai.com/v1"
_EMBED_MODEL = "text-embedding-3-small"
# taste_analysis.py 와 동일한 기본 모델 (gpt-4.1-mini 는 계정/플랜에 따라 404)
_CHAT_MODEL = "gpt-4o-mini"
_MAX_REASON_TRACKS = 5  # GPT에 넘길 트랙 수 상한


# ---------------------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------------------

def _api_key() -> str:
    return os.getenv("OPENAI_API_KEY", "").strip()


def is_configured() -> bool:
    """OPENAI_API_KEY 설정 여부 — 서버 시작 조건에 영향 없음."""
    return bool(_api_key())


def _base_url() -> str:
    return os.getenv("OPENAI_BASE_URL", _OPENAI_BASE).rstrip("/")


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

async def create_embedding(
    client: httpx.AsyncClient,
    text: str,
) -> list[float] | None:
    """텍스트 → embedding 벡터. 실패 시 None 반환 (서버 중단 없음).

    Parameters
    ----------
    client:
        공유 httpx.AsyncClient (main.py lifespan에서 주입).
    text:
        임베딩할 텍스트 (최대 8192 토큰).
    """
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
        data: Any = resp.json()
        return data["data"][0]["embedding"]
    except Exception:
        return None


async def create_embeddings_batch(
    client: httpx.AsyncClient,
    texts: list[str],
) -> list[list[float] | None]:
    """여러 텍스트를 한 번의 API 호출로 임베딩. 실패한 항목은 None."""
    if not is_configured() or not texts:
        return [None] * len(texts)

    model = os.getenv("OPENAI_EMBED_MODEL", _EMBED_MODEL)
    cleaned = [t[:8192] if t else "" for t in texts]

    try:
        resp = await client.post(
            f"{_base_url()}/embeddings",
            headers=_headers(),
            json={"model": model, "input": cleaned},
            timeout=30.0,
        )
        resp.raise_for_status()
        data: Any = resp.json()
        result: list[list[float] | None] = [None] * len(texts)
        for item in data["data"]:
            idx = item.get("index", 0)
            if 0 <= idx < len(result):
                result[idx] = item["embedding"]
        return result
    except Exception:
        return [None] * len(texts)


# ---------------------------------------------------------------------------
# Chat — 추천 이유 생성
# ---------------------------------------------------------------------------

def _build_reason_prompt(user_query: str, tracks: list[dict]) -> str:
    lines = [
        f"사용자가 다음을 요청했습니다: \"{user_query}\"",
        "",
        "아래 음악들이 추천되었습니다:",
    ]
    for i, t in enumerate(tracks[:_MAX_REASON_TRACKS], 1):
        title = t.get("title", "")
        artist = t.get("artist", "")
        tags = ", ".join((t.get("genre_tags") or [])[:4])
        # music_api 는 reasons / reason 필드를 사용
        reason_list = t.get("reasons") or t.get("recommendation_reasons") or []
        if isinstance(reason_list, str):
            reason_list = [reason_list]
        reasons = "; ".join(reason_list[:2])
        if not reasons and t.get("reason"):
            reasons = str(t.get("reason"))
        line = f"{i}. {title} — {artist}"
        if tags:
            line += f"  [장르: {tags}]"
        if reasons:
            line += f"  ({reasons})"
        lines.append(line)

    lines += [
        "",
        "위 추천 결과 전체에 대해 사용자의 요청과 어떻게 연결되는지",
        "자연스럽고 따뜻한 한국어로 2~3문장으로 설명해주세요.",
        "각 곡을 나열하지 말고 전체적인 큐레이션 이유를 설명하세요.",
    ]
    return "\n".join(lines)


def fallback_recommendation_reason(user_query: str, tracks: list[dict]) -> str:
    """GPT 실패 시에도 UI에 보여줄 간단한 한국어 설명."""
    if not tracks:
        return ""

    query = (user_query or "").strip() or "요청하신 취향"
    artists = list(
        dict.fromkeys(
            (t.get("artist") or "").strip() for t in tracks[:4] if (t.get("artist") or "").strip()
        )
    )
    reason_bits: list[str] = []
    for t in tracks[:6]:
        for r in t.get("reasons") or ([] if not t.get("reason") else [t["reason"]]):
            text = str(r).strip()
            if text and text not in reason_bits:
                reason_bits.append(text)
            if len(reason_bits) >= 3:
                break
        if len(reason_bits) >= 3:
            break

    focus = ", ".join(reason_bits) if reason_bits else "비슷한 분위기와 장르"
    artist_part = f"{', '.join(artists[:2])} 등의 곡" if artists else "선별된 곡들"
    return (
        f"「{query}」에 맞춰 {focus} 기준으로 골랐어요. "
        f"{artist_part}이 잘 어울립니다."
    )


async def generate_recommendation_reason(
    client: httpx.AsyncClient,
    user_query: str,
    tracks: list[dict],
) -> str:
    """추천 결과에 대한 GPT 설명 생성. 실패 시 한국어 폴백 반환."""
    if not tracks:
        return ""

    fallback = fallback_recommendation_reason(user_query, tracks)

    if not is_configured():
        return fallback

    # OPENAI_CHAT_MODEL → OPENAI_MODEL → gpt-4o-mini (taste_analysis 와 통일)
    model = (
        os.getenv("OPENAI_CHAT_MODEL", "").strip()
        or os.getenv("OPENAI_MODEL", "").strip()
        or _CHAT_MODEL
    )
    prompt = _build_reason_prompt(user_query, tracks)

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
                            "따뜻하고 자연스러운 한국어로 설명합니다. "
                            "반드시 한국어로만 답하세요."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 300,
                "temperature": 0.7,
            },
            timeout=45.0,
        )
        if resp.status_code >= 400:
            logger.warning(
                "OpenAI chat failed: status=%s body=%s",
                resp.status_code,
                resp.text[:300],
            )
            return fallback
        data: Any = resp.json()
        content = (data["choices"][0]["message"].get("content") or "").strip()
        return content or fallback
    except Exception as exc:
        logger.warning("OpenAI recommendation_reason failed: %s", exc)
        return fallback
