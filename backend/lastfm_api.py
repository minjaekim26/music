from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/"


def _api_key() -> str:
    return os.getenv("LASTFM_API_KEY", "").strip()


def is_configured() -> bool:
    return bool(_api_key())


COMMERCIAL_MIN_LISTENERS = int(os.getenv("COMMERCIAL_MIN_LISTENERS", "5000"))
COMMERCIAL_MIN_PLAYCOUNT = int(os.getenv("COMMERCIAL_MIN_PLAYCOUNT", "10000"))


async def _call(client: httpx.AsyncClient, method: str, **params: Any) -> dict:
    api_key = _api_key()
    if not api_key:
        return {}
    payload = {
        "method": method,
        "api_key": api_key,
        "format": "json",
        "autocorrect": "1",
        **params,
    }
    resp = await client.get(LASTFM_BASE, params=payload, timeout=20.0)
    resp.raise_for_status()
    data = resp.json()
    if "error" in data:
        return {}
    return data


def _is_commercial_track(track: dict) -> bool:
    listeners = int(track.get("listeners", 0) or 0)
    playcount = int(track.get("playcount", 0) or 0)
    return listeners >= COMMERCIAL_MIN_LISTENERS or playcount >= COMMERCIAL_MIN_PLAYCOUNT


def _parse_tags(tag_block: dict | list | None) -> list[dict]:
    if not tag_block:
        return []
    tags = tag_block.get("tag", []) if isinstance(tag_block, dict) else tag_block
    if isinstance(tags, dict):
        tags = [tags]
    out = []
    for t in tags:
        name = t.get("name")
        if not name:
            continue
        out.append({"name": name, "count": int(t.get("count", 0) or 0)})
    return out


async def search_tracks(client: httpx.AsyncClient, query: str, limit: int = 12) -> list[dict]:
    data = await _call(client, "track.search", track=query, limit=str(min(limit * 2, 50)))
    results = data.get("results", {}).get("trackmatches", {}).get("track", [])
    if isinstance(results, dict):
        results = [results]

    commercial = [t for t in results if _is_commercial_track(t)]
    pool = commercial or results

    out = []
    for t in pool[:limit]:
        artist = t.get("artist", "")
        title = t.get("name", "")
        out.append(
            {
                "title": title,
                "artist": artist,
                "mbid": t.get("mbid") or None,
                "listeners": int(t.get("listeners", 0) or 0),
                "playcount": 0,
                "cover": None,
                "source": "lastfm",
                "commercial_score": int(t.get("listeners", 0) or 0),
            }
        )
    return out


async def get_track_info(
    client: httpx.AsyncClient,
    *,
    artist: str,
    track: str,
    mbid: str | None = None,
) -> dict:
    params: dict[str, Any] = {}
    if mbid:
        params["mbid"] = mbid
    else:
        params["artist"] = artist
        params["track"] = track

    data = await _call(client, "track.getInfo", **params)
    track_data = data.get("track", {})
    if not track_data:
        return {}

    tags = _parse_tags(track_data.get("toptags"))
    album = track_data.get("album", {}) or {}
    images = album.get("image", []) if isinstance(album, dict) else []
    cover = None
    for img in images:
        if img.get("size") in ("extralarge", "large"):
            cover = img.get("#text")
            if cover:
                break

    return {
        "title": track_data.get("name", track),
        "artist": track_data.get("artist", {}).get("name", artist),
        "mbid": track_data.get("mbid") or mbid,
        "listeners": int(track_data.get("listeners", 0) or 0),
        "playcount": int(track_data.get("playcount", 0) or 0),
        "duration_ms": int(track_data.get("duration", 0) or 0),
        "url": track_data.get("url"),
        "cover": cover,
        "tags": tags,
        "wiki_summary": (track_data.get("wiki", {}) or {}).get("summary"),
    }


async def get_similar_tracks(
    client: httpx.AsyncClient,
    *,
    artist: str,
    track: str,
    mbid: str | None = None,
    limit: int = 12,
) -> list[dict]:
    async def _fetch(**params: Any) -> list[dict]:
        data = await _call(client, "track.getSimilar", **params)
        similar = data.get("similartracks", {}).get("track", [])
        if isinstance(similar, dict):
            similar = [similar]
        return similar if isinstance(similar, list) else []

    params: dict[str, Any] = {"limit": str(limit)}
    similar: list[dict] = []
    if mbid:
        similar = await _fetch(mbid=mbid, limit=str(limit))
    # MBID로 비면 artist+track 으로 재시도 (일부 곡은 MBID 유사곡이 없음)
    if not similar and artist and track:
        similar = await _fetch(artist=artist, track=track, limit=str(limit))

    out = []
    for t in similar:
        match = float(t.get("match", 0) or 0)
        listeners = int(t.get("playcount", 0) or 0)
        artist_name = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else t.get("artist", "")
        images = t.get("image", [])
        cover = None
        if isinstance(images, list):
            for img in images:
                if img.get("size") in ("extralarge", "large"):
                    cover = img.get("#text")
                    if cover:
                        break

        out.append(
            {
                "title": t.get("name", ""),
                "artist": artist_name,
                "mbid": t.get("mbid") or None,
                "lastfm_match": round(match * 100, 1),
                "playcount": listeners,
                "cover": cover,
                "reason": "Last.fm 유사곡",
            }
        )
    return out


async def get_top_tracks_by_tag(client: httpx.AsyncClient, tag: str, limit: int = 15) -> list[dict]:
    data = await _call(client, "tag.getTopTracks", tag=tag, limit=str(limit))
    tracks = data.get("tracks", {}).get("track", [])
    if isinstance(tracks, dict):
        tracks = [tracks]

    out = []
    for t in tracks:
        artist_name = t.get("artist", {}).get("name", "") if isinstance(t.get("artist"), dict) else t.get("artist", "")
        images = t.get("image", [])
        cover = None
        if isinstance(images, list):
            for img in images:
                if img.get("size") in ("extralarge", "large", "medium"):
                    cover = img.get("#text")
                    if cover:
                        break

        out.append(
            {
                "title": t.get("name", ""),
                "artist": artist_name,
                "mbid": t.get("mbid") or None,
                "playcount": int(t.get("playcount", 0) or 0),
                "listeners": int(t.get("listeners", 0) or 0),
                "cover": cover,
                "reason": f"{tag} 장르",
            }
        )
    return out


async def get_artist_top_tags(client: httpx.AsyncClient, artist: str) -> list[dict]:
    data = await _call(client, "artist.getTopTags", artist=artist)
    return _parse_tags(data.get("toptags"))
