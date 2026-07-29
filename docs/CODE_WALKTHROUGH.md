# Music Explorer — 파일별 코드 설명

디렉터리에 있는 **소스·설정 파일**을 하나씩 열어 무엇을 하는지 정리한 문서입니다.  
전체 파이프라인 요약은 [HOW_IT_WORKS.md](HOW_IT_WORKS.md)를 보세요.

- 저장소: https://github.com/minjaekim26/music
- 앱 이름(UI): **distribution**
- 개발 포트: 백엔드 **8020** · 프론트 **5173** (배포 시 보통 **8080**)

> 제외: `node_modules/`, `frontend/dist/`, `__pycache__/`, `.git/`,  
> `everynoise_genres.json` 본문(수만 줄), `ytmusic*.json` 시크릿, `package-lock.json` 덤프

---

## 목차

1. [디렉터리 한눈에](#1-디렉터리-한눈에)
2. [백엔드 Python](#2-백엔드-python)
3. [백엔드 data / scripts](#3-백엔드-data--scripts)
4. [프론트엔드](#4-프론트엔드)
5. [루트 설정·배포·스크립트](#5-루트-설정배포스크립트)
6. [환경 변수 표](#6-환경-변수-표)

---

## 1. 디렉터리 한눈에

```
music/
├── backend/                 # FastAPI
│   ├── main.py
│   ├── music_api.py
│   ├── genre_map.py
│   ├── lastfm_api.py
│   ├── platform_search.py
│   ├── audiodb_api.py
│   ├── search_aliases.py
│   ├── track_metadata.py
│   ├── requirements.txt
│   ├── data/                # 맵 JSON, 별칭 시드, (런타임) DB
│   └── scripts/             # 맵 빌드, YT Music 설정
├── frontend/                # React + Vite + Tailwind
│   ├── src/App.jsx, main.jsx, index.css
│   └── src/components/...
├── docs/                    # HOW_IT_WORKS, CODE_WALKTHROUGH
├── Dockerfile, render.yaml, docker-compose.yml, railway.toml
├── run-*.ps1, build.ps1, setup-ytmusic.ps1
├── .env.example, README.md, PROJECT.txt
└── .gitignore, .dockerignore
```

요청 흐름:

```
브라우저 → App.jsx
        → /api/* (Vite 프록시 → :8020)
        → main.py
        → music_api.py
             ├ lastfm / audiodb / platform_search
             ├ genre_map (everynoise JSON)
             └ search_aliases / track_metadata
```

---

## 2. 백엔드 Python

### 2.1 `backend/main.py` — API 입구

**역할:** FastAPI 앱 생성, CORS, 라우트 정의, 배포 시 프론트 정적 파일 서빙.

| 라우트 | 핸들러 | 하는 일 |
|--------|--------|---------|
| `GET /api/health` | `health` | 상태 + Last.fm/Spotify/SC/YT 설정 여부 |
| `GET /api/genre-map` | `genre_map` | Every Noise 노드 전체 |
| `GET /api/search` | `search` | `q`, `limit`(1–50) → 검색 |
| `GET /api/track` | `track_detail` | mbid/deezer/sc/title+artist → 상세 |
| `GET /api/recommend/genre` | `genre_recommendations` | 단일 장르 추천 |
| `GET /api/recommend/genres` | `genres_recommendations` | 다중 장르 |
| `GET /api/recommend/keywords` | `keyword_recommendations` | 키워드 추천 |

**보조 함수**

- `_should_serve_static()` — `SERVE_STATIC`이 `auto`면 `frontend/dist/index.html` 있을 때만 서빙
- `_mount_frontend()` — `/assets` 마운트 + SPA 폴백(`api` 경로는 제외)

에러: 외부 HTTP 실패 → 502, 곡 없음 → 404, 파라미터 부족 → 400.

---

### 2.2 `backend/music_api.py` — 핵심 로직

**역할:** 검색·상세·추천을 여러 API에서 모아 합치는 **오케스트레이션**.

**공개 함수**

| 함수 | 요약 |
|------|------|
| `search_tracks` | 별칭 확장 → 소스 병렬 검색 → 병합 → 관련도 정렬 → 커버 보강 |
| `get_track_detail` | 태그 수집 → 장르 프로필 → 맵·유사곡·UI 메타 조립 |
| `get_static_genre_map` | 맵 JSON을 API용으로 노출 |
| `recommend_by_genre` | Last.fm tag top + Deezer genre 검색 → 유사도 |
| `recommend_by_genres` | 여러 장르를 합쳐 동일 파이프라인 |
| `recommend_by_keywords` | 키워드 히트 수(specificity)로 필터·점수 |

**검색 파이프라인**

1. `expand_search_queries` / 한글이면 MusicBrainz 영문명 확장
2. `_gather_search_hits` — Last.fm, MusicBrainz, Deezer, Spotify, SoundCloud, YT Music **동시** 호출
3. `_merge_search_hit` — `title|artist` 키로 중복 합침
4. `_search_relevance` — 텍스트 매칭 72% + 리스너 인기 28%
5. 관련도 ≤ 0 제외 → `_finalize_search_order`
6. `_enrich_search_result` — 커버 등

**상세 파이프라인 (`get_track_detail`)**

1. MB recording (mbid 있으면)
2. SoundCloud 장르 태그
3. 병렬: Last.fm info, AudioDB track/artist, Deezer
4. `_collect_tags` (가중치) → 없으면 `_infer_genre_tags_fallback`
5. `build_genre_profile` → 위치·매칭 장르
6. `collect_subgenre_focus_nodes` → 분석 맵용 노드
7. Last.fm similar (+ Deezer 폴백) → `_enrich_similar_track`
8. AudioDB `enrich_ui` + 응답 JSON

**중요 헬퍼**

- `_mb_get` — MusicBrainz **약 1초 1회** 레이트 리밋 (`_mb_lock`)
- `_dz_get` — Deezer GET
- `_score_deezer_match` / `_pick_best_deezer_match` — 제목·아티스트 토큰 겹침으로 미리듣기 곡 고르기
- `_finalize_genre_rec_item` — 장르 추천 similarity 보강
- `_describe_genres` — 한국어 장르 설명 문장
- `_keyword_specificity_meta` — 키워드 추천 정밀도 단계

**모듈 로드 시:** `init_search_aliases_db()` 실행 → `data/search_aliases.db` 생성 가능.

---

### 2.3 `backend/genre_map.py` — Every Noise 좌표·유사도

**역할:** `data/everynoise_genres.json`을 읽어 태그를 맵 노드에 붙이고, 곡 위치·유사도를 계산.

| 함수 | 하는 일 |
|------|---------|
| `get_map_bounds` / `get_genre_map` | bounds·노드(+ children) 반환 |
| `rollup_to_top_genre_id` 등 | 상위 장르로 말기 (현재 프로필은 leaf 우선) |
| `filter_leaf_genre_ids/names` | 부모·자식이 같이 있으면 **자식만** 유지 |
| `build_genre_profile` | 태그→leaf 점수 → 가중 평균 `(x,y)` + similarity % |
| `genre_similarity_between` | 두 태그셋 장르 벡터 **코사인 × 100** |
| `map_distance_similarity` | `100 - dist/7` |
| `collect_subgenre_focus_nodes` | 매칭 + 자식(없으면 형제) 포커스 노드 |

**내부**

- `_load_dataset` / `_nodes_index` — `lru_cache`로 JSON·별칭 인덱스
- `_match_genre_id` — 정규화 + `EXTRA_ALIASES` (`kpop`→`k-pop`, `r&b`→`rhythm and blues` 등)
- 파일 없으면 `FileNotFoundError` (먼저 `build_everynoise_map.py` 실행)

---

### 2.4 `backend/lastfm_api.py` — Last.fm

| 함수 | API |
|------|-----|
| `is_configured` | `LASTFM_API_KEY` 유무 |
| `search_tracks` | `track.search` (상업곡 필터) |
| `get_track_info` | `track.getInfo` |
| `get_similar_tracks` | `track.getSimilar` |
| `get_top_tracks_by_tag` | `tag.getTopTracks` |
| `get_artist_top_tags` | `artist.getTopTags` |

환경: `COMMERCIAL_MIN_LISTENERS`(기본 5000), `COMMERCIAL_MIN_PLAYCOUNT`(기본 10000).

---

### 2.5 `backend/audiodb_api.py` — TheAudioDB

| 함수 | 하는 일 |
|------|---------|
| `search_track` / `search_artist` / `get_album` | 트랙·아티스트·앨범 조회 |
| `enrich_ui` | 썸네일·배너·국가·장르·무드·바이오 등 UI용 dict |

키 기본값 `"2"` (`AUDIODB_API_KEY`).

---

### 2.6 `backend/platform_search.py` — Spotify / SoundCloud / YT Music

| 함수 | 하는 일 |
|------|---------|
| `*_configured` / `ytmusic_authenticated` | 설정·인증 체크 |
| `search_spotify_tracks` | Spotify 트랙 검색 |
| `spotify_artist_genres` | 아티스트 장르 (폴백용) |
| `search_soundcloud_tracks` | SC 검색 |
| `fetch_soundcloud_genre_tags` | `genre` + `tag_list` |
| `search_youtube_data_api` | Data API v3 |
| `search_ytmusic_tracks` | ytmusicapi (스레드) + 부족 시 Data API |

**내부 포인트**

- Spotify: Client Credentials 토큰 캐시 (`_SPOTIFY_TOKEN`)
- YT Music: `_sanitize_ytm_headers`로 Chrome 붙여넣기 잡키 제거 후 `YTMusic` 생성
- 인증: `ytmusic_headers.json` 또는 env `YTMUSIC_HEADERS_JSON` (**쿠키 시크릿 — 커밋 금지**)

---

### 2.7 `backend/track_metadata.py`

**역할:** 장르 조회 전에 제목/아티스트 정규화.

- `normalize_for_genre_lookup(title, artist)` → `(artist, title)`
- MV/lyrics/cover 괄호, feat. 제거
- `"Artist - Title"` 형태면 업로더명과 다르면 분리

순수 함수, 외부 I/O 없음.

---

### 2.8 `backend/search_aliases.py`

**역할:** 한글·오타 검색어를 영문 canonical으로 확장.

| 함수 | 하는 일 |
|------|---------|
| `has_hangul` | 한글 포함 여부 |
| `init_search_aliases_db` | SQLite 테이블 + 시드 JSON |
| `lookup_alias` | 정확/퍼지(≥0.72) 매칭 |
| `expand_search_queries` | `{original, queries, matches}` |
| `add_search_alias` | 런타임 별칭 추가 |

파일: `data/search_aliases.db`(런타임), `data/search_aliases_seed.json`(시드).

---

### 2.9 `backend/requirements.txt`

```
fastapi, uvicorn[standard], httpx, python-dotenv, ytmusicapi
```

---

## 3. 백엔드 data / scripts

### 3.1 `backend/data/everynoise_genres.json`

- `build_everynoise_map.py`가 everynoise.com에서 생성
- 약 **6,000+** 장르 노드: `id`, `name`, `x`/`y`(0–1000), `color`, `fontSize`, `parentId`, `children`
- `bounds`, `parentOf`, `count`, `source` 포함
- **앱 동작에 필수** (용량 커서 문서에 본문 미포함)

### 3.2 `backend/data/search_aliases_seed.json`

아티스트/트랙 한글↔영문 별칭 시드 배열 `{canonical, kind, aliases[]}`.

### 3.3 `backend/data/ytmusic_headers.json` / `ytmusic_minimal.json`

YouTube Music 브라우저 헤더(쿠키 등). **시크릿** — `.gitignore` 대상.

### 3.4 `backend/data/search_aliases.db`

런타임 SQLite. gitignore.

### 3.5 `backend/scripts/build_everynoise_map.py`

1. `engenremap.html` 다운로드  
2. 장르 div 스타일(좌표·색·폰트) 파싱  
3. 0–1000 정규화, 이름 포함 관계로 parent 추론  
4. `everynoise_genres.json` 저장  

수동 실행용 배치 스크립트.

### 3.6 `backend/scripts/setup_ytmusic.py`

대화형: music.youtube.com 헤더 붙여넣기 → `ytmusicapi.setup` → `ytmusic_headers.json` 저장.  
루트 `setup-ytmusic.ps1`이 이 스크립트를 호출.

### 3.7 `backend/check_yt.txt`

로컬 디버그 로그 성격. 런타임에 사용하지 않음.

---

## 4. 프론트엔드

### 4.1 `frontend/src/main.jsx`

React 엔트리. `#root`에 `<App />` 마운트, `index.css` import, `StrictMode`.

### 4.2 `frontend/src/index.css`

Tailwind layers + 라이트/다크 body 배경(다크는 방사형 그라데이션) + 스크롤바 스타일.

### 4.3 `frontend/src/App.jsx` — 화면 컨트롤러

**상수:** `API_BASE = import.meta.env.VITE_API_BASE || ""` (빈 값 → Vite 프록시).

**같은 파일 안 서브 UI**

| 심볼 | 역할 |
|------|------|
| `searchEmptyHint` | 검색 실패 시 한국어 힌트 |
| `applyTheme` / `getInitialTheme` | `localStorage` `distribution_theme` |
| `Chip` | 장르/무드/기본 칩 |
| `formatNumber` | K/M 표기 |
| `SearchResult` | 검색 한 줄 (커버·관련도%) |
| `TrackDetail` | 상세: 배너·미리듣기·GenreMap·GenreBars·칩 |

**App 상태:** `query/results/detail`, `genreRecommendations`, `pickedGenres`, `genreMapNodes`, `theme`, `backendOk`, `helpOpen` 등.

**핸들러**

| 함수 | API |
|------|-----|
| `handleSearch` | `GET /api/search` → relevance > 0 필터·정렬 |
| `loadDetail` | `GET /api/track?...` |
| `handleGenreSelect` | `GET /api/recommend/genre` |
| `recommendPickedGenres` | `GET /api/recommend/genres` |
| `resetHome` | 홈 초기화 |

**레이아웃:** 헤더(distribution) → 검색 → KeywordRecommend → 추천 리스트 → 장르 맵 버튼 → TrackDetail.

### 4.4 `frontend/src/components/EveryNoiseMap.jsx`

스크롤·줌 가능한 장르 캔버스.

**export 헬퍼:** `nodePixelPos`, `computeLocalBounds`, `normalizeNodesInBounds`.

**props 요약:** `nodes`, `bounds`, `viewBounds`, `matchedGenres`, `trackPosition`, `focusMode`, `fitToView`, `showAll`, `searchQuery`, `onSelect`.

- 노드 많으면 뷰포트 컬링 (단 `showAll`/`search`면 전부)
- `fitToView`: 컨텐츠가 한 화면에 들어오게 scale ≤ 1
- 매칭 장르 ↔ 곡 위치 SVG 선
- `+/-` 줌 0.5–2

### 4.5 `frontend/src/components/GenreMap.jsx`

곡 분석용 맵 카드.

- `subgenre_nodes` 우선, 없으면 매칭+자식/형제
- `viewBounds`로 구역 크롭 + `fitToView` (좌표 스트레치 확대 안 함)
- 범례: ▲ 이 곡 / 매칭 / 하위 장르

### 4.6 `frontend/src/components/GenreBars.jsx`

매칭 장르 similarity % 가로 막대.  
추가로 `SimilarityBadge` (임계값별 색).

### 4.7 `frontend/src/components/GenreExplorer.jsx`

전체 맵 모달: 검색·드릴다운·다중 선택 → `onRecommend`.  
`scoreGenreSearchMatch` = 텍스트 75% + 인기 15% + 공간 10%.

### 4.8 `frontend/src/components/KeywordRecommend.jsx`

키워드 칩(최대 12) → debounce 450ms → `/api/recommend/keywords`.  
specificity 바 + TrackRecommendList.

### 4.9 `frontend/src/components/TrackRecommendList.jsx`

추천 행: 커버·제목·아티스트·reason·`similarity ?? genre_similarity ?? 0` %.

### 4.10 `frontend/src/components/Pagination.jsx`

`PAGE_SIZE = 10`, `usePagination`, `PaginationBar` (이전/다음).

### 4.11 `frontend/src/components/HelpPanel.jsx`

한국어 도움말 모달 (검색·맵·키워드·데이터 소스 설명).

### 4.12 프론트 설정 파일

| 파일 | 내용 |
|------|------|
| `index.html` | `lang=ko`, 폰트 Syne, `#root` |
| `vite.config.js` | host `127.0.0.1`, port **5173**, `/api` → `8020` |
| `package.json` | react 18, vite 5, scripts: `dev`/`build`/`preview` |
| `tailwind.config.js` | `darkMode: class`, accent `#7c5cff`, font Syne/Pretendard |
| `postcss.config.js` | tailwindcss + autoprefixer |

---

## 5. 루트 설정·배포·스크립트

### 5.1 `Dockerfile`

1. Node 스테이지: `npm ci` → `npm run build`  
2. Python 스테이지: requirements 설치, backend + `frontend/dist` 복사  
3. `SERVE_STATIC=1`, `uvicorn` port 8080, health `/api/health`

### 5.2 `docker-compose.yml`

서비스 `music`, `.env` 로드, 포트 `${PORT:-8080}:8080`, 선택적 ytmusic 헤더 볼륨.

### 5.3 `render.yaml`

Render Blueprint: Docker, Singapore, free, health `/api/health`, 시크릿 env는 Dashboard 입력.

### 5.4 `railway.toml`

Dockerfile 빌드, health `/api/health`.

### 5.5 PowerShell

| 스크립트 | 동작 |
|----------|------|
| `run.ps1` | 안내만 출력 (서버 미기동) |
| `run-backend.ps1` | pip + uvicorn **8020** (기존 프로세스 정리) |
| `run-frontend.ps1` | npm install(필요시) + `npm run dev` **5173** |
| `build.ps1` | `npm run build` → `frontend/dist` |
| `run-prod.ps1` | build 후 `SERVE_STATIC=1`로 uvicorn **8080** |
| `setup-ytmusic.ps1` | `python scripts/setup_ytmusic.py` |

### 5.6 `.env.example`

Last.fm(권장), Spotify/SC/YT(선택), AudioDB, MusicBrainz UA, 상업곡 임계값, 배포 HOST/PORT/SERVE_STATIC 주석.

### 5.7 `.gitignore` / `.dockerignore`

venv, `node_modules`, `dist`, `.env`, `ytmusic*.json`, `search_aliases.db`, `.cursor` 등.

### 5.8 `README.md` / `PROJECT.txt` / `docs/`

- `README.md` — 소개·실행·API·문서 링크  
- `PROJECT.txt` — 짧은 로컬 메모 (포트 표기가 예전 8000일 수 있음 → 실제 스크립트는 **8020**)  
- `docs/HOW_IT_WORKS.md` — 원리·알고리즘  
- `docs/CODE_WALKTHROUGH.md` — **이 문서**

---

## 6. 환경 변수 표

| 변수 | 사용처 | 역할 |
|------|--------|------|
| `LASTFM_API_KEY` | lastfm, health | **거의 필수** |
| `COMMERCIAL_MIN_LISTENERS` / `PLAYCOUNT` | lastfm | 검색 상업곡 필터 |
| `AUDIODB_API_KEY` | audiodb | 기본 `2` |
| `MUSICBRAINZ_USER_AGENT` | music_api | MB 요청 UA |
| `SPOTIFY_CLIENT_ID` / `SECRET` | platform_search | Spotify |
| `SOUNDCLOUD_CLIENT_ID` | platform_search | SoundCloud |
| `YOUTUBE_API_KEY` | platform_search | Data API 폴백 |
| `YTMUSIC_HEADERS_FILE` / `YTMUSIC_HEADERS_JSON` | platform_search | YT Music 인증 |
| `SERVE_STATIC` | main | `frontend/dist` 서빙 |
| `HOST` / `PORT` | 배포 | uvicorn 바인딩 |
| `VITE_API_BASE` | 프론트 빌드 | API origin (보통 빈 값) |

---

## 읽는 순서 추천

1. `main.py` 라우트만  
2. `music_api.search_tracks` → `get_track_detail`  
3. `genre_map.build_genre_profile`  
4. `App.jsx`의 `handleSearch` / `loadDetail`  
5. `GenreMap.jsx` → `EveryNoiseMap.jsx`

이 다섯 파일이면 “검색 → 태그 → 맵 → 화면”이 연결됩니다.
