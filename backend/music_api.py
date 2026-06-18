from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx

USER_AGENT = os.getenv(
    "MUSICBRAINZ_USER_AGENT",
    "MusicExplorer/1.0 (selendi1511@gmail.com)",
)
MB_BASE = "https://musicbrainz.org/ws/2"
DZ_BASE = "https://api.deezer.com"

_mb_lock = asyncio.Lock()
_last_mb_request = 0.0


async def _mb_get(client: httpx.AsyncClient, path: str, params: dict | None = None) -> dict:
    global _last_mb_request
    async with _mb_lock:
        elapsed = time.monotonic() - _last_mb_request
        if elapsed < 1.05:
            await asyncio.sleep(1.05 - elapsed)
        _last_mb_request = time.monotonic()

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    resp = await client.get(f"{MB_BASE}{path}", params=params, headers=headers, timeout=20.0)
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


def _attach_deezer_to_mb_results(results: dict[str, dict], dz_tracks: list[dict]) -> None:
    used_deezer_ids: set[int] = set()
    for entry in results.values():
        if entry.get("deezer_id"):
            used_deezer_ids.add(entry["deezer_id"])
            continue
        if not entry.get("title") or not entry.get("artist"):
            continue
        candidates = [t for t in dz_tracks if t.get("id") not in used_deezer_ids]
        match = _pick_best_deezer_match(candidates, entry["title"], entry["artist"])
        if not match:
            continue
        entry["deezer_id"] = match.get("id")
        entry["cover"] = match.get("album", {}).get("cover_medium")
        entry["duration_ms"] = match.get("duration", 0) * 1000
        entry["duration"] = _format_ms(match.get("duration", 0) * 1000)
        entry["source"] = "both"
        used_deezer_ids.add(match["id"])


async def search_tracks(client: httpx.AsyncClient, query: str, limit: int = 10) -> list[dict]:
    query = query.strip()
    if not query:
        return []

    mb_data, dz_data = await asyncio.gather(
        _mb_get(
            client,
            "/recording",
            {"query": query, "fmt": "json", "limit": str(min(limit, 15))},
        ),
        _dz_get(client, "/search", {"q": query, "limit": str(min(limit, 15))}),
        return_exceptions=True,
    )

    results: dict[str, dict] = {}

    if isinstance(mb_data, dict):
        for rec in mb_data.get("recordings", []):
            artist = _artist_name(rec.get("artist-credit", []))
            key = _normalize_key(rec.get("title", ""), artist)
            results[key] = {
                "mbid": rec.get("id"),
                "title": rec.get("title"),
                "artist": artist,
                "duration_ms": rec.get("length"),
                "duration": _format_ms(rec.get("length")),
                "source": "musicbrainz",
                "deezer_id": None,
                "cover": None,
            }

    if isinstance(dz_data, dict):
        dz_tracks = dz_data.get("data", [])
        for track in dz_tracks:
            artist = track.get("artist", {}).get("name", "")
            key = _normalize_key(track.get("title", ""), artist)
            entry = results.get(key, {})
            results[key] = {
                "mbid": entry.get("mbid"),
                "title": track.get("title"),
                "artist": artist,
                "duration_ms": track.get("duration", 0) * 1000,
                "duration": _format_ms(track.get("duration", 0) * 1000),
                "source": "deezer" if not entry.get("mbid") else "both",
                "deezer_id": track.get("id"),
                "cover": track.get("album", {}).get("cover_medium"),
            }
        _attach_deezer_to_mb_results(results, dz_tracks)

    ordered = sorted(
        results.values(),
        key=lambda x: (
            0 if x.get("mbid") and x.get("deezer_id") else 1 if x.get("mbid") else 2,
            x.get("title", ""),
        ),
    )
    return ordered[:limit]


async def _fetch_mb_recording(client: httpx.AsyncClient, mbid: str) -> dict:
    return await _mb_get(
        client,
        f"/recording/{mbid}",
        {"inc": "artist-credits+tags+genres+releases", "fmt": "json"},
    )


async def _fetch_mb_artist_genres(client: httpx.AsyncClient, artist_mbid: str) -> tuple[list[str], list[str]]:
    data = await _mb_get(
        client,
        f"/artist/{artist_mbid}",
        {"inc": "tags+genres", "fmt": "json"},
    )
    tags = sorted(
        [t["name"] for t in data.get("tags", []) if t.get("name")],
        key=lambda n: next((t.get("count", 0) for t in data.get("tags", []) if t["name"] == n), 0),
        reverse=True,
    )
    genres = [g["name"] for g in data.get("genres", []) if g.get("name")]
    return tags[:20], genres[:15]


async def _fetch_deezer_track(client: httpx.AsyncClient, deezer_id: int) -> dict | None:
    try:
        return await _dz_get(client, f"/track/{deezer_id}")
    except httpx.HTTPError:
        return None


async def _find_deezer_track(client: httpx.AsyncClient, title: str, artist: str) -> dict | None:
    queries = [
        f'artist:"{artist}" track:"{title}"',
        f"{title} {artist}",
        artist,
    ]
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


async def _similar_from_artist_name(
    client: httpx.AsyncClient,
    artist: str,
    exclude_key: str,
    limit: int = 8,
) -> list[dict]:
    similar: list[dict] = []
    seen = {exclude_key}

    try:
        search = await _dz_get(client, "/search", {"q": f'artist:"{artist}"', "limit": "1"})
        artist_items = search.get("data", [])
        if not artist_items:
            return []
        artist_id = artist_items[0].get("artist", {}).get("id")
        if not artist_id:
            return []

        top = await _dz_get(client, f"/artist/{artist_id}/top", {"limit": "6"})
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
                    "deezer_id": track.get("id"),
                    "cover": track.get("album", {}).get("cover_medium"),
                    "preview": track.get("preview"),
                    "duration": _format_ms(track.get("duration", 0) * 1000),
                    "reason": f"{artist}의 다른 곡",
                }
            )
            if len(similar) >= limit:
                return similar

        related = await _dz_get(client, f"/artist/{artist_id}/related")
        for related_artist in related.get("data", [])[:4]:
            related_top = await _dz_get(
                client,
                f"/artist/{related_artist['id']}/top",
                {"limit": "2"},
            )
            for track in related_top.get("data", []):
                artist_name = track.get("artist", {}).get("name", "")
                key = _normalize_key(track.get("title", ""), artist_name)
                if key in seen:
                    continue
                seen.add(key)
                similar.append(
                    {
                        "title": track.get("title"),
                        "artist": artist_name,
                        "deezer_id": track.get("id"),
                        "cover": track.get("album", {}).get("cover_medium"),
                        "preview": track.get("preview"),
                        "duration": _format_ms(track.get("duration", 0) * 1000),
                        "reason": "비슷한 아티스트",
                    }
                )
                if len(similar) >= limit:
                    return similar
    except httpx.HTTPError:
        return similar

    return similar[:limit]


async def _similar_from_deezer(
    client: httpx.AsyncClient,
    deezer_track: dict,
    exclude_key: str,
    limit: int = 12,
) -> list[dict]:
    artist_id = deezer_track.get("artist", {}).get("id")
    if not artist_id:
        return []

    similar: list[dict] = []
    seen = {exclude_key}

    try:
        related = await _dz_get(client, f"/artist/{artist_id}/related")
        related_artists = related.get("data", [])[:6]
    except httpx.HTTPError:
        related_artists = []

    tasks = []
    for artist in related_artists:
        tasks.append(_dz_get(client, f"/artist/{artist['id']}/top", {"limit": "3"}))

    if tasks:
        tops = await asyncio.gather(*tasks, return_exceptions=True)
        for top in tops:
            if not isinstance(top, dict):
                continue
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
                        "deezer_id": track.get("id"),
                        "cover": track.get("album", {}).get("cover_medium"),
                        "preview": track.get("preview"),
                        "duration": _format_ms(track.get("duration", 0) * 1000),
                        "reason": "비슷한 아티스트의 인기곡",
                    }
                )
                if len(similar) >= limit:
                    return similar

    album_id = deezer_track.get("album", {}).get("id")
    if album_id and len(similar) < limit:
        try:
            album = await _dz_get(client, f"/album/{album_id}")
            for track in album.get("tracks", {}).get("data", [])[:5]:
                artist_name = track.get("artist", {}).get("name", "")
                key = _normalize_key(track.get("title", ""), artist_name)
                if key in seen:
                    continue
                seen.add(key)
                similar.append(
                    {
                        "title": track.get("title"),
                        "artist": artist_name,
                        "deezer_id": track.get("id"),
                        "cover": album.get("cover_medium"),
                        "preview": track.get("preview"),
                        "duration": _format_ms(track.get("duration", 0) * 1000),
                        "reason": "같은 앨범",
                    }
                )
                if len(similar) >= limit:
                    break
        except httpx.HTTPError:
            pass

    return similar[:limit]


async def _similar_by_genre(
    client: httpx.AsyncClient,
    genres: list[str],
    exclude_key: str,
    limit: int = 6,
) -> list[dict]:
    if not genres:
        return []

    similar: list[dict] = []
    seen = {exclude_key}

    for genre in genres[:3]:
        try:
            data = await _dz_get(client, "/search", {"q": f'genre:"{genre}"', "limit": "8"})
        except httpx.HTTPError:
            continue

        for track in data.get("data", []):
            artist_name = track.get("artist", {}).get("name", "")
            key = _normalize_key(track.get("title", ""), artist_name)
            if key in seen:
                continue
            seen.add(key)
            similar.append(
                {
                    "title": track.get("title"),
                    "artist": artist_name,
                    "deezer_id": track.get("id"),
                    "cover": track.get("album", {}).get("cover_medium"),
                    "preview": track.get("preview"),
                    "duration": _format_ms(track.get("duration", 0) * 1000),
                    "reason": f"{genre} 장르",
                }
            )
            if len(similar) >= limit:
                return similar

    return similar


async def get_track_detail(
    client: httpx.AsyncClient,
    *,
    mbid: str | None = None,
    deezer_id: int | None = None,
    title: str | None = None,
    artist: str | None = None,
) -> dict[str, Any]:
    mb_rec: dict | None = None
    dz_track: dict | None = None

    if mbid:
        mb_rec = await _fetch_mb_recording(client, mbid)

    if deezer_id:
        dz_track = await _fetch_deezer_track(client, deezer_id)

    if not dz_track and title and artist:
        dz_track = await _find_deezer_track(client, title, artist)

    if not mb_rec and dz_track:
        title = dz_track.get("title", title)
        artist = dz_track.get("artist", {}).get("name", artist)

    if mb_rec:
        title = mb_rec.get("title", title)
        artist = _artist_name(mb_rec.get("artist-credit", []))

    if not title or not artist:
        raise ValueError("곡 정보를 찾을 수 없습니다.")

    recording_tags = [t["name"] for t in (mb_rec or {}).get("tags", []) if t.get("name")]
    recording_genres = [g["name"] for g in (mb_rec or {}).get("genres", []) if g.get("name")]

    artist_tags: list[str] = []
    artist_genres: list[str] = []
    if mb_rec and mb_rec.get("artist-credit"):
        artist_mbid = mb_rec["artist-credit"][0].get("artist", {}).get("id")
        if artist_mbid:
            artist_tags, artist_genres = await _fetch_mb_artist_genres(client, artist_mbid)

    all_genres = list(dict.fromkeys(recording_genres + artist_genres))
    all_tags = list(dict.fromkeys(recording_tags + artist_tags))

    release_title = None
    release_date = None
    if mb_rec and mb_rec.get("releases"):
        release = mb_rec["releases"][0]
        release_title = release.get("title")
        release_date = release.get("date")

    if dz_track:
        release_title = release_title or dz_track.get("album", {}).get("title")
        release_date = release_date or dz_track.get("album", {}).get("release_date")

    exclude_key = _normalize_key(title, artist)
    if dz_track:
        similar_related = await _similar_from_deezer(client, dz_track, exclude_key, limit=10)
    else:
        similar_related = await _similar_from_artist_name(client, artist, exclude_key, limit=10)
    similar_genre = await _similar_by_genre(client, all_genres or all_tags[:5], exclude_key, limit=6)

    merged_similar: list[dict] = []
    seen = set()
    for item in similar_related + similar_genre:
        key = _normalize_key(item["title"], item["artist"])
        if key in seen:
            continue
        seen.add(key)
        merged_similar.append(item)
        if len(merged_similar) >= 12:
            break

    return {
        "mbid": mbid or (mb_rec or {}).get("id"),
        "deezer_id": (dz_track or {}).get("id") or deezer_id,
        "title": title,
        "artist": artist,
        "album": release_title,
        "release_date": release_date,
        "duration_ms": (mb_rec or {}).get("length") or ((dz_track or {}).get("duration", 0) * 1000),
        "duration": _format_ms(
            (mb_rec or {}).get("length") or ((dz_track or {}).get("duration", 0) * 1000)
        ),
        "cover": (dz_track or {}).get("album", {}).get("cover_xl")
        or (dz_track or {}).get("album", {}).get("cover_big"),
        "preview": (dz_track or {}).get("preview"),
        "genres": {
            "primary": all_genres[:8],
            "tags": all_tags[:15],
            "description": _describe_genres(all_genres, all_tags),
        },
        "similar_tracks": merged_similar,
    }


def _describe_genres(genres: list[str], tags: list[str]) -> str:
    if not genres and not tags:
        return "장르 정보가 아직 등록되지 않았습니다."

    primary = genres[:3]
    if primary:
        joined = ", ".join(primary)
        extra = tags[:5]
        if extra:
            return f"이 곡은 주로 {joined} 계열로 분류됩니다. 관련 키워드: {', '.join(extra)}."
        return f"이 곡은 주로 {joined} 계열로 분류됩니다."

    return f"관련 태그: {', '.join(tags[:8])}."
