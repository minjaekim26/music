"""Country / region filters for search and genre recommendations."""

from __future__ import annotations

import re
from typing import Any

COUNTRIES: dict[str, dict[str, Any]] = {
    "kr": {
        "label": "한국",
        "tags": ["korean", "korea", "k-pop", "kpop", "k pop"],
        "genre_hints": ["korean", "k-pop", "korea"],
        "artist_countries": ["korea", "south korea", "republic of korea"],
    },
    "jp": {
        "label": "일본",
        "tags": ["japanese", "japan", "j-pop", "jpop", "j pop", "anime", "anison"],
        "genre_hints": ["japanese", "j-pop", "japan", "anison", "anime"],
        "artist_countries": ["japan"],
    },
    "us": {
        "label": "미국",
        "tags": ["american", "usa", "united states"],
        "genre_hints": ["american"],
        "artist_countries": ["united states", "usa", "us", "america"],
    },
    "uk": {
        "label": "영국",
        "tags": ["british", "uk", "english", "united kingdom"],
        "genre_hints": ["uk ", "british", "english"],
        "artist_countries": ["united kingdom", "uk", "england", "britain", "scotland", "wales"],
    },
    "fr": {
        "label": "프랑스",
        "tags": ["french", "france", "francais", "français"],
        "genre_hints": ["french", "francophone", "chanson"],
        "artist_countries": ["france"],
    },
    "br": {
        "label": "브라질",
        "tags": ["brazilian", "brazil", "brasil", "funk carioca"],
        "genre_hints": ["brazilian", "brazil", "brasil", "sertanejo", "funk carioca"],
        "artist_countries": ["brazil", "brasil"],
    },
    "mx": {
        "label": "멕시코",
        "tags": ["mexican", "mexico", "mexicana", "música mexicana"],
        "genre_hints": ["mexican", "mexico", "musica mexicana", "norteno", "banda", "corrido"],
        "artist_countries": ["mexico"],
    },
    "latin": {
        "label": "라틴",
        "tags": ["latin", "latino", "latina", "reggaeton", "urbano latino", "latin pop"],
        "genre_hints": ["latin", "latino", "latina", "reggaeton", "sierreno", "urbano latino"],
        "artist_countries": ["mexico", "brazil", "brasil", "colombia", "argentina", "puerto rico", "cuba"],
    },
}


def list_countries() -> list[dict[str, str]]:
    return [{"id": cid, "label": cfg["label"]} for cid, cfg in COUNTRIES.items()]


def normalize_country(country: str | None) -> str | None:
    if not country or not str(country).strip():
        return None
    key = str(country).strip().lower()
    if key in COUNTRIES:
        return key
    for cid, cfg in COUNTRIES.items():
        if cfg["label"] == country.strip():
            return cid
    return None


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _tag_variants(country_id: str) -> set[str]:
    cfg = COUNTRIES.get(country_id)
    if not cfg:
        return set()
    out: set[str] = set()
    for hint in cfg["tags"]:
        h = _norm(hint).replace("-", " ")
        out.add(h)
        out.add(h.replace(" ", ""))
    return out


def _strict_tag_matches_country(tag: str, country_id: str) -> bool:
    """Exact / spacing-variant only — no substring (pop ≠ k-pop, focus ≠ us)."""
    tn = _norm(tag).replace("-", " ")
    if not tn:
        return False
    tn_compact = tn.replace(" ", "")
    return tn in _tag_variants(country_id) or tn_compact in _tag_variants(country_id)


def _strict_tags_match_any_country(tags: list[str], country_id: str) -> bool:
    return any(_strict_tag_matches_country(t, country_id) for t in tags)


def _conflicting_country_tag(tags: list[str], country_id: str) -> bool:
    """Another country's tag matches strictly (e.g. japanese while filtering kr)."""
    for cid in COUNTRIES:
        if cid == country_id:
            continue
        if _strict_tags_match_any_country(tags, cid):
            return True
    return False


def tags_match_country(tags: list[str], country_id: str | None) -> bool:
    if not country_id:
        return True
    if not tags:
        return False
    return _strict_tags_match_any_country(tags, country_id)


def artist_country_matches(artist_country: str | None, country_id: str | None) -> bool:
    if not country_id:
        return True
    if not artist_country:
        return False
    cfg = COUNTRIES.get(country_id)
    if not cfg:
        return True
    ac = _norm(artist_country)
    for hint in cfg["artist_countries"]:
        h = _norm(hint)
        if ac == h or h in ac.split(",") or ac.startswith(h + " ") or ac.endswith(" " + h):
            return True
        if len(h) >= 4 and h in ac:
            return True
    return False


def track_matches_country(
    *,
    country_id: str | None,
    tags: list[str] | None = None,
    artist_country: str | None = None,
    artist_tags: list[str] | None = None,
) -> bool:
    if not country_id:
        return True

    track_tags = list(tags or [])
    performer_tags = list(artist_tags or [])
    combined = track_tags + performer_tags

    # AudioDB nationality is authoritative when present
    if artist_country and artist_country.strip():
        return artist_country_matches(artist_country, country_id)

    # No nationality on file: require strict country tag, reject other-country tags
    if not combined:
        return False
    if _conflicting_country_tag(combined, country_id):
        return False
    return _strict_tags_match_any_country(combined, country_id)


def genre_name_matches_country(genre_name: str, country_id: str | None) -> bool:
    if not country_id:
        return True
    cfg = COUNTRIES.get(country_id)
    if not cfg:
        return True
    name = _norm(genre_name)
    for hint in cfg["genre_hints"]:
        h = _norm(hint)
        if h.endswith(" ") and name.startswith(h):
            return True
        if h in name or name.startswith(h):
            return True
    return False


def country_search_tag(country_id: str | None) -> str | None:
    if not country_id:
        return None
    cfg = COUNTRIES.get(country_id)
    if not cfg or not cfg["tags"]:
        return None
    return cfg["tags"][0]


# ponytail: O(n) substring scan; upgrade path → LLM country field in taste_analysis
_COUNTRY_QUERY_HINTS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("kr", ("한국", "korean", "korea", "k-pop", "kpop", "k pop", "k-hip", "k hip", "k-indie", "k indie", "국내", "한국어", "k-rap", "k rap")),
    ("jp", ("일본", "japanese", "japan", "j-pop", "jpop", "j pop", "anime", "anison", "j-hip", "j hip")),
    ("us", ("미국", "american", "usa", "atlanta", "atl rap", "west coast", "east coast")),
    ("uk", ("영국", "british", "uk ", " uk", "grime", "uk drill", "english rap")),
    ("fr", ("프랑스", "french", "france", "francais", "français")),
    ("br", ("브라질", "brazilian", "brazil", "brasil", "funk carioca", "sertanejo")),
    ("mx", ("멕시코", "mexican", "mexico", "música mexicana", "musica mexicana", "corrido", "banda")),
    ("latin", ("라틴", "latin", "latino", "latina", "reggaeton", "urbano latino")),
)


def infer_country_from_query(query: str) -> str | None:
    q = _norm(query)
    if not q:
        return None
    for cid, needles in _COUNTRY_QUERY_HINTS:
        if any(_norm(n) in q for n in needles):
            return cid
    return None
