"""임베딩 유틸 — OpenAI 호출은 openai_service에 위임."""

from __future__ import annotations

import math

from openai_service import create_embedding as get_embedding
from openai_service import is_configured as is_embedding_configured

__all__ = [
    "is_embedding_configured",
    "get_embedding",
    "cosine_similarity",
    "build_track_text",
]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return max(0.0, min(1.0, dot / (na * nb)))


def build_track_text(
    title: str,
    artist: str,
    genre_tags: list[str] | None = None,
    moods: list[str] | None = None,
    styles: list[str] | None = None,
) -> str:
    parts = [title.strip(), artist.strip()]
    for group, n in ((genre_tags, 6), (moods, 3), (styles, 3)):
        for item in (group or [])[:n]:
            if item.strip():
                parts.append(item.strip())
    return " ".join(p for p in parts if p)
