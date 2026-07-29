from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import tempfile

import httpx
from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from audio_analyzer import analyze_audio

from music_api import (
    get_static_genre_map,
    get_track_detail,
    recommend_by_genre,
    recommend_by_genres,
    recommend_by_keywords,
    search_tracks,
)
from taste_analysis import analyze_taste_query, is_llm_configured, profile_to_keywords
import track_cache
import openai_service


class TasteAnalyzeBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """서버 시작 시 httpx 클라이언트 1개 생성, 종료 시 connection pool 정리."""
    track_cache.init_db()
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(20.0, connect=10.0),
        follow_redirects=True,
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
    )
    try:
        yield
    finally:
        await app.state.http_client.aclose()


app = FastAPI(
    title="Music Explorer API",
    description="음악 검색, Every Noise 장르 맵, 유사곡 추천 API",
    version="2.0.0",
    lifespan=lifespan,
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
        "llm_configured": is_llm_configured(),
        "openai_configured": openai_service.is_configured(),
    }


@app.get("/api/genre-map")
async def genre_map():
    return get_static_genre_map()


@app.get("/api/search")
async def search(request: Request, q: str = Query(..., min_length=1), limit: int = 12):
    client: httpx.AsyncClient = request.app.state.http_client
    try:
        payload = await search_tracks(client, q, limit=min(max(limit, 1), 20))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc
    return {"query": q, **payload}


@app.get("/api/track")
async def track_detail(
    request: Request,
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

    client: httpx.AsyncClient = request.app.state.http_client
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
    request: Request,
    genre: str = Query(..., min_length=1, description="추천받을 장르"),
    exclude_title: str | None = Query(None, description="제외할 곡 제목"),
    exclude_artist: str | None = Query(None, description="제외할 아티스트"),
    limit: int = 12,
):
    client: httpx.AsyncClient = request.app.state.http_client
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
    request: Request,
    genres: list[str] = Query(..., description="여러 장르 선택 (genres=pop&genres=rock)"),
    exclude_title: str | None = Query(None, description="제외할 곡 제목"),
    exclude_artist: str | None = Query(None, description="제외할 아티스트"),
    limit: int = 12,
):
    client: httpx.AsyncClient = request.app.state.http_client
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
    request: Request,
    keywords: list[str] = Query(..., description="키워드 목록 (keywords=rock&keywords=dreamy)"),
    limit: int = 12,
):
    client: httpx.AsyncClient = request.app.state.http_client
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

    # GPT 추천 이유 생성 (실패해도 기존 result 는 그대로 반환)
    user_query = " ".join(keywords)
    recommendation_reason = await openai_service.generate_recommendation_reason(
        client, user_query, result.get("tracks", [])
    )

    return {**result, "recommendation_reason": recommendation_reason}


@app.post("/api/taste/analyze")
async def taste_analyze(request: Request, body: TasteAnalyzeBody):
    """자연어 취향 → mood / genre / tempo / keywords JSON."""
    client: httpx.AsyncClient = request.app.state.http_client
    try:
        profile = await analyze_taste_query(client, body.query)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"AI 분석 요청 실패: {exc}") from exc
    return profile


@app.post("/api/analyze")
async def analyze_audio_file(file: UploadFile = File(...)):
    """오디오 파일 업로드 → librosa 분석 (tempo, energy, mfcc)."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".mp3", ".wav", ".flac", ".ogg", ".m4a"}:
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다. (mp3, wav, flac, ogg, m4a)")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = analyze_audio(tmp_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"오디오 분석 실패: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return {
        "filename": file.filename,
        "size_bytes": len(content),
        **result,
    }


@app.get("/api/recommend/taste")
async def taste_recommendations(
    request: Request,
    query: str = Query(..., min_length=1, description="자연어 취향 설명"),
    limit: int = 12,
):
    """자연어 취향 분석 후 키워드 기반 추천."""
    client: httpx.AsyncClient = request.app.state.http_client
    try:
        profile = await analyze_taste_query(client, query)
        keywords = profile_to_keywords(profile)
        if not keywords:
            raise ValueError("키워드를 추출하지 못했습니다.")
        result = await recommend_by_keywords(
            client,
            keywords,
            limit=min(max(limit, 1), 50),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc

    # GPT 추천 이유 생성 (실패해도 기존 result 는 그대로 반환)
    recommendation_reason = await openai_service.generate_recommendation_reason(
        client, query, result.get("tracks", [])
    )

    return {
        "query": query,
        "taste_profile": profile,
        "keywords_used": keywords,
        **result,
        "recommendation_reason": recommendation_reason,
    }


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
