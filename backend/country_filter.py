"""Country / region filters for search and genre recommendations."""

from __future__ import annotations

import re
from typing import Any

# id -> filter config (tags + genre-name hints + artist country strings)
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
        "tags": ["american", "usa", "us"],
        "genre_hints": ["american"],
        "artist_countries": ["united states", "usa", "us", "america"],
    },
    "uk": {
        "label": "영국",
        "tags": ["british", "uk", "english"],
        "genre_hints": ["uk ", "british", "english"],
        "artist_countries": ["united kingdom", "uk", "england", "britain", "scotland", "wales"],
    },
    "fr": {
        "label": "프랑스",
        "tags": ["french", "france", "francais"],
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
        "tags": ["mexican", "mexico", "mexicana"],
        "genre_hints": ["mexican", "mexico", "musica mexicana", "norteno", "banda", "corrido"],
        "artist_countries": ["mexico"],
    },
    "latin": {
        "label": "라틴",
        "tags": ["latin", "latino", "latina", "reggaeton", "urbano latino"],
        "genre_hints": ["latin", "latino", "latina", "reggaeton", "sierreno", "urbano latino"],
        "artist_countries": [],
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


def _tag_matches_country(tag: str, country_id: str) -> bool:
    cfg = COUNTRIES.get(country_id)
    if not cfg:
        return True
    tn = _norm(tag)
    if not tn:
        return False
    for hint in cfg["tags"]:
        h = _norm(hint)
        if tn == h or h in tn or tn in h:
            return True
    return False


def tags_match_country(tags: list[str], country_id: str | None) -> bool:
    if not country_id:
        return True
    if not tags:
        return False
    return any(_tag_matches_country(t, country_id) for t in tags)


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
        if h in ac or ac in h:
            return True
    return False


def track_matches_country(
    *,
    country_id: str | None,
    tags: list[str] | None = None,
    artist_country: str | None = None,
) -> bool:
    if not country_id:
        return True
    if artist_country_matches(artist_country, country_id):
        return True
    return tags_match_country(tags or [], country_id)


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
    """Primary Last.fm tag to bias search toward a country."""
    if not country_id:
        return None
    cfg = COUNTRIES.get(country_id)
    if not cfg or not cfg["tags"]:
        return None
    return cfg["tags"][0]
