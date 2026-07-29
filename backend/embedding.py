"""임베딩 유틸리티.

OpenAI API 호출은 openai_service.py 에서만 수행합니다.
이 파일은 하위 호환 래퍼 + cosine_similarity + build_track_text 를 제공합니다.

기존 코드에서 아래 이름을 그대로 import 해도 동작합니다:
    from embedding import (
        is_embedding_configured,
        get_embedding,
        get_embeddings_batch,
        cosine_similarity,
        build_track_text,
    )
"""

from __future__ import annotations

import math

import httpx

# openai_service 에 실제 구현이 있음 — 중복 제거
from openai_service import (
    create_embedding,
    create_embeddings_batch,
    is_configured as is_embedding_configured,
)


# ---------------------------------------------------------------------------
# 하위 호환 별칭 (music_api.py 등에서 emb.get_embedding() 형태로 호출)
# ---------------------------------------------------------------------------

async def get_embedding(
    client: httpx.AsyncClient,
    text: str,
) -> list[float] | None:
    """openai_service.create_embedding 위임 래퍼."""
    return await create_embedding(client, text)


async def get_embeddings_batch(
    client: httpx.AsyncClient,
    texts: list[str],
) -> list[list[float] | None]:
    """openai_service.create_embeddings_batch 위임 래퍼."""
    return await create_embeddings_batch(client, texts)


# ---------------------------------------------------------------------------
# 유틸리티 (openai_service 와 무관, 이 파일에만 존재)
# ---------------------------------------------------------------------------

def cosine_similarity(a: list[float], b: list[float]) -> float:
    """두 벡터의 코사인 유사도 (0.0 ~ 1.0)."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return max(0.0, min(1.0, dot / (norm_a * norm_b)))


def build_track_text(
    title: str,
    artist: str,
    genre_tags: list[str] | None = None,
    moods: list[str] | None = None,
    styles: list[str] | None = None,
) -> str:
    """임베딩 입력용 트랙 텍스트 구성.

    예: "Creep Radiohead alternative rock sad emotional piano"
    """
    parts = [title.strip(), artist.strip()]
    for tag in (genre_tags or [])[:6]:
        if tag.strip():
            parts.append(tag.strip())
    for m in (moods or [])[:3]:
        if m.strip():
            parts.append(m.strip())
    for s in (styles or [])[:3]:
        if s.strip():
            parts.append(s.strip())
    return " ".join(p for p in parts if p)
