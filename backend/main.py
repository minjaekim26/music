from __future__ import annotations

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from music_api import get_track_detail, search_tracks

app = FastAPI(
    title="Music Explorer API",
    description="음악 검색, 장르 분석, 유사곡 추천 API",
    version="1.0.0",
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
    return {"status": "ok"}


@app.get("/api/search")
async def search(q: str = Query(..., min_length=1, description="검색어 (곡명, 아티스트)"), limit: int = 10):
    async with httpx.AsyncClient() as client:
        try:
            results = await search_tracks(client, q, limit=min(max(limit, 1), 20))
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc
    return {"query": q, "results": results}


@app.get("/api/track")
async def track_detail(
    mbid: str | None = Query(None, description="MusicBrainz recording ID"),
    deezer_id: int | None = Query(None, description="Deezer track ID"),
    title: str | None = Query(None, description="곡 제목"),
    artist: str | None = Query(None, description="아티스트"),
):
    if not any([mbid, deezer_id, (title and artist)]):
        raise HTTPException(status_code=400, detail="mbid, deezer_id, 또는 title+artist 중 하나는 필요합니다.")

    async with httpx.AsyncClient() as client:
        try:
            detail = await get_track_detail(
                client,
                mbid=mbid,
                deezer_id=deezer_id,
                title=title,
                artist=artist,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"음악 API 요청 실패: {exc}") from exc

    return detail
