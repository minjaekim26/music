"""비공식·커버·YT 업로드 곡의 제목/아티스트 정규화."""

from __future__ import annotations

import re

_UNOFFICIAL_SUFFIX_RE = re.compile(
    r"\s*[\(\[]"
    r"(official\s*(music\s*)?video|lyrics?|audio|mv|cover|remix|live|"
    r"sped\s*up|slowed|8d|extended|fan\s*made|visualizer)"
    r"[\)\]]",
    re.I,
)
_FEAT_RE = re.compile(r"\s*[\(\[](feat\.?|ft\.?)[^)\]]+[\)\]]", re.I)


def _simplify(text: str) -> str:
    return "".join(ch.lower() for ch in text if ch.isalnum() or ch.isspace()).strip()


def _overlap(a: str, b: str) -> float:
    ta = set(_simplify(a).split())
    tb = set(_simplify(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _strip_noise(title: str) -> str:
    cleaned = _FEAT_RE.sub("", title)
    cleaned = _UNOFFICIAL_SUFFIX_RE.sub("", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip(" -")


def normalize_for_genre_lookup(title: str, artist: str) -> tuple[str, str]:
    """
    비공식 메타데이터를 장르 API 조회용으로 정리.

    예:
      artist=Justified Melody, title=Drake - God's Plan (Lyrics)
        -> Drake, God's Plan
    """
    title = (title or "").strip()
    artist = (artist or "").strip()
    if not title:
        return artist, title

    if " - " in title:
        left, right = title.split(" - ", 1)
        left, right = left.strip(), _strip_noise(right.strip())
        if left and right and _overlap(left, artist) < 0.35 and len(left.split()) <= 5:
            artist, title = left, right
        else:
            title = _strip_noise(title)
    else:
        title = _strip_noise(title)

    return artist.strip(), title.strip()
