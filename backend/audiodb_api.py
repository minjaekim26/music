from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

AUDIODB_BASE = "https://www.theaudiodb.com/api/v1/json"


def _api_key() -> str:
    return os.getenv("AUDIODB_API_KEY", "2").strip()


async def _get(client: httpx.AsyncClient, endpoint: str, params: dict | None = None) -> dict:
    url = f"{AUDIODB_BASE}/{_api_key()}/{endpoint}"
    resp = await client.get(url, params=params or {}, timeout=20.0, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


async def search_track(client: httpx.AsyncClient, artist: str, track: str) -> dict | None:
    data = await _get(client, "searchtrack.php", {"s": artist, "t": track})
    items = data.get("track") or []
    if not items:
        return None
    return items[0]


async def search_artist(client: httpx.AsyncClient, artist: str) -> dict | None:
    data = await _get(client, "search.php", {"s": artist})
    items = data.get("artists") or []
    if not items:
        return None
    return items[0]


async def get_album(client: httpx.AsyncClient, album_id: str) -> dict | None:
    data = await _get(client, "album.php", {"m": album_id})
    items = data.get("album") or []
    if not items:
        return None
    return items[0]


def enrich_ui(track: dict | None, artist: dict | None, album: dict | None = None) -> dict[str, Any]:
    t = track or {}
    a = artist or {}
    al = album or {}

    return {
        "track_thumb": t.get("strTrackThumb"),
        "track_banner": t.get("strTrack3DCase") or t.get("strTrackThumb"),
        "album_name": t.get("strAlbum") or al.get("strAlbum"),
        "album_thumb": al.get("strAlbumThumb") or t.get("strAlbumThumb"),
        "album_banner": al.get("strAlbum3DCase") or al.get("strAlbumThumb"),
        "artist_thumb": a.get("strArtistThumb"),
        "artist_banner": a.get("strArtistBanner") or a.get("strArtistFanart"),
        "artist_logo": a.get("strArtistLogo"),
        "artist_country": a.get("strCountry"),
        "artist_genre": a.get("strGenre"),
        "artist_style": a.get("strStyle"),
        "artist_mood": a.get("strMood"),
        "artist_bio": (a.get("strBiographyEN") or "")[:400] or None,
        "track_genre": t.get("strGenre"),
        "track_style": t.get("strStyle"),
        "track_mood": t.get("strMood"),
        "track_description": (t.get("strDescriptionEN") or "")[:300] or None,
        "release_year": t.get("intYearReleased") or al.get("intYearReleased"),
        "label": al.get("strLabel") or t.get("strLabel"),
    }
