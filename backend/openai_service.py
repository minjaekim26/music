"""OpenAI 전용 서비스 레이어.

모든 OpenAI API 호출(Embeddings + Chat)은 이 파일에서만 수행합니다.
OPENAI_API_KEY 미설정 / API 실패 시 None 또는 빈 문자열을 반환하며
호출부는 별도 예외 처리 없이 폴백 동작합니다.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

_OPENAI_BASE = "https://api.openai.com/v1"
_EMBED_MODEL = "text-embedding-3-small"
_CHAT_MODEL = "gpt-4.1-mini"
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
        reasons = "; ".join((t.get("recommendation_reasons") or [])[:2])
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


async def generate_recommendation_reason(
    client: httpx.AsyncClient,
    user_query: str,
    tracks: list[dict],
) -> str:
    """추천 결과에 대한 GPT 설명 생성. 실패 시 빈 문자열 반환.

    Parameters
    ----------
    client:
        공유 httpx.AsyncClient.
    user_query:
        사용자가 입력한 원문 검색어 또는 취향 설명.
    tracks:
        추천 트랙 목록 (title, artist, genre_tags, recommendation_reasons 포함).
    """
    if not is_configured() or not tracks:
        return ""

    model = os.getenv("OPENAI_CHAT_MODEL", _CHAT_MODEL)
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
                            "따뜻하고 자연스러운 한국어로 설명합니다."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": 300,
                "temperature": 0.7,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        data: Any = resp.json()
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return ""
