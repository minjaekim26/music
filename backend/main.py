from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from music_api import (
    get_static_genre_map,
    get_track_detail,
    recommend_by_genre,
    recommend_by_genres,
    recommend_by_keywords,
    search_tracks,
)

app = FastAPI(
    title="Music Explorer API",
    description="음악 검색, Every Noise 장르 맵, 유사곡 추천 API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    from platform_search import ytmusic_authenticated, youtube_api_configured

    return {
        "status": "ok",
        "lastfm_configured": bool(os.getenv("LASTFM_API_KEY", "").strip()),
        "spotify_configured": bool(os.getenv("SPOTIFY_CLIENT_ID", "").strip() and os.getenv("SPOTIFY_CLIENT_SECRET", "").strip()),
        "soundcloud_configured": bool(os.getenv("SOUNDCLOUD_CLIENT_ID", "").strip()),
        "ytmusic_authenticated": ytmusic_authenticated(),
        "youtube_api_configured": youtube_api_configured(),
    }


@app.get("/api/genre-map")
async def genre_map():
    return get_static_genre_map()


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1), limit: int = 12):
    async with httpx.AsyncClient() as client:
        try:
            payload = await search_tracks(client, q, limit=min(max(limit, 1), 50))
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc
    return {"query": q, **payload}


@app.get("/api/track")
async def track_detail(
    mbid: str | None = Query(None),
    deezer_id: int | None = Query(None),
    soundcloud_id: str | None = Query(None),
    title: str | None = Query(None),
    artist: str | None = Query(None),
    external_url: str | None = Query(None),
    source: str | None = Query(None),
):
    if not any([mbid, deezer_id, soundcloud_id, (title and artist)]):
        raise HTTPException(status_code=400, detail="mbid, deezer_id, soundcloud_id, 또는 title+artist 중 하나는 필요합니다.")

    async with httpx.AsyncClient() as client:
        try:
            detail = await get_track_detail(
                client,
                mbid=mbid,
                deezer_id=deezer_id,
                soundcloud_id=soundcloud_id,
                title=title,
                artist=artist,
                external_url=external_url,
                source=source,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc

    return detail


@app.get("/api/recommend/genre")
async def genre_recommendations(
    genre: str = Query(..., min_length=1, description="추천받을 장르"),
    exclude_title: str | None = Query(None, description="제외할 곡 제목"),
    exclude_artist: str | None = Query(None, description="제외할 아티스트"),
    limit: int = 12,
):
    async with httpx.AsyncClient() as client:
        try:
            result = await recommend_by_genre(
                client,
                genre,
                exclude_title=exclude_title,
                exclude_artist=exclude_artist,
                limit=min(max(limit, 1), 20),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc

    return result


@app.get("/api/recommend/genres")
async def genres_recommendations(
    genres: list[str] = Query(..., description="여러 장르 선택 (genres=pop&genres=rock)"),
    exclude_title: str | None = Query(None, description="제외할 곡 제목"),
    exclude_artist: str | None = Query(None, description="제외할 아티스트"),
    limit: int = 12,
):
    async with httpx.AsyncClient() as client:
        try:
            result = await recommend_by_genres(
                client,
                genres,
                exclude_title=exclude_title,
                exclude_artist=exclude_artist,
                limit=min(max(limit, 1), 20),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc

    return result


@app.get("/api/recommend/keywords")
async def keyword_recommendations(
    keywords: list[str] = Query(..., description="키워드 목록 (keywords=rock&keywords=dreamy)"),
    limit: int = 12,
):
    async with httpx.AsyncClient() as client:
        try:
            result = await recommend_by_keywords(
                client,
                keywords,
                limit=min(max(limit, 1), 50),
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc

    return result


def _should_serve_static() -> bool:
    mode = os.getenv("SERVE_STATIC", "auto").strip().lower()
    if mode in ("0", "false", "no"):
        return False
    if mode in ("1", "true", "yes"):
        return True
    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "index.html"
    return dist.is_file()


def _mount_frontend(app: FastAPI) -> None:
    if not _should_serve_static():
        return

    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
    assets_dir = dist / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        if full_path:
            candidate = dist / full_path
            if candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(dist / "index.html")


_mount_frontend(app)
