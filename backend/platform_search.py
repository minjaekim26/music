"""Spotify · SoundCloud · YouTube Music 검색."""

from __future__ import annotations

import asyncio
import base64
import os
import re
import time
from pathlib import Path
from typing import Any

import httpx

DATA_DIR = Path(__file__).resolve().parent / "data"
DEFAULT_YTM_HEADERS = DATA_DIR / "ytmusic_headers.json"

_SPOTIFY_TOKEN: str | None = None
_SPOTIFY_TOKEN_EXPIRES = 0.0
_YTM = None
_YTM_HEADERS_PATH: str | None = None

_TITLE_NOISE_RE = re.compile(
    r"\s*[\(\[](official\s*(music\s*)?video|lyrics?|audio|mv|4k|hd|visualizer)[\)\]]",
    re.I,
)

_YTM_HEADER_KEYS = frozenset(
    {
        "accept",
        "accept-encoding",
        "accept-language",
        "authorization",
        "cache-control",
        "content-type",
        "cookie",
        "origin",
        "pragma",
        "priority",
        "referer",
        "user-agent",
        "x-browser-channel",
        "x-browser-copyright",
        "x-browser-validation",
        "x-browser-year",
        "x-client-data",
        "x-goog-authuser",
        "x-goog-visitor-id",
        "x-origin",
        "x-youtube-bootstrap-logged-in",
        "x-youtube-client-name",
        "x-youtube-client-version",
    }
)


def spotify_configured() -> bool:
    return bool(os.getenv("SPOTIFY_CLIENT_ID", "").strip() and os.getenv("SPOTIFY_CLIENT_SECRET", "").strip())


def soundcloud_configured() -> bool:
    return bool(os.getenv("SOUNDCLOUD_CLIENT_ID", "").strip())


def youtube_api_configured() -> bool:
    return bool(os.getenv("YOUTUBE_API_KEY", "").strip())


def ytmusic_headers_path() -> Path | None:
    custom = os.getenv("YTMUSIC_HEADERS_FILE", "").strip()
    if custom:
        path = Path(custom)
        if path.is_file():
            return path
        return None
    if DEFAULT_YTM_HEADERS.is_file():
        return DEFAULT_YTM_HEADERS
    return None


def ytmusic_authenticated() -> bool:
    return _load_ytm_auth() is not None


async def _spotify_token(client: httpx.AsyncClient) -> str | None:
    global _SPOTIFY_TOKEN, _SPOTIFY_TOKEN_EXPIRES
    if not spotify_configured():
        return None
    if _SPOTIFY_TOKEN and time.monotonic() < _SPOTIFY_TOKEN_EXPIRES - 30:
        return _SPOTIFY_TOKEN

    client_id = os.getenv("SPOTIFY_CLIENT_ID", "").strip()
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    try:
        resp = await client.post(
            "https://accounts.spotify.com/api/token",
            data={"grant_type": "client_credentials"},
            headers={"Authorization": f"Basic {auth}"},
            timeout=20.0,
        )
        resp.raise_for_status()
        payload = resp.json()
    except httpx.HTTPError:
        return None

    _SPOTIFY_TOKEN = payload.get("access_token")
    _SPOTIFY_TOKEN_EXPIRES = time.monotonic() + float(payload.get("expires_in", 3600))
    return _SPOTIFY_TOKEN


def _pick_image(images: list[dict] | None) -> str | None:
    if not images:
        return None
    for size in ("large", "medium", ""):
        for img in images:
            if img.get("url") and (not size or img.get("size") == size):
                return img["url"]
    return images[0].get("url")


async def search_spotify_tracks(client: httpx.AsyncClient, query: str, limit: int = 25) -> list[dict[str, Any]]:
    token = await _spotify_token(client)
    if not token:
        return []

    try:
        resp = await client.get(
            "https://api.spotify.com/v1/search",
            params={"q": query, "type": "track", "limit": str(min(limit, 50))},
            headers={"Authorization": f"Bearer {token}"},
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError:
        return []

    out: list[dict[str, Any]] = []
    for item in data.get("tracks", {}).get("items", []):
        artists = item.get("artists") or []
        artist = artists[0].get("name", "") if artists else ""
        title = item.get("name", "")
        if not artist or not title:
            continue
        album = item.get("album") or {}
        out.append(
            {
                "title": title,
                "artist": artist,
                "mbid": None,
                "duration": _ms_to_duration(item.get("duration_ms")),
                "source": "spotify",
                "listeners": 0,
                "commercial_score": 0,
                "cover": _pick_image(album.get("images")),
                "deezer_id": None,
                "spotify_id": item.get("id"),
                "yt_video_id": None,
                "external_url": (item.get("external_urls") or {}).get("spotify"),
            }
        )
    return out


async def spotify_artist_genres(client: httpx.AsyncClient, artist: str) -> list[str]:
    token = await _spotify_token(client)
    if not token or not artist.strip():
        return []

    try:
        resp = await client.get(
            "https://api.spotify.com/v1/search",
            params={"q": artist, "type": "artist", "limit": "1"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=20.0,
        )
        resp.raise_for_status()
        items = resp.json().get("artists", {}).get("items", [])
    except httpx.HTTPError:
        return []

    if not items:
        return []
    return [g for g in items[0].get("genres", []) if g]


async def search_soundcloud_tracks(client: httpx.AsyncClient, query: str, limit: int = 25) -> list[dict[str, Any]]:
    client_id = os.getenv("SOUNDCLOUD_CLIENT_ID", "").strip()
    if not client_id:
        return []

    try:
        resp = await client.get(
            "https://api-v2.soundcloud.com/search/tracks",
            params={"q": query, "client_id": client_id, "limit": str(min(limit, 50))},
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError:
        return []

    out: list[dict[str, Any]] = []
    for item in data.get("collection", []):
        title = item.get("title", "")
        user = item.get("user") or {}
        artist = user.get("username") or user.get("full_name") or ""
        if not title:
            continue
        art = item.get("artwork_url") or user.get("avatar_url")
        if art and "-large" not in art:
            art = art.replace("-t500x500", "-t200x200")
        out.append(
            {
                "title": title,
                "artist": artist or "SoundCloud",
                "mbid": None,
                "duration": _ms_to_duration(item.get("duration")),
                "source": "soundcloud",
                "listeners": int(item.get("playback_count") or 0),
                "commercial_score": int(item.get("playback_count") or 0),
                "cover": art,
                "deezer_id": None,
                "spotify_id": None,
                "soundcloud_id": str(item.get("id", "")),
                "yt_video_id": None,
                "external_url": item.get("permalink_url"),
            }
        )
    return out


async def fetch_soundcloud_genre_tags(
    client: httpx.AsyncClient,
    *,
    soundcloud_id: str | None = None,
    artist: str = "",
    title: str = "",
) -> list[str]:
    """SoundCloud 트랙/검색에서 genre·tag_list 추출."""
    client_id = os.getenv("SOUNDCLOUD_CLIENT_ID", "").strip()
    if not client_id:
        return []

    data: dict | None = None
    if soundcloud_id:
        try:
            resp = await client.get(
                f"https://api-v2.soundcloud.com/tracks/{soundcloud_id}",
                params={"client_id": client_id},
                timeout=20.0,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError:
            data = None

    if not data and artist and title:
        try:
            resp = await client.get(
                "https://api-v2.soundcloud.com/search/tracks",
                params={"q": f"{artist} {title}", "client_id": client_id, "limit": "5"},
                timeout=20.0,
            )
            resp.raise_for_status()
            query = f"{title}|{artist}".lower()
            for item in resp.json().get("collection", []):
                key = f"{item.get('title', '')}|{(item.get('user') or {}).get('username', '')}".lower()
                if query in key or key in query or title.lower() in item.get("title", "").lower():
                    data = item
                    break
            if not data:
                items = resp.json().get("collection", [])
                data = items[0] if items else None
        except httpx.HTTPError:
            data = None

    if not data:
        return []

    tags: list[str] = []
    genre = (data.get("genre") or "").strip()
    if genre:
        for part in re.split(r"[,/&]+", genre):
            part = part.strip()
            if part:
                tags.append(part)
    raw_tags = data.get("tag_list")
    if isinstance(raw_tags, str) and raw_tags.strip():
        tags.extend(t.strip() for t in raw_tags.split() if t.strip())

    seen: set[str] = set()
    out: list[str] = []
    for tag in tags:
        key = tag.lower()
        if key not in seen:
            seen.add(key)
            out.append(tag)
    return out


def _sanitize_ytm_headers(raw: dict[str, Any]) -> dict[str, str]:
    """Drop junk keys from browser paste; keep only valid request headers."""
    cleaned: dict[str, str] = {}
    for key, value in raw.items():
        norm = str(key).lower()
        if norm not in _YTM_HEADER_KEYS:
            continue
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        cleaned[norm] = text
    return cleaned


def _load_ytm_auth() -> dict[str, str] | None:
    import json

    raw_json = os.getenv("YTMUSIC_HEADERS_JSON", "").strip()
    if raw_json:
        try:
            raw = json.loads(raw_json)
        except json.JSONDecodeError:
            raw = None
        if isinstance(raw, dict):
            cleaned = _sanitize_ytm_headers(raw)
            if "cookie" in cleaned:
                return cleaned

    path = ytmusic_headers_path()
    if not path:
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    cleaned = _sanitize_ytm_headers(raw)
    if "cookie" not in cleaned:
        return None
    return cleaned


def _ytm_client():
    global _YTM, _YTM_HEADERS_PATH
    auth = _load_ytm_auth()
    path_key = str(sorted((auth or {}).items()))
    if _YTM is not None and _YTM_HEADERS_PATH == path_key:
        return _YTM

    from ytmusicapi import YTMusic

    if auth:
        _YTM = YTMusic(auth)
    else:
        _YTM = YTMusic()
    _YTM_HEADERS_PATH = path_key
    return _YTM


def _clean_ytm_title(title: str) -> str:
    cleaned = _TITLE_NOISE_RE.sub("", title)
    return re.sub(r"\s+", " ", cleaned).strip(" -")


def _parse_artist_title(title: str) -> tuple[str, str]:
    cleaned = _clean_ytm_title(title)
    if " - " in cleaned:
        left, right = cleaned.split(" - ", 1)
        left, right = left.strip(), right.strip()
        if left and right:
            return left, right
    return "", cleaned


def _ytm_hit_to_row(item: dict, *, query: str = "") -> dict[str, Any] | None:
    title = item.get("title") or ""
    artists = item.get("artists") or []
    artist = artists[0].get("name", "") if artists else item.get("artist") or ""
    video_id = item.get("videoId")

    if not video_id and not title:
        return None

    if not artist and title:
        parsed_artist, parsed_title = _parse_artist_title(title)
        if parsed_artist:
            artist, title = parsed_artist, parsed_title

    if not title or not artist:
        return None

    # Skip obvious non-music uploads when searching for an artist name
    query_l = query.strip().lower()
    artist_l = artist.lower()
    title_l = title.lower()
    if query_l and query_l not in artist_l and query_l not in title_l:
        if item.get("resultType") in ("episode", "podcast"):
            return None
        if any(x in title_l for x in ("podcast", "interview", "rates", "episode")):
            return None

    thumbs = item.get("thumbnails") or []
    cover = thumbs[-1].get("url") if thumbs else None
    return {
        "title": _clean_ytm_title(title),
        "artist": artist,
        "mbid": None,
        "duration": item.get("duration"),
        "source": "ytmusic",
        "listeners": 0,
        "commercial_score": 1,
        "cover": cover,
        "deezer_id": None,
        "spotify_id": None,
        "yt_video_id": str(video_id) if video_id else None,
        "external_url": f"https://music.youtube.com/watch?v={video_id}" if video_id else None,
    }


def _search_ytmusic_artist_songs(ytm, query: str, limit: int, seen: set[str], out: list[dict[str, Any]]) -> None:
    if len(out) >= limit:
        return
    try:
        raw = ytm.search(query, limit=5, ignore_spelling=True)
    except Exception:
        return

    artist_id = None
    artist_name = query
    for item in raw or []:
        if item.get("resultType") != "artist":
            continue
        artists = item.get("artists") or []
        if artists and artists[0].get("id"):
            artist_id = artists[0]["id"]
            artist_name = artists[0].get("name") or query
            break

    if not artist_id:
        return

    try:
        profile = ytm.get_artist(artist_id)
    except Exception:
        return

    songs_block = profile.get("songs") or {}
    for song in songs_block.get("results") or []:
        row = _ytm_hit_to_row({**song, "artist": song.get("artist") or artist_name}, query=query)
        if not row or not row.get("yt_video_id"):
            continue
        key = f"{row['title']}|{row['artist']}".lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
        if len(out) >= limit:
            return

    browse_id = songs_block.get("browseId")
    if browse_id and len(out) < limit:
        try:
            playlist = ytm.get_playlist(browse_id, limit=min(limit, 25))
        except Exception:
            playlist = None
        if playlist:
            for track in playlist.get("tracks") or []:
                row = _ytm_hit_to_row({**track, "artist": track.get("artist") or artist_name}, query=query)
                if not row or not row.get("yt_video_id"):
                    continue
                key = f"{row['title']}|{row['artist']}".lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(row)
                if len(out) >= limit:
                    return


def _search_ytmusic_sync(query: str, limit: int) -> list[dict[str, Any]]:
    ytm = _ytm_client()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_items(items: list | None) -> None:
        if not items:
            return
        for item in items:
            if not isinstance(item, dict):
                continue
            row = _ytm_hit_to_row(item, query=query)
            if not row or not row.get("yt_video_id"):
                continue
            key = f"{row['title']}|{row['artist']}".lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(row)
            if len(out) >= limit:
                return

    search_filters = ("songs", "videos")
    if ytmusic_authenticated():
        search_filters = ("songs", "videos", "episodes")

    for filt in search_filters:
        if len(out) >= limit:
            break
        try:
            raw = ytm.search(query, filter=filt, limit=min(limit, 50), ignore_spelling=True)
        except Exception:
            continue
        add_items(raw)

    if len(out) < limit:
        try:
            raw = ytm.search(query, limit=min(limit, 50), ignore_spelling=True)
            add_items([x for x in raw if x.get("resultType") in ("song", "video", "episode")])
        except Exception:
            pass

    if len(out) < limit:
        _search_ytmusic_artist_songs(ytm, query, limit, seen, out)

    return out[:limit]


async def search_youtube_data_api(client: httpx.AsyncClient, query: str, limit: int = 25) -> list[dict[str, Any]]:
    api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        return []

    try:
        resp = await client.get(
            "https://www.googleapis.com/youtube/v3/search",
            params={
                "part": "snippet",
                "q": f"{query} official audio",
                "type": "video",
                "videoCategoryId": "10",
                "maxResults": str(min(limit, 50)),
                "key": api_key,
            },
            timeout=20.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPError:
        return []

    out: list[dict[str, Any]] = []
    for item in data.get("items", []):
        snippet = item.get("snippet") or {}
        title = snippet.get("title") or ""
        artist = snippet.get("channelTitle") or ""
        video_id = (item.get("id") or {}).get("videoId")
        if not title or not video_id:
            continue
        parsed_artist, parsed_title = _parse_artist_title(title)
        if parsed_artist:
            artist, title = parsed_artist, parsed_title
        thumbs = snippet.get("thumbnails") or {}
        cover = (thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url")
        out.append(
            {
                "title": _clean_ytm_title(title),
                "artist": artist,
                "mbid": None,
                "duration": None,
                "source": "ytmusic",
                "listeners": 0,
                "commercial_score": 1,
                "cover": cover,
                "deezer_id": None,
                "spotify_id": None,
                "yt_video_id": str(video_id),
                "external_url": f"https://music.youtube.com/watch?v={video_id}",
            }
        )
    return out


async def search_ytmusic_tracks(client: httpx.AsyncClient, query: str, limit: int = 25) -> list[dict[str, Any]]:
    primary = await asyncio.to_thread(_search_ytmusic_sync, query, limit)
    if len(primary) >= limit:
        return primary

    if youtube_api_configured():
        extra = await search_youtube_data_api(client, query, limit - len(primary))
        seen = {f"{x['title']}|{x['artist']}".lower() for x in primary}
        for row in extra:
            key = f"{row['title']}|{row['artist']}".lower()
            if key in seen:
                continue
            primary.append(row)
            seen.add(key)
            if len(primary) >= limit:
                break
    return primary[:limit]


def _ms_to_duration(ms: int | None) -> str | None:
    if not ms:
        return None
    try:
        total = int(ms) // 1000
    except (TypeError, ValueError):
        return None
    m, s = divmod(total, 60)
    return f"{m}:{s:02d}"
