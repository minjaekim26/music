# Music Explorer (distribution)

궁금한 음악을 검색하면 **Every Noise 스타일 장르 맵**, **장르 유사도**, **유사곡·장르 추천**을 제공하는 웹 앱입니다.  
**AI DJ** 챗봇으로 상황·기분·키워드를 말하면 곡을 큐레이션하고, 장르 맵 질문도 답합니다.

- 저장소: https://github.com/minjaekim26/music
- 라이브: https://music-ydqz.onrender.com
- 기술: FastAPI + React + Vite + Tailwind + Gemini (AI DJ)
- 데이터: [Last.fm](https://www.last.fm/api) · [MusicBrainz](https://musicbrainz.org/) · [TheAudioDB](https://www.theaudiodb.com/) · Deezer · (선택) Spotify / SoundCloud / YouTube Music

## 작동 원리 & 코드 설명

| 문서 | 내용 |
|------|------|
| **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)** | End-to-End 흐름, AI DJ, 알고리즘, 배포, 변경 이력 |
| **[docs/CODE_WALKTHROUGH.md](docs/CODE_WALKTHROUGH.md)** | **디렉터리 파일 하나하나** 역할·함수·설정 |
| **[docs/USER_REQUEST_ANALYSIS.txt](docs/USER_REQUEST_ANALYSIS.txt)** | 사용자 요청별 대응 기록 |

추천 읽기 순서: `HOW_IT_WORKS` → `CODE_WALKTHROUGH`.

> 코드를 수정할 때 위 문서도 함께 갱신합니다 (마지막 갱신: 2026-08-04).

## 기능

- **다중 소스 검색**: Last.fm / MusicBrainz / Deezer / Spotify / SoundCloud / YT Music
- **관련도·오피셜 우선**: 텍스트 매칭 + 인기도, fan upload 감점
- **Every Noise 장르 맵**: 곡 위치 + 하위 장르 포커스 뷰
- **장르 유사도**: 분류된 장르별 % 막대 그래프
- **유사곡·장르·키워드·자연어 취향 추천**
- **국가 필터**: kr/jp/us/… — 맵은 유지, 결과만 필터
- **AI DJ**: 대화형 곡 큐레이션, 장르 Q&A, quick shortcut 칩
- **AI 추천 설명**: Gemini 생성 이유 + 유사도 툴팁
- **TheAudioDB UI**: 아티스트 배너, 앨범 아트, 무드/스타일

## API 키 설정

프로젝트 루트에 `.env` 파일:

```powershell
copy .env.example .env
```

```env
LASTFM_API_KEY=여기에_발급받은_키
AUDIODB_API_KEY=2

# AI DJ (Google AI Studio 키 → OPENAI_API_KEY에 넣음)
OPENAI_API_KEY=AIza...
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
OPENAI_MODEL=gemini-2.5-flash-lite
OPENAI_COUNSEL_MODEL=gemini-2.5-flash

# 선택
# SPOTIFY_CLIENT_ID= ...
# YTMUSIC_HEADERS_JSON= ...
```

Last.fm: https://www.last.fm/api/account/create  
Gemini: https://aistudio.google.com/apikey

## 실행

```powershell
.\run-backend.ps1    # API 8020
.\run-frontend.ps1   # Vite 5173
```

브라우저: http://127.0.0.1:5173 — AI DJ는 플로팅 버튼 또는 `/chat`

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/health` | 헬스·키·LLM 상태 |
| `GET /api/search?q=...` | 다중 소스 검색 |
| `GET /api/track?...` | 상세 + 장르 맵 + 유사곡 |
| `GET /api/genre-map` | Every Noise 장르 노드 |
| `GET /api/countries` | 국가 필터 목록 |
| `GET /api/recommend/genre` | 단일 장르 추천 |
| `GET /api/recommend/genres` | 다중 장르 추천 (AND) |
| `GET /api/recommend/keywords` | 키워드 추천 |
| `GET /api/recommend/taste?query=...` | 자연어 취향 + AI 이유 |
| `POST /api/chat` | **AI DJ** — `{messages, exclude_tracks?}` |
| `POST /api/taste/analyze` | 취향 JSON 분석만 |
| `POST /api/analyze` | MP3 등 librosa 분석 |

## 배포 (Render)

`render.yaml` + Docker. `main` 푸시 시 자동 배포.

필수: `LASTFM_API_KEY`, `OPENAI_API_KEY` (Gemini)  
선택: Spotify / SoundCloud / YouTube / `YTMUSIC_HEADERS_JSON`
