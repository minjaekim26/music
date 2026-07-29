from __future__ import annotations

import asyncio
import math
import os
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from audiodb_api import enrich_ui, get_album, search_artist, search_track as adb_search_track
from genre_map import (
    build_genre_profile,
    collect_subgenre_focus_nodes,
    filter_leaf_genre_names,
    genre_similarity_between,
    get_genre_map,
    get_map_bounds,
    map_distance_similarity,
)
from lastfm_api import (
    get_artist_top_tags,
    get_similar_tracks as lf_similar,
    get_top_tracks_by_tag,
    get_track_info as lf_track_info,
    is_configured as lf_configured,
    search_tracks as lf_search,
)
from platform_search import (
    fetch_soundcloud_genre_tags,
    search_soundcloud_tracks,
    search_spotify_tracks,
    search_ytmusic_tracks,
    soundcloud_configured,
    spotify_artist_genres,
    spotify_configured,
    ytmusic_authenticated,
    youtube_api_configured,
)
from search_aliases import expand_search_queries, has_hangul, init_search_aliases_db
from track_metadata import normalize_for_genre_lookup

USER_AGENT = os.getenv(
    "MUSICBRAINZ_USER_AGENT",
    "MusicExplorer/1.0 (selendi1511@gmail.com)",
)
MB_BASE = "https://musicbrainz.org/ws/2"
DZ_BASE = "https://api.deezer.com"

_mb_lock = asyncio.Lock()
_last_mb_request = 0.0

init_search_aliases_db()


async def _mb_get(
    client: httpx.AsyncClient,
    path: str,
    params: dict | None = None,
    *,
    not_found_ok: bool = False,
) -> dict | None:
    global _last_mb_request
    async with _mb_lock:
        elapsed = time.monotonic() - _last_mb_request
        if elapsed < 1.05:
            await asyncio.sleep(1.05 - elapsed)
        _last_mb_request = time.monotonic()

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    resp = await client.get(f"{MB_BASE}{path}", params=params, headers=headers, timeout=20.0)
    if resp.status_code == 404 and not_found_ok:
        return None
    resp.raise_for_status()
    return resp.json()


async def _dz_get(client: httpx.AsyncClient, path: str, params: dict | None = None) -> dict:
    resp = await client.get(f"{DZ_BASE}{path}", params=params, timeout=20.0)
    resp.raise_for_status()
    return resp.json()


def _format_ms(ms: int | None) -> str | None:
    if not ms:
        return None
    total_sec = ms // 1000
    minutes, seconds = divmod(total_sec, 60)
    return f"{minutes}:{seconds:02d}"


def _artist_name(credits: list[dict]) -> str:
    return " ".join(c["name"] if isinstance(c, dict) else str(c) for c in credits)


def _normalize_key(title: str, artist: str) -> str:
    return f"{title.strip().lower()}|{artist.strip().lower()}"


def _simplify(text: str) -> str:
    return "".join(ch.lower() for ch in text if ch.isalnum() or ch.isspace()).strip()


def _token_overlap(a: str, b: str) -> float:
    ta = set(_simplify(a).split())
    tb = set(_simplify(b).split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _is_cover_or_variant(title: str) -> bool:
    lowered = title.lower()
    skip_words = (
        "piano",
        "karaoke",
        "instrumental",
        "cover",
        "remix",
        "live at",
        "tribute",
        "rendition",
        "8-bit",
        "lullaby",
    )
    return any(word in lowered for word in skip_words)


def _score_deezer_match(track: dict, title: str, artist: str) -> float:
    track_title = track.get("title", "")
    track_artist = track.get("artist", {}).get("name", "")
    title_score = _token_overlap(title, track_title)
    artist_score = _token_overlap(artist, track_artist)
    score = title_score * 0.55 + artist_score * 0.45
    if _is_cover_or_variant(track_title):
        score -= 0.35
    if _simplify(title) in _simplify(track_title) or _simplify(track_title) in _simplify(title):
        score += 0.15
    return score


def _pick_best_deezer_match(tracks: list[dict], title: str, artist: str) -> dict | None:
    if not tracks:
        return None
    ranked = sorted(tracks, key=lambda t: _score_deezer_match(t, title, artist), reverse=True)
    best = ranked[0]
    return best if _score_deezer_match(best, title, artist) >= 0.25 else None


async def _find_deezer_track(client: httpx.AsyncClient, title: str, artist: str) -> dict | None:
    queries = [f'artist:"{artist}" track:"{title}"', f"{title} {artist}"]
    candidates: list[dict] = []
    seen_ids: set[int] = set()

    for q in queries:
        try:
            data = await _dz_get(client, "/search", {"q": q, "limit": "15"})
        except httpx.HTTPError:
            continue
        for track in data.get("data", []):
            track_id = track.get("id")
            if track_id in seen_ids:
                continue
            seen_ids.add(track_id)
            candidates.append(track)

    return _pick_best_deezer_match(candidates, title, artist)


async def _fetch_mb_recording(client: httpx.AsyncClient, mbid: str) -> dict | None:
    return await _mb_get(
        client,
        f"/recording/{mbid}",
        {"inc": "artist-credits+tags+genres+releases", "fmt": "json"},
        not_found_ok=True,
    )


async def _fetch_mb_artist_genres(client: httpx.AsyncClient, artist_mbid: str) -> tuple[list[str], list[str]]:
    data = await _mb_get(
        client,
        f"/artist/{artist_mbid}",
        {"inc": "tags+genres", "fmt": "json"},
        not_found_ok=True,
    )
    if not data:
        return [], []
    tags = sorted(
        [t["name"] for t in data.get("tags", []) if t.get("name")],
        key=lambda n: next((t.get("count", 0) for t in data.get("tags", []) if t["name"] == n), 0),
        reverse=True,
    )
    genres = [g["name"] for g in data.get("genres", []) if g.get("name")]
    return tags[:20], genres[:15]


def _collect_tags(
    *,
    lf_info: dict,
    lf_artist_tags: list[dict],
    mb_rec: dict | None,
    mb_artist_tags: list[str],
    mb_artist_genres: list[str],
    adb_track: dict | None,
    adb_artist: dict | None,
) -> tuple[list[str], list[float]]:
    weighted: list[tuple[str, float]] = []

    for t in lf_info.get("tags", []):
        weighted.append((t["name"], min(3.0, 1.0 + t.get("count", 0) / 100)))

    for t in lf_artist_tags:
        weighted.append((t["name"], min(2.5, 0.8 + t.get("count", 0) / 150)))

    for g in mb_artist_genres:
        weighted.append((g, 2.0))
    for t in mb_artist_tags[:10]:
        weighted.append((t, 1.2))

    if mb_rec:
        for g in mb_rec.get("genres", []):
            if g.get("name"):
                weighted.append((g["name"], 2.2))
        for t in mb_rec.get("tags", []):
            if t.get("name"):
                weighted.append((t["name"], 1.0))

    if adb_track:
        for field in ("strGenre", "strStyle", "strMood"):
            val = adb_track.get(field)
            if val:
                for part in val.replace("/", ",").split(","):
                    part = part.strip()
                    if part:
                        weighted.append((part, 1.8))

    if adb_artist:
        for field in ("strGenre", "strStyle", "strMood"):
            val = adb_artist.get(field)
            if val:
                for part in val.replace("/", ",").split(","):
                    part = part.strip()
                    if part:
                        weighted.append((part, 1.5))

    if not weighted:
        return [], []

    tags = [w[0] for w in weighted]
    weights = [w[1] for w in weighted]
    return tags, weights


def _apply_genre_heuristics(tags: list[str], weights: list[float]) -> tuple[list[str], list[float]]:
    """태그 조합으로 hyperpop·korean hyperpop 등을 보강 (Last.fm 메타가 부정확할 때)."""
    if not tags:
        return tags, weights

    combined = " ".join(t.lower().strip() for t in tags)

    def has(*needles: str) -> bool:
        return any(n in combined for n in needles)

    out_tags = list(tags)
    out_weights = list(weights)

    plugg = has("pluggnb", "plugg")
    hyper = has("hyperpop", "hyper pop", "hyper-pop", "glitchcore", "digicore", "digi core")
    korean = has("korean", "korea", "k-pop", "kpop", "k pop")

    if plugg and korean and not hyper:
        out_tags.extend(["korean hyperpop", "hyperpop"])
        out_weights.extend([3.5, 3.0])
    elif plugg and not hyper:
        out_tags.append("hyperpop")
        out_weights.append(2.5)

    if has("digicore", "digi core", "digi-core") and not has("glitchcore"):
        out_tags.append("glitchcore")
        out_weights.append(2.0)

    return out_tags, out_weights


async def _infer_genre_tags_fallback(
    client: httpx.AsyncClient,
    artist: str,
    title: str,
) -> tuple[list[str], list[float]]:
    """비공식 곡: MusicBrainz·Spotify·Last.fm 유사 정식곡으로 장르 추정."""
    weighted: list[tuple[str, float]] = []

    try:
        mb_search = await _mb_get(
            client,
            "/recording",
            {"query": f'recording:"{title}" AND artist:"{artist}"', "fmt": "json", "limit": "5"},
        )
        if isinstance(mb_search, dict):
            for rec in mb_search.get("recordings", [])[:3]:
                rec_id = rec.get("id")
                if not rec_id:
                    continue
                full = await _fetch_mb_recording(client, rec_id)
                if not full:
                    continue
                for g in full.get("genres", []):
                    if g.get("name"):
                        weighted.append((g["name"], 1.8))
                for t in full.get("tags", []):
                    if t.get("name"):
                        weighted.append((t["name"], 1.0))
    except httpx.HTTPError:
        pass

    if len(weighted) < 2:
        try:
            art_search = await _mb_get(
                client,
                "/artist",
                {"query": artist, "fmt": "json", "limit": "3"},
            )
            if isinstance(art_search, dict):
                for art in art_search.get("artists", [])[:2]:
                    art_id = art.get("id")
                    if not art_id:
                        continue
                    tags, genres = await _fetch_mb_artist_genres(client, art_id)
                    for g in genres:
                        weighted.append((g, 1.6))
                    for t in tags[:8]:
                        weighted.append((t, 1.0))
        except httpx.HTTPError:
            pass

    if spotify_configured() and len(weighted) < 3:
        for genre in await spotify_artist_genres(client, artist):
            weighted.append((genre.replace("-", " "), 1.4))

    if lf_configured() and len(weighted) < 3:
        try:
            hits = await lf_search(client, f"{artist} {title}", limit=5)
            for hit in hits[:2]:
                info = await lf_track_info(
                    client,
                    artist=hit.get("artist", artist),
                    track=hit.get("title", title),
                    mbid=hit.get("mbid"),
                )
                for t in info.get("tags", []):
                    weighted.append((t["name"], 1.2))
                if info.get("tags"):
                    break
        except httpx.HTTPError:
            pass

    if not weighted:
        return [], []

    return [w[0] for w in weighted], [w[1] for w in weighted]


async def _search_deezer_tracks(client: httpx.AsyncClient, query: str, limit: int) -> list[dict]:
    try:
        data = await _dz_get(client, "/search", {"q": query, "limit": str(limit)})
    except httpx.HTTPError:
        return []

    out: list[dict] = []
    for track in data.get("data", []):
        artist = track.get("artist", {}).get("name", "")
        title = track.get("title", "")
        if not title or not artist:
            continue
        out.append(
            {
                "title": title,
                "artist": artist,
                "mbid": None,
                "duration": _format_ms(int(track.get("duration", 0) or 0) * 1000),
                "source": "deezer",
                "listeners": 0,
                "commercial_score": 0,
                "cover": track.get("album", {}).get("cover_medium"),
                "deezer_id": track.get("id"),
            }
        )
    return out


def _merge_source_label(prev: str | None, new: str) -> str:
    if not prev or prev == new:
        return new
    if new in prev.split("+"):
        return prev
    return f"{prev}+{new}"


def _merge_search_hit(results: dict[str, dict], hit: dict) -> None:
    key = _normalize_key(hit.get("title", ""), hit.get("artist", ""))
    existing = results.get(key, {})
    source = _merge_source_label(existing.get("source"), hit.get("source", ""))
    results[key] = {
        "mbid": hit.get("mbid") or existing.get("mbid"),
        "title": hit.get("title") or existing.get("title"),
        "artist": hit.get("artist") or existing.get("artist"),
        "duration": hit.get("duration") or existing.get("duration"),
        "source": source,
        "listeners": max(int(hit.get("listeners") or 0), int(existing.get("listeners") or 0)),
        "commercial_score": max(
            int(hit.get("commercial_score") or 0),
            int(existing.get("commercial_score") or 0),
        ),
        "cover": hit.get("cover") or existing.get("cover"),
        "deezer_id": hit.get("deezer_id") or existing.get("deezer_id"),
        "spotify_id": hit.get("spotify_id") or existing.get("spotify_id"),
        "soundcloud_id": hit.get("soundcloud_id") or existing.get("soundcloud_id"),
        "yt_video_id": hit.get("yt_video_id") or existing.get("yt_video_id"),
        "external_url": hit.get("external_url") or existing.get("external_url"),
    }


async def _musicbrainz_expand_hangul_query(client: httpx.AsyncClient, query: str) -> str | None:
    """MusicBrainz 아티스트 검색으로 한글 검색어를 영문명으로 보완."""
    if not has_hangul(query):
        return None
    try:
        data = await _mb_get(
            client,
            "/artist",
            {"query": query, "fmt": "json", "limit": "5"},
        )
    except httpx.HTTPError:
        return None
    if not isinstance(data, dict):
        return None

    for artist in data.get("artists", []):
        for key in ("name", "sort-name"):
            name = (artist.get(key) or "").strip()
            if name and not has_hangul(name):
                return name
    return None


async def _gather_search_hits(
    client: httpx.AsyncClient,
    query: str,
    fetch_limit: int,
) -> tuple[list[dict], dict[str, bool]]:
    lf_task = lf_search(client, query, limit=fetch_limit) if lf_configured() else asyncio.sleep(0, result=[])
    mb_task = _mb_get(
        client,
        "/recording",
        {"query": query, "fmt": "json", "limit": str(min(fetch_limit, 25))},
    )
    dz_task = _search_deezer_tracks(client, query, fetch_limit)
    sp_task = search_spotify_tracks(client, query, fetch_limit)
    sc_task = search_soundcloud_tracks(client, query, fetch_limit)
    yt_task = search_ytmusic_tracks(client, query, fetch_limit)

    lf_out, mb_out, dz_out, sp_out, sc_out, yt_out = await asyncio.gather(
        lf_task, mb_task, dz_task, sp_task, sc_task, yt_task, return_exceptions=True
    )

    lf_ok = not isinstance(lf_out, Exception)
    mb_ok = not isinstance(mb_out, Exception) and isinstance(mb_out, dict)
    dz_ok = not isinstance(dz_out, Exception)
    sp_ok = not isinstance(sp_out, Exception)
    sc_ok = not isinstance(sc_out, Exception)
    yt_ok = not isinstance(yt_out, Exception)

    lf_results = lf_out if lf_ok and isinstance(lf_out, list) else []
    dz_results = dz_out if dz_ok and isinstance(dz_out, list) else []
    sp_results = sp_out if sp_ok and isinstance(sp_out, list) else []
    sc_results = sc_out if sc_ok and isinstance(sc_out, list) else []
    yt_results = yt_out if yt_ok and isinstance(yt_out, list) else []

    hits: list[dict] = []

    if mb_ok and isinstance(mb_out, dict):
        for rec in mb_out.get("recordings", []):
            artist = _artist_name(rec.get("artist-credit", []))
            hits.append(
                {
                    "mbid": rec.get("id"),
                    "title": rec.get("title"),
                    "artist": artist,
                    "duration": _format_ms(rec.get("length")),
                    "source": "musicbrainz",
                    "listeners": 0,
                    "commercial_score": 0,
                    "cover": None,
                }
            )

    for t in lf_results:
        hits.append(
            {
                "mbid": t.get("mbid"),
                "title": t["title"],
                "artist": t["artist"],
                "duration": None,
                "source": "lastfm",
                "listeners": t.get("listeners", 0),
                "commercial_score": t.get("commercial_score", 0),
                "cover": t.get("cover"),
            }
        )

    hits.extend(dz_results)
    hits.extend(sp_results)
    hits.extend(sc_results)
    hits.extend(yt_results)

    meta = {
        "lastfm_ok": lf_ok and bool(lf_results),
        "musicbrainz_ok": mb_ok and bool(mb_out and mb_out.get("recordings")),
        "deezer_ok": dz_ok and bool(dz_results),
        "spotify_ok": sp_ok and bool(sp_results),
        "soundcloud_ok": sc_ok and bool(sc_results),
        "ytmusic_ok": yt_ok and bool(yt_results),
    }
    return hits, meta


async def search_tracks(client: httpx.AsyncClient, query: str, limit: int = 12) -> dict[str, Any]:
    query = query.strip()
    if not query:
        return {
            "results": [],
            "meta": {
                "lastfm_configured": lf_configured(),
                "spotify_configured": spotify_configured(),
                "soundcloud_configured": soundcloud_configured(),
                "lastfm_ok": False,
                "musicbrainz_ok": False,
                "deezer_ok": False,
                "spotify_ok": False,
                "soundcloud_ok": False,
                "ytmusic_ok": False,
            },
        }

    fetch_limit = min(max(limit, 1), 50)
    expansion = expand_search_queries(query)
    search_terms = list(expansion["queries"])

    if has_hangul(query) and not expansion["matches"]:
        mb_name = await _musicbrainz_expand_hangul_query(client, query)
        if mb_name:
            search_terms.append(mb_name)
            expansion["matches"].append({"from": query, "to": mb_name, "via": "musicbrainz"})

    unique_terms: list[str] = []
    seen_terms: set[str] = set()
    for term in search_terms:
        key = term.casefold()
        if key not in seen_terms:
            seen_terms.add(key)
            unique_terms.append(term)

    results: dict[str, dict] = {}
    meta = {
        "lastfm_configured": lf_configured(),
        "spotify_configured": spotify_configured(),
        "soundcloud_configured": soundcloud_configured(),
        "lastfm_ok": False,
        "musicbrainz_ok": False,
        "deezer_ok": False,
        "spotify_ok": False,
        "soundcloud_ok": False,
        "ytmusic_ok": False,
    }

    for term in unique_terms:
        hits, term_meta = await _gather_search_hits(client, term, fetch_limit)
        for hit in hits:
            _merge_search_hit(results, hit)
        for key, value in term_meta.items():
            meta[key] = meta[key] or value

    relevance_queries = unique_terms
    scored: list[dict] = []
    for item in results.values():
        rel = max(
            _search_relevance(q, item.get("title", ""), item.get("artist", ""), item.get("listeners", 0))
            for q in relevance_queries
        )
        # 정확도(관련도) 0% 결과는 검색 목록에서 제외
        if rel <= 0:
            continue
        scored.append({**item, "relevance": rel})

    scored.sort(key=_search_sort_key)
    top = _finalize_search_order(scored, fetch_limit)
    enriched = await asyncio.gather(*[_enrich_search_result(client, item) for item in top])
    for row in enriched:
        row["source_label"] = _source_label(row.get("source"))

    return {
        "results": list(enriched),
        "meta": {
            **meta,
            "ytmusic_authenticated": ytmusic_authenticated(),
            "youtube_api_configured": youtube_api_configured(),
            "query_original": query,
            "query_expanded": unique_terms if unique_terms != [query] else None,
            "alias_matches": expansion["matches"] or None,
        },
    }


def _search_relevance(query: str, title: str, artist: str, listeners: int = 0) -> float:
    q = query.strip().lower()
    title_l = (title or "").lower()
    artist_l = (artist or "").lower()
    combined = f"{title_l} {artist_l}"
    if not q:
        return 0.0

    if title_l == q or artist_l == q:
        text = 100.0
    elif title_l.startswith(q) or artist_l.startswith(q):
        text = 92.0
    elif f" {q}" in f" {combined}" or combined.startswith(q):
        text = 84.0
    elif q in combined:
        text = 76.0
    else:
        parts = [p for p in q.split() if p]
        hits = sum(1 for p in parts if p in combined)
        text = (hits / len(parts)) * 72.0 if parts else 50.0

    pop = min(100.0, math.log10(max(int(listeners or 0), 0) + 1) * 28.0)
    return round(min(100.0, text * 0.72 + pop * 0.28), 1)


def _search_sort_key(item: dict) -> tuple:
    """정확도(관련도) 높은 순 → 인기순."""
    return (
        -float(item.get("relevance", 0) or 0),
        -int(item.get("commercial_score", 0) or 0),
        -int(item.get("listeners", 0) or 0),
        0 if item.get("mbid") else 1,
    )


def _is_ytmusic_hit(item: dict) -> bool:
    return "ytmusic" in (item.get("source") or "")


def _finalize_search_order(scored: list[dict], fetch_limit: int) -> list[dict]:
    """정확도(관련도) 높은 순으로 정렬해 상위 N개만 반환."""
    seen: set[str] = set()
    ordered: list[dict] = []
    for item in sorted(scored, key=_search_sort_key):
        key = _normalize_key(item.get("title", ""), item.get("artist", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        ordered.append(item)
        if len(ordered) >= fetch_limit:
            break
    return ordered


def _promote_platform_results(scored: list[dict], fetch_limit: int, min_slots: int = 4) -> list[dict]:
    """Deprecated: relevance-first ordering."""
    return _finalize_search_order(scored, fetch_limit)


async def _enrich_search_result(client: httpx.AsyncClient, item: dict) -> dict:
    if item.get("cover"):
        return item

    title = item.get("title", "")
    artist = item.get("artist", "")
    if not title or not artist:
        return item

    adb_track, dz, lf_info = await asyncio.gather(
        adb_search_track(client, artist, title),
        _find_deezer_track(client, title, artist),
        lf_track_info(client, artist=artist, track=title, mbid=item.get("mbid")),
        return_exceptions=True,
    )

    cover = item.get("cover")
    deezer_id = item.get("deezer_id")

    if isinstance(adb_track, dict):
        cover = cover or adb_track.get("strTrackThumb") or adb_track.get("strAlbumThumb")
    if isinstance(dz, dict):
        cover = cover or dz.get("album", {}).get("cover_medium")
        deezer_id = dz.get("id")
    if isinstance(lf_info, dict):
        cover = cover or lf_info.get("cover")

    return {**item, "cover": cover, "deezer_id": deezer_id}


def _source_label(source: str | None) -> str:
    labels = {
        "spotify": "Spotify",
        "soundcloud": "SoundCloud",
        "ytmusic": "YouTube Music",
        "deezer": "Deezer",
        "lastfm": "Last.fm",
        "musicbrainz": "MusicBrainz",
    }
    if not source:
        return ""
    return " · ".join(labels.get(s.strip(), s) for s in source.split("+") if s.strip())


async def _enrich_similar_track(
    client: httpx.AsyncClient,
    track: dict,
    base_tags: list[str],
    base_profile: dict,
) -> dict:
    artist = track.get("artist", "")
    title = track.get("title", "")

    adb_track, adb_artist, dz = await asyncio.gather(
        adb_search_track(client, artist, title),
        search_artist(client, artist),
        _find_deezer_track(client, title, artist),
        return_exceptions=True,
    )

    sim_tags = []
    if isinstance(adb_track, dict):
        for field in ("strGenre", "strStyle", "strMood"):
            val = adb_track.get(field)
            if val:
                sim_tags.extend([p.strip() for p in val.replace("/", ",").split(",") if p.strip()])
    if isinstance(adb_artist, dict):
        for field in ("strGenre", "strStyle"):
            val = adb_artist.get(field)
            if val:
                sim_tags.extend([p.strip() for p in val.replace("/", ",").split(",") if p.strip()])

    genre_sim = genre_similarity_between(base_tags, sim_tags) if sim_tags else 0.0
    track_profile = build_genre_profile(sim_tags) if sim_tags else {"position": None}
    map_sim = 0.0
    if track_profile.get("position") and base_profile.get("position"):
        map_sim = map_distance_similarity(base_profile["position"], track_profile["position"])

    lastfm_match = track.get("lastfm_match", 0.0)
    combined = round(min(100.0, genre_sim * 0.55 + map_sim * 0.25 + lastfm_match * 0.2), 1)

    cover = track.get("cover")
    if isinstance(adb_track, dict) and adb_track.get("strTrackThumb"):
        cover = adb_track["strTrackThumb"]
    elif isinstance(dz, dict):
        cover = dz.get("album", {}).get("cover_medium") or cover

    preview = dz.get("preview") if isinstance(dz, dict) else None
    duration = None
    if isinstance(dz, dict):
        duration = _format_ms(dz.get("duration", 0) * 1000)

    return {
        **track,
        "cover": cover,
        "preview": preview,
        "duration": duration,
        "deezer_id": dz.get("id") if isinstance(dz, dict) else None,
        "genre_similarity": genre_sim,
        "map_similarity": map_sim,
        "similarity": combined,
    }


GENRE_REC_TAG_BASELINE = 55.0


def _finalize_genre_rec_item(
    item: dict,
    base_tags: list[str],
    *,
    source_genre: str | None = None,
) -> dict:
    """Boost similarity for tracks found via genre tag search."""
    map_sim = float(item.get("map_similarity") or 0)

    tag_sim = genre_similarity_between(base_tags, base_tags)
    if source_genre:
        tag_sim = max(tag_sim, genre_similarity_between(base_tags, [source_genre]))

    if tag_sim > 0:
        item["genre_similarity"] = max(float(item.get("genre_similarity") or 0), tag_sim)
    else:
        item["genre_similarity"] = max(float(item.get("genre_similarity") or 0), GENRE_REC_TAG_BASELINE)

    item["similarity"] = round(
        min(100.0, item["genre_similarity"] * 0.7 + map_sim * 0.3),
        1,
    )
    return item


async def get_track_detail(
    client: httpx.AsyncClient,
    *,
    mbid: str | None = None,
    deezer_id: int | None = None,
    soundcloud_id: str | None = None,
    title: str | None = None,
    artist: str | None = None,
    external_url: str | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    mb_rec: dict | None = None
    if mbid:
        mb_rec = await _fetch_mb_recording(client, mbid)
        if mb_rec:
            title = mb_rec.get("title", title)
            artist = _artist_name(mb_rec.get("artist-credit", []))
        elif not title or not artist:
            raise ValueError("곡 정보를 찾을 수 없습니다. MusicBrainz에 해당 MBID가 없습니다.")

    if not title or not artist:
        raise ValueError("곡 정보를 찾을 수 없습니다.")

    lookup_artist, lookup_title = normalize_for_genre_lookup(title, artist)
    genre_inferred = False
    genre_platform: str | None = None

    sc_tags = await fetch_soundcloud_genre_tags(
        client,
        soundcloud_id=soundcloud_id,
        artist=lookup_artist,
        title=lookup_title,
    )

    lf_query_mbid = (mb_rec or {}).get("id")

    lf_info, adb_track, adb_artist, dz_track = await asyncio.gather(
        lf_track_info(client, artist=lookup_artist, track=lookup_title, mbid=lf_query_mbid),
        adb_search_track(client, lookup_artist, lookup_title),
        search_artist(client, lookup_artist),
        _find_deezer_track(client, lookup_title, lookup_artist) if not deezer_id else _fetch_deezer_track(client, deezer_id),
        return_exceptions=True,
    )

    if isinstance(lf_info, Exception):
        lf_info = {}
    if isinstance(adb_track, Exception):
        adb_track = None
    if isinstance(adb_artist, Exception):
        adb_artist = None
    if isinstance(dz_track, Exception):
        dz_track = None

    if deezer_id and not dz_track:
        dz_track = await _fetch_deezer_track(client, deezer_id)

    lf_artist_tags = await get_artist_top_tags(client, lookup_artist)

    mb_artist_tags: list[str] = []
    mb_artist_genres: list[str] = []
    if mb_rec and mb_rec.get("artist-credit"):
        artist_mbid = mb_rec["artist-credit"][0].get("artist", {}).get("id")
        if artist_mbid:
            mb_artist_tags, mb_artist_genres = await _fetch_mb_artist_genres(client, artist_mbid)

    tag_list, tag_weights = _collect_tags(
        lf_info=lf_info if isinstance(lf_info, dict) else {},
        lf_artist_tags=lf_artist_tags,
        mb_rec=mb_rec,
        mb_artist_tags=mb_artist_tags,
        mb_artist_genres=mb_artist_genres,
        adb_track=adb_track if isinstance(adb_track, dict) else None,
        adb_artist=adb_artist if isinstance(adb_artist, dict) else None,
    )

    if not tag_list:
        tag_list, tag_weights = await _infer_genre_tags_fallback(client, lookup_artist, lookup_title)
        genre_inferred = bool(tag_list)

    if sc_tags:
        for tag in sc_tags:
            tag_list.append(tag)
            tag_weights.append(2.4)
        if source and "soundcloud" in source:
            genre_platform = "soundcloud"
            if not genre_inferred:
                genre_inferred = len(sc_tags) > 0 and not (
                    isinstance(lf_info, dict) and lf_info.get("tags")
                )

    tag_list, tag_weights = _apply_genre_heuristics(tag_list, tag_weights)
    genre_profile = build_genre_profile(tag_list, tag_weights)

    adb_album = None
    if isinstance(adb_track, dict) and adb_track.get("idAlbum"):
        adb_album = await get_album(client, adb_track["idAlbum"])
        if isinstance(adb_album, Exception):
            adb_album = None

    ui = enrich_ui(
        adb_track if isinstance(adb_track, dict) else None,
        adb_artist if isinstance(adb_artist, dict) else None,
        adb_album if isinstance(adb_album, dict) else None,
    )

    release_title = ui.get("album_name")
    release_date = ui.get("release_year")
    if mb_rec and mb_rec.get("releases"):
        release_title = release_title or mb_rec["releases"][0].get("title")
        release_date = release_date or mb_rec["releases"][0].get("date")

    duration_ms = (
        (lf_info.get("duration_ms") if isinstance(lf_info, dict) else None)
        or (mb_rec or {}).get("length")
        or ((dz_track or {}).get("duration", 0) * 1000 if isinstance(dz_track, dict) else 0)
    )

    cover = (
        ui.get("album_thumb")
        or ui.get("track_thumb")
        or (lf_info.get("cover") if isinstance(lf_info, dict) else None)
        or ((dz_track or {}).get("album", {}).get("cover_xl") if isinstance(dz_track, dict) else None)
    )

    preview = dz_track.get("preview") if isinstance(dz_track, dict) else None

    similar_raw = await lf_similar(
        client,
        artist=lookup_artist,
        track=lookup_title,
        mbid=lf_query_mbid,
        limit=12,
    )

    if not similar_raw and isinstance(dz_track, dict):
        similar_raw = await _deezer_fallback_similar(client, dz_track, _normalize_key(title, artist))

    primary_genres = [g["name"] for g in genre_profile.get("genres", [])[:8]]
    classification_tags = primary_genres or filter_leaf_genre_names(tag_list)

    similar_enriched = []
    for t in similar_raw[:12]:
        enriched = await _enrich_similar_track(client, t, classification_tags, genre_profile)
        similar_enriched.append(enriched)

    similar_enriched.sort(key=lambda x: x.get("similarity", 0), reverse=True)

    all_tags_unique = filter_leaf_genre_names(list(dict.fromkeys(tag_list))[:20])

    return {
        "mbid": lf_query_mbid
        or (
            lf_info.get("mbid")
            if isinstance(lf_info, dict) and lf_info.get("mbid") != mbid
            else None
        ),
        "deezer_id": (dz_track or {}).get("id") if isinstance(dz_track, dict) else deezer_id,
        "title": title,
        "artist": artist,
        "album": release_title,
        "release_date": str(release_date) if release_date else None,
        "duration_ms": duration_ms,
        "duration": _format_ms(duration_ms),
        "cover": cover,
        "preview": preview,
        "listeners": lf_info.get("listeners", 0) if isinstance(lf_info, dict) else 0,
        "playcount": lf_info.get("playcount", 0) if isinstance(lf_info, dict) else 0,
        "lastfm_url": lf_info.get("url") if isinstance(lf_info, dict) else None,
        "ui": ui,
        "genre_map": {
            "nodes": get_genre_map(),
            "bounds": get_map_bounds(),
            "track_position": genre_profile.get("position"),
            "matched_genres": genre_profile.get("genres", []),
            "primary_genre": genre_profile.get("primary_genre"),
            "subgenre_nodes": collect_subgenre_focus_nodes(
                genre_profile.get("genres", []),
                genre_profile.get("position"),
            ),
        },
        "genres": {
            "primary": primary_genres,
            "tags": all_tags_unique,
            "description": _describe_genres(
                primary_genres,
                all_tags_unique,
                genre_profile,
                inferred=genre_inferred,
                platform=genre_platform,
            ),
            "inferred": genre_inferred,
        },
        "similar_tracks": similar_enriched,
        "external_url": external_url,
        "source": source,
        "source_label": _source_label(source),
        "sources": {
            "lastfm": lf_configured(),
            "musicbrainz": bool(mb_rec),
            "audiodb": bool(adb_track or adb_artist),
            "deezer": bool(dz_track),
        },
    }


async def _fetch_deezer_track(client: httpx.AsyncClient, deezer_id: int) -> dict | None:
    try:
        return await _dz_get(client, f"/track/{deezer_id}")
    except httpx.HTTPError:
        return None


async def _deezer_fallback_similar(
    client: httpx.AsyncClient,
    dz_track: dict,
    exclude_key: str,
) -> list[dict]:
    artist_id = dz_track.get("artist", {}).get("id")
    if not artist_id:
        return []

    similar: list[dict] = []
    seen = {exclude_key}

    try:
        related = await _dz_get(client, f"/artist/{artist_id}/related")
        for rel in related.get("data", [])[:5]:
            top = await _dz_get(client, f"/artist/{rel['id']}/top", {"limit": "3"})
            for track in top.get("data", []):
                artist_name = track.get("artist", {}).get("name", "")
                key = _normalize_key(track.get("title", ""), artist_name)
                if key in seen:
                    continue
                seen.add(key)
                similar.append(
                    {
                        "title": track.get("title"),
                        "artist": artist_name,
                        "lastfm_match": 0,
                        "reason": "인기 상업곡",
                    }
                )
    except httpx.HTTPError:
        pass

    return similar


def _describe_genres(
    genres: list[str],
    tags: list[str],
    profile: dict,
    *,
    inferred: bool = False,
    platform: str | None = None,
) -> str:
    matched = profile.get("genres", [])
    if matched:
        top = matched[0]
        label = top.get("name", "")
        others = [g["name"] for g in matched[1:4] if g.get("name")]
        detail = f"'{label}'" + (f" · {', '.join(others)}" if others else "")
        prefix = "비공식 곡 기준 추정: " if inferred else ""
        return (
            f"{prefix}Every Noise 맵 기준 이 곡은 {detail} 영역에 가깝게 분류됩니다 "
            f"(유사도 {top.get('similarity', 0)}%). "
            f"주요 태그: {', '.join(tags[:6])}."
        )
    if genres:
        prefix = "비공식 곡 — 유사 정식곡·아티스트 정보로 추정: " if inferred else ""
        return f"{prefix}이 곡은 {', '.join(genres[:3])} 계열의 음악으로 분류됩니다."
    if tags:
        if platform == "soundcloud":
            return f"SoundCloud 등록 장르 기준: {', '.join(tags[:8])}."
        prefix = "비공식 곡 — 아티스트/유사곡 메타데이터로 추정: " if inferred else ""
        return f"{prefix}관련 태그: {', '.join(tags[:8])}."
    if lf_configured():
        return (
            "장르 태그를 찾지 못했습니다. 제목에 아티스트명이 포함된 경우 "
            "(예: Drake - 곡제목) 더 잘 인식됩니다."
        )
    return "장르 정보가 충분하지 않습니다. Last.fm API 키를 설정하면 더 정확해집니다."


def get_static_genre_map() -> dict:
    import genre_map as _gm

    return {
        "nodes": _gm.get_genre_map(),
        "bounds": _gm.get_map_bounds(),
        "source": "everynoise.com/engenremap.html",
    }


async def recommend_by_genre(
    client: httpx.AsyncClient,
    genre: str,
    *,
    exclude_title: str | None = None,
    exclude_artist: str | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    genre = genre.strip()
    if not genre:
        raise ValueError("장르를 입력해 주세요.")

    exclude_key = _normalize_key(exclude_title or "", exclude_artist or "") if exclude_title else None
    genre_profile = build_genre_profile([genre], [3.0])
    base_tags = [genre]

    candidates: list[dict] = []

    if lf_configured():
        lf_tracks = await get_top_tracks_by_tag(client, genre, limit=limit + 5)
        candidates.extend(lf_tracks)

    try:
        dz_data = await _dz_get(client, "/search", {"q": f'genre:"{genre}"', "limit": str(limit + 5)})
        for track in dz_data.get("data", []):
            if _is_cover_or_variant(track.get("title", "")):
                continue
            candidates.append(
                {
                    "title": track.get("title"),
                    "artist": track.get("artist", {}).get("name", ""),
                    "deezer_id": track.get("id"),
                    "cover": track.get("album", {}).get("cover_medium"),
                    "reason": f"{genre} 장르",
                    "lastfm_match": 0,
                }
            )
    except httpx.HTTPError:
        pass

    seen: set[str] = set()
    if exclude_key:
        seen.add(exclude_key)

    unique: list[dict] = []
    for track in candidates:
        key = _normalize_key(track.get("title", ""), track.get("artist", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(track)
        if len(unique) >= limit + 3:
            break

    enriched = []
    for track in unique[:limit]:
        item = await _enrich_similar_track(client, track, base_tags, genre_profile)
        item["reason"] = f"{genre} 장르 추천"
        _finalize_genre_rec_item(item, base_tags, source_genre=genre)
        enriched.append(item)

    enriched.sort(key=lambda x: x.get("similarity", 0), reverse=True)

    return {
        "genre": genre,
        "genre_profile": genre_profile,
        "tracks": enriched,
    }


async def recommend_by_genres(
    client: httpx.AsyncClient,
    genres: list[str],
    *,
    exclude_title: str | None = None,
    exclude_artist: str | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    cleaned = [g.strip() for g in (genres or []) if (g or "").strip()]
    cleaned = list(dict.fromkeys(cleaned))[:10]
    if not cleaned:
        raise ValueError("장르를 1개 이상 선택해 주세요.")

    exclude_key = _normalize_key(exclude_title or "", exclude_artist or "") if exclude_title else None
    weights = [3.0] + [2.0] * (len(cleaned) - 1)
    base_profile = build_genre_profile(cleaned, weights)
    base_tags = cleaned

    # Collect candidates per genre from Last.fm tag tops and Deezer genre search
    candidates: list[dict] = []
    if lf_configured():
        tasks = [get_top_tracks_by_tag(client, g, limit=limit + 6) for g in cleaned]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, list):
                candidates.extend(res)

    for g in cleaned:
        try:
            dz_data = await _dz_get(client, "/search", {"q": f'genre:"{g}"', "limit": str(limit + 6)})
            for track in dz_data.get("data", []):
                if _is_cover_or_variant(track.get("title", "")):
                    continue
                candidates.append(
                    {
                        "title": track.get("title"),
                        "artist": track.get("artist", {}).get("name", ""),
                        "deezer_id": track.get("id"),
                        "cover": track.get("album", {}).get("cover_medium"),
                        "reason": f"{g} 장르",
                        "lastfm_match": 0,
                    }
                )
        except httpx.HTTPError:
            continue

    # Unique + exclude
    seen: set[str] = set()
    if exclude_key:
        seen.add(exclude_key)

    unique: list[dict] = []
    for track in candidates:
        key = _normalize_key(track.get("title", ""), track.get("artist", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(track)
        if len(unique) >= limit * 3:
            break

    enriched: list[dict] = []
    for track in unique[:limit]:
        item = await _enrich_similar_track(client, track, base_tags, base_profile)
        item["reason"] = "선택 장르 기반 추천"
        _finalize_genre_rec_item(item, base_tags)
        enriched.append(item)

    enriched.sort(key=lambda x: x.get("similarity", 0), reverse=True)

    return {
        "genres": cleaned,
        "genre_profile": base_profile,
        "tracks": enriched[:limit],
    }


def _keyword_specificity_meta(count: int) -> dict[str, Any]:
    if count <= 0:
        return {"level": 0, "label": "키워드 없음", "precision": 0, "min_match": 0}
    if count == 1:
        return {
            "level": 1,
            "label": "넓은 추천",
            "precision": 25,
            "min_match": 20,
            "hint": "장르·무드 키워드를 하나 더 추가하면 추천이 좁혀집니다.",
            "suggestions": ["dreamy", "upbeat", "rock", "chill", "dance"],
        }
    if count == 2:
        return {
            "level": 2,
            "label": "중간 정밀도",
            "precision": 50,
            "min_match": 35,
            "hint": "시대·스타일 키워드를 추가하면 더 구체화됩니다.",
            "suggestions": ["80s", "indie", "synth", "sad", "summer"],
        }
    if count == 3:
        return {
            "level": 3,
            "label": "구체적 추천",
            "precision": 70,
            "min_match": 50,
            "hint": "분위기·템포 키워드를 더하면 거의 맞춤 추천이 됩니다.",
            "suggestions": ["night drive", "acoustic", "energetic", "lo-fi"],
        }
    return {
        "level": 4,
        "label": "맞춤 추천",
        "precision": 90,
        "min_match": 60,
        "hint": "키워드가 충분합니다. 결과를 확인해 보세요.",
        "suggestions": [],
    }


def _keyword_hit_count(keywords: list[str], tags: list[str]) -> int:
    if not keywords or not tags:
        return 0
    hits = 0
    for kw in keywords:
        kn = _simplify(kw)
        for tag in tags:
            tn = _simplify(tag)
            if kn in tn or tn in kn or _token_overlap(kw, tag) >= 0.5:
                hits += 1
                break
    return hits


async def _collect_keyword_candidates(
    client: httpx.AsyncClient,
    keywords: list[str],
    per_keyword: int = 8,
) -> list[dict]:
    candidates: list[dict] = []
    seen: set[str] = set()

    async def from_lf(kw: str) -> list[dict]:
        if not lf_configured():
            return []
        return await get_top_tracks_by_tag(client, kw, limit=per_keyword)

    async def from_dz(kw: str) -> list[dict]:
        try:
            data = await _dz_get(client, "/search", {"q": kw, "limit": str(per_keyword)})
        except httpx.HTTPError:
            return []
        out = []
        for track in data.get("data", []):
            if _is_cover_or_variant(track.get("title", "")):
                continue
            out.append(
                {
                    "title": track.get("title"),
                    "artist": track.get("artist", {}).get("name", ""),
                    "deezer_id": track.get("id"),
                    "cover": track.get("album", {}).get("cover_medium"),
                    "source_keyword": kw,
                    "lastfm_match": 0,
                }
            )
        return out

    tasks = []
    for kw in keywords:
        tasks.append(from_lf(kw))
        tasks.append(from_dz(kw))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for res in results:
        if not isinstance(res, list):
            continue
        for track in res:
            key = _normalize_key(track.get("title", ""), track.get("artist", ""))
            if not key or key in seen:
                continue
            seen.add(key)
            candidates.append(track)

    return candidates


async def recommend_by_keywords(
    client: httpx.AsyncClient,
    keywords: list[str],
    *,
    limit: int = 12,
) -> dict[str, Any]:
    cleaned = list(dict.fromkeys(k.strip() for k in keywords if (k or "").strip()))[:12]
    if not cleaned:
        raise ValueError("키워드를 1개 이상 입력해 주세요.")

    meta = _keyword_specificity_meta(len(cleaned))
    weights = [max(1.0, 3.0 - i * 0.4) for i in range(len(cleaned))]
    base_profile = build_genre_profile(cleaned, weights)
    base_tags = cleaned

    candidates = await _collect_keyword_candidates(client, cleaned, per_keyword=10)

    scored: list[tuple[dict, float, int]] = []
    for track in candidates:
        track_tags: list[str] = list(cleaned)
        sk = track.get("source_keyword")
        if sk:
            track_tags.append(sk)
        title = track.get("title", "")
        artist = track.get("artist", "")
        if title:
            track_tags.append(title)
        if artist:
            track_tags.append(artist)

        genre_sim = genre_similarity_between(cleaned, track_tags)
        hit_count = _keyword_hit_count(cleaned, track_tags)
        hit_ratio = (hit_count / len(cleaned)) * 100 if cleaned else 0
        combined = round(min(100.0, genre_sim * 0.55 + hit_ratio * 0.45), 1)

        if combined < meta["min_match"]:
            continue

        scored.append((track, combined, hit_count))

    scored.sort(key=lambda x: (x[1], x[2]), reverse=True)

    enriched: list[dict] = []
    for track, combined, hit_count in scored[:limit]:
        item = await _enrich_similar_track(client, track, base_tags, base_profile)
        item["reason"] = f"키워드 {hit_count}/{len(cleaned)} 매칭"
        item["keyword_hits"] = hit_count
        item["genre_similarity"] = max(item.get("genre_similarity", 0), combined)
        item["similarity"] = combined
        enriched.append(item)

    matched = base_profile.get("genres", [])
    suggestions = [s for s in meta.get("suggestions", []) if s.lower() not in {k.lower() for k in cleaned}]
    for g in matched[:3]:
        name = g.get("name")
        if name and name.lower() not in {k.lower() for k in cleaned}:
            suggestions.append(name)
    suggestions = list(dict.fromkeys(suggestions))[:6]

    return {
        "keywords": cleaned,
        "genre_profile": base_profile,
        "matched_genres": matched,
        "specificity": {
            "level": meta["level"],
            "label": meta["label"],
            "precision": meta["precision"],
            "hint": meta["hint"],
            "keyword_count": len(cleaned),
            "suggestions": suggestions,
        },
        "tracks": enriched,
    }
