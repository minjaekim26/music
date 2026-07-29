# Music Explorer — 작동 원리 & 코드 가이드

이 문서는 **Music Explorer**가 어떻게 동작하는지, 주요 파일이 무엇을 하는지 처음부터 끝까지 설명합니다.

- 저장소: https://github.com/minjaekim26/music
- 라이브: https://music-ydqz.onrender.com
- 스택: **FastAPI (Python)** + **React + Vite + Tailwind**

---

## 1. 한 줄로 요약

사용자가 곡을 검색하면 → 여러 음악 API에서 결과를 모으고 → 태그를 Every Noise 장르 맵에 매핑해 위치를 계산하고 → 유사곡·장르 추천을 보여줍니다.

```
[브라우저 React]
      │  GET /api/search, /api/track, /api/recommend/...
      ▼
[FastAPI backend/main.py]
      │
      ├─ music_api.py        ← 검색·상세·추천 오케스트레이션
      ├─ genre_map.py        ← Every Noise 좌표·유사도
      ├─ lastfm_api.py       ← Last.fm
      ├─ platform_search.py  ← Spotify / SoundCloud / YT Music
      ├─ audiodb_api.py      ← TheAudioDB (배너·앨범아트)
      └─ data/everynoise_genres.json
```

---

## 2. 사용자 흐름 (End-to-End)

### 2.1 검색

1. 프론트 `App.jsx`가 `GET /api/search?q=...&limit=50` 호출
2. 백엔드 `search_tracks()`:
   - 한글 별칭·MusicBrainz로 검색어 확장
   - Last.fm / MusicBrainz / Deezer / Spotify / SoundCloud / YouTube Music을 **병렬** 조회
   - 제목+아티스트로 중복 병합
   - **관련도(relevance) ≤ 0% 제외**, 관련도 높은 순 정렬
3. 프론트는 결과 카드에 커버·리스너·관련도 % 표시

### 2.2 곡 분석 (상세)

1. 결과 클릭 → `GET /api/track?title=...&artist=...&mbid=...`
2. `get_track_detail()`이 메타데이터를 여러 소스에서 수집
3. 태그 목록 → `build_genre_profile()` → 맵 좌표·매칭 장르
4. Last.fm 유사곡(+ Deezer 폴백)에 장르 유사도 점수 부여
5. 프론트: 장르 막대, 확대된 하위 장르 맵, 추천 리스트

### 2.3 장르 / 키워드 추천

- 장르 칩 클릭 → `GET /api/recommend/genre?genre=...`
- 맵에서 여러 장르 선택 → `GET /api/recommend/genres?genres=...`
- 키워드 UI → `GET /api/recommend/keywords?keywords=...`

---

## 3. 디렉터리 구조

```
music/
├── backend/
│   ├── main.py                 # FastAPI 앱·라우트·정적 파일 서빙
│   ├── music_api.py            # 핵심 비즈니스 로직
│   ├── genre_map.py            # 장르 맵·프로필·유사도
│   ├── lastfm_api.py           # Last.fm 래퍼
│   ├── platform_search.py      # Spotify / SC / YT Music
│   ├── audiodb_api.py          # TheAudioDB UI 메타
│   ├── track_metadata.py       # 제목/아티스트 정규화
│   ├── search_aliases.py       # 한글↔영문 검색 별칭
│   ├── data/
│   │   └── everynoise_genres.json   # Every Noise 노드 좌표
│   └── scripts/
│       ├── build_everynoise_map.py  # 맵 데이터 생성
│       └── setup_ytmusic.py         # YT Music 헤더 설정
├── frontend/
│   └── src/
│       ├── App.jsx             # 화면·상태·API 호출
│       └── components/
│           ├── GenreMap.jsx / EveryNoiseMap.jsx
│           ├── GenreBars.jsx / GenreExplorer.jsx
│           ├── KeywordRecommend.jsx
│           ├── TrackRecommendList.jsx
│           └── HelpPanel.jsx / Pagination.jsx
├── docs/HOW_IT_WORKS.md        # 이 문서
├── Dockerfile / render.yaml    # Render 배포
└── README.md
```

---

## 4. 백엔드 — 파일별 설명

### 4.1 `backend/main.py` — API 입구

역할:

- `.env` 로드
- CORS 허용
- 엔드포인트 정의
- 배포 시 `frontend/dist` 정적 서빙 (`SERVE_STATIC=1`)

| 경로 | 함수 | 설명 |
|------|------|------|
| `GET /api/health` | `health` | 키/인증 상태 점검 |
| `GET /api/genre-map` | `genre_map` | 전체 장르 노드 |
| `GET /api/search` | `search` | 다중 소스 검색 |
| `GET /api/track` | `track_detail` | 곡 분석 |
| `GET /api/recommend/genre` | `genre_recommendations` | 단일 장르 추천 |
| `GET /api/recommend/genres` | `genres_recommendations` | 다중 장르 추천 |
| `GET /api/recommend/keywords` | `keyword_recommendations` | 키워드 추천 |

`track_detail`은 `mbid` / `deezer_id` / `soundcloud_id` / `title+artist` 중 하나 이상 필요합니다.

배포 모드에서는 React 빌드 결과(`frontend/dist`)를 같은 프로세스에서 제공합니다. 로컬 개발은 Vite(5173) + API(보통 8020)를 분리 실행합니다.

---

### 4.2 `backend/music_api.py` — 오케스트레이션 코어

이 파일이 앱의 **중앙 제어실**입니다.

#### 검색: `search_tracks` → `_gather_search_hits`

```text
쿼리 확장(별칭/한글) 
  → 플랫폼 병렬 검색 (_gather_search_hits)
  → title|artist 키로 병합 (_merge_search_hit)
  → relevance 계산 (_search_relevance)
  → 0% 이하 제거, 정렬 (_finalize_search_order)
  → Deezer 커버 등 보강 (_enrich_search_result)
```

**관련도 공식 (`_search_relevance`)**

- 텍스트 매칭 점수 (정확 일치 100 → 부분 일치 76 등)
- Last.fm 리스너 기반 인기도 `log10(listeners+1) * 28`
- 최종: `text * 0.72 + popularity * 0.28` (최대 100)

정렬 우선순위: **관련도 ↓ → commercial_score ↓ → listeners ↓ → mbid 유무**

#### 상세: `get_track_detail`

1. MusicBrainz recording (mbid가 있으면)
2. SoundCloud 장르 태그
3. 병렬: Last.fm track info, AudioDB track/artist, Deezer
4. MusicBrainz/Last.fm 아티스트 태그
5. `_collect_tags`로 가중 태그 리스트 구성
6. 태그 없으면 `_infer_genre_tags_fallback`
7. `build_genre_profile(tags, weights)` → 위치·매칭 장르
8. `collect_subgenre_focus_nodes` → 맵에 그릴 하위 장르 집합
9. Last.fm similar tracks + 장르 유사도 점수
10. AudioDB UI(배너, 무드 등) 조립 후 JSON 반환

응답의 `genre_map` 핵심 필드:

- `nodes` / `bounds` — 전체 맵
- `track_position` — 곡의 가중 평균 좌표
- `matched_genres` — 매칭된 장르 + similarity %
- `subgenre_nodes` — 분석 화면용 하위 장르 포커스 노드

#### 추천

- `recommend_by_genre` / `recommend_by_genres`: Last.fm tag top tracks 등을 가져와 장르 프로필과 비교
- `recommend_by_keywords`: 키워드가 태그로 얼마나 겹치는지로 점수화

---

### 4.3 `backend/genre_map.py` — Every Noise 장르 공간

데이터: `backend/data/everynoise_genres.json`  
(스크립트 `build_everynoise_map.py`로 everynoise.com 스타일 좌표 생성)

각 노드 예:

```json
{
  "id": "k-pop",
  "name": "k-pop",
  "x": 420.5,
  "y": 310.2,
  "color": "#a1ffxx",
  "fontSize": 140,
  "parentId": "pop"
}
```

#### 태그 → 장르 ID (`_match_genre_id`)

1. 소문자·공백 정규화
2. `EXTRA_ALIASES` (`r&b` → `rhythm and blues`, `kpop` → `k-pop` 등)
3. 부분 문자열 매칭

#### 하위 장르 유지 (`filter_leaf_genre_ids`)

같은 곡에 `pop`과 `k-pop`이 같이 있으면 **부모(`pop`)를 버리고 자식만** 남깁니다.  
검색·표시에서 “세부 장르”를 우선하기 위함입니다.

#### 프로필 (`build_genre_profile`)

1. 태그별 가중치로 장르 ID 점수 합산
2. leaf만 남김
3. 상위 12개 장르의 similarity % = `(score / max_score) * 100`
4. **곡 위치** = 점수 가중 평균 `(Σ x·w / Σ w, Σ y·w / Σ w)`

#### 두 곡 장르 유사도 (`genre_similarity_between`)

두 프로필의 장르 벡터에 대해 **코사인 유사도 × 100**.

#### 맵 거리 유사도 (`map_distance_similarity`)

```text
100 - (유클리드 거리 / 7)
```

#### 하위 장르 포커스 (`collect_subgenre_focus_nodes`)

- 매칭 장르 + 그 **자식**
- 자식이 없으면 **부모 + 형제**
- 곡 위치에서 가까운 순으로 child_limit(기본 100)개

---

### 4.4 `backend/lastfm_api.py`

Last.fm API 래퍼:

- 트랙 검색 / 트랙 정보 / 아티스트 top tags
- 유사곡 / 태그별 top tracks

`LASTFM_API_KEY`가 없으면 검색·유사곡 품질이 크게 떨어집니다.

---

### 4.5 `backend/platform_search.py`

| 플랫폼 | 인증 | 역할 |
|--------|------|------|
| Spotify | Client ID/Secret (Client Credentials) | 검색 + 아티스트 genres |
| SoundCloud | Client ID | 검색 + genre/tag_list |
| YouTube Music | `ytmusic_headers.json` 또는 `YTMUSIC_HEADERS_JSON` | 검색 |

YT Music 헤더는 Chrome에서 복사한 request header를 쓰며, `_sanitize_ytm_headers()`로 불필요 키를 제거해 400 오류를 방지합니다.

---

### 4.6 `backend/audiodb_api.py`

TheAudioDB에서 아티스트 배너, 앨범 썸네일, mood/style, biography를 가져와 UI용 `enrich_ui()`로 합칩니다.  
장르 분류의 주력이라기보다 **시각·설명 보강**입니다.

---

### 4.7 `backend/search_aliases.py` / `track_metadata.py`

- **search_aliases**: 한글 검색어 → 영문 별칭 DB/시드 확장
- **track_metadata**: feat./remix 표기 등 장르 조회용 제목·아티스트 정규화

---

## 5. 프론트엔드 — 파일별 설명

### 5.1 `frontend/src/App.jsx`

앱의 단일 페이지 컨트롤러.

상태 예:

- `results`, `selected`, `detail`
- `genreRecommendations`, `pickedGenres`
- `theme`, `backendOk`, `searchMeta`

주요 핸들러:

| 함수 | 동작 |
|------|------|
| `handleSearch` | `/api/search` → relevance > 0 필터·정렬 |
| `loadDetail` | `/api/track` → 상세·맵·유사곡 |
| `handleGenreSelect` | `/api/recommend/genre` |
| `togglePickedGenre` + 추천 요청 | `/api/recommend/genres` |

`TrackDetail` 서브컴포넌트: 커버, 미리듣기, GenreBars, GenreMap, TrackRecommendList.

---

### 5.2 `GenreMap.jsx` + `EveryNoiseMap.jsx`

**GenreMap**

- 백엔드 `subgenre_nodes`로 표시할 노드 선택
- `computeLocalBounds`로 해당 구역만 크롭 (`viewBounds`)
- `fitToView`로 한 화면에 맞게 스케일 (과확대 방지)
- 범례: ▲ 이 곡 / 매칭 장르 / 하위 장르

**EveryNoiseMap**

- 노드를 `(x,y)` → 픽셀로 변환해 absolute 배치
- `showAll`이면 전부 렌더, 아니면 뷰포트 컬링
- `focusMode`일 때 pill 라벨·강조 스타일
- `+/-` 줌, `fitToView` 자동 맞춤

좌표 변환 핵심:

```text
left = bounds.minLeft + (node.x / 1000) * bounds.width
top  = bounds.minTop  + (node.y / 1000) * bounds.height
```

`viewBounds`가 있으면 로컬 origin을 빼서 크롭된 캔버스에 그립니다.  
**좌표를 늘려 확대하지 않고**, 원본 간격을 유지한 채 화면 fit 합니다.

---

### 5.3 기타 컴포넌트

| 파일 | 역할 |
|------|------|
| `GenreBars.jsx` | 매칭 장르 similarity % 막대 |
| `GenreExplorer.jsx` | 전체/드릴다운 장르 탐색·다중 선택 |
| `KeywordRecommend.jsx` | 키워드 기반 추천 UI |
| `TrackRecommendList.jsx` | 유사곡 리스트 (similarity 표시) |
| `Pagination.jsx` | 검색/추천 페이지네이션 |
| `HelpPanel.jsx` | 사용법 도움말 |

`TrackRecommendList`는 `similarity ?? genre_similarity ?? 0` 순으로 %를 표시합니다.  
(`genre_similarity`가 0일 때 `??` 때문에 잘못 0으로만 보이던 버그를 이렇게 수정했습니다.)

---

## 6. 핵심 알고리즘 정리

### 6.1 검색 관련도

```
relevance = 0.72 * text_match + 0.28 * listener_popularity
```

### 6.2 곡의 장르 맵 위치

```
position = weighted_average( matched_genre_coordinates, tag_weights )
```

### 6.3 유사곡 점수 (개념)

상세의 similar track enrichment는 대략:

- Last.fm similar 기반 후보
- 장르 벡터 코사인 / 맵 거리 등을 합쳐 `similarity` 필드

### 6.4 장르 벡터 코사인

```
cos = (A·B) / (|A||B|)
percent = min(100, cos * 100)
```

---

## 7. 데이터·외부 API 의존성

| 소스 | 필수? | 용도 |
|------|-------|------|
| Last.fm | **거의 필수** | 검색·태그·유사곡·장르 top |
| MusicBrainz | 권장 | MBID·태그·한글 확장 |
| Deezer | 권장 | 미리듣기·커버·검색 |
| Spotify | 선택 | 검색·아티스트 장르 |
| SoundCloud | 선택 | 검색·SC 장르 태그 |
| YouTube Music | 선택 | 검색 보강 |
| TheAudioDB | 선택 | 배너·앨범 아트 |
| everynoise_genres.json | **필수 (로컬 파일)** | 맵 좌표 |

환경 변수는 `.env` / Render Dashboard에 설정합니다. `render.yaml`의 `sync: false` 항목은 대시보드에서 직접 넣습니다.

---

## 8. 로컬 실행 & 배포

### 로컬

```powershell
# 백엔드 (프로젝트 스크립트 사용 시 포트 8020)
.\run-backend.ps1

# 프론트 (5173, Vite 프록시로 API 연결)
.\run-frontend.ps1
```

### Render

- `Dockerfile`로 빌드
- `SERVE_STATIC=1` → FastAPI가 `frontend/dist` 서빙
- Health check: `/api/health`
- Blueprint: `render.yaml`

`git push origin main` → Render 자동 배포.

---

## 9. 코드 읽기 순서 (추천)

처음 코드를 따라갈 때:

1. `backend/main.py` — 라우트만
2. `music_api.search_tracks` / `get_track_detail`
3. `genre_map.build_genre_profile` / `collect_subgenre_focus_nodes`
4. `frontend/src/App.jsx` — `handleSearch`, `loadDetail`
5. `GenreMap.jsx` → `EveryNoiseMap.jsx`

이 순서면 “검색 → 태그 → 맵 → 화면” 파이프라인이 한 줄로 연결됩니다.

---

## 10. 자주 묻는 설계 포인트

**Q. 왜 MP3를 올리지 않나요?**  
이 앱은 **메타데이터·태그 기반** 탐색기입니다. (별도 프로젝트 `project-practice`가 librosa/MP3 특징 추천을 담당합니다.)

**Q. SoundCloud 곡 하위 장르가 거친가요?**  
SC가 주는 `genre`/`tag_list`가 넓은 경우가 많고, 신인 아티스트는 Last.fm/MB 매칭이 약해 세부 장르가 부족할 수 있습니다.

**Q. 장르 맵이 너무 확대/축소되면?**  
`GenreMap`은 `viewBounds` + `fitToView`로 **원본 간격 유지 + 화면 맞춤**을 합니다. `+/-`로 수동 줌도 가능합니다.

---

## 11. 변경 이력에 가까운 최근 개선 (요약)

- 검색: 관련도 0% 숨김, 관련도 내림차순
- 장르: leaf/하위 장르 우선 분류
- 분석 맵: `subgenre_nodes` + fit-to-view로 가독성 개선
- 추천 %: `similarity ?? genre_similarity` 표시 수정
- 배포: Render Docker + 정적 프론트 통합

---

문서 위치: `docs/HOW_IT_WORKS.md`  
질문·수정은 이슈나 PR로 환영합니다.
