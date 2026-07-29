# Music Explorer

궁금한 음악을 검색하면 **Every Noise 스타일 장르 맵**, **장르 유사도**, **유사곡·장르 추천**을 제공하는 웹 앱입니다.

- 저장소: https://github.com/minjaekim26/music
- 라이브: https://music-ydqz.onrender.com
- 기술: FastAPI + React + Vite + Tailwind CSS
- 데이터: [Last.fm](https://www.last.fm/api) · [MusicBrainz](https://musicbrainz.org/) · [TheAudioDB](https://www.theaudiodb.com/) · Deezer · (선택) Spotify / SoundCloud / YouTube Music

## 작동 원리 & 코드 설명

| 문서 | 내용 |
|------|------|
| **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)** | End-to-End 흐름, 알고리즘(관련도·장르 맵·코사인), 배포 |
| **[docs/CODE_WALKTHROUGH.md](docs/CODE_WALKTHROUGH.md)** | **디렉터리 파일 하나하나** 역할·함수·설정 설명 |

추천 읽기 순서: `HOW_IT_WORKS` → `CODE_WALKTHROUGH`.

## 기능

- **다중 소스 검색**: Last.fm / MusicBrainz / Deezer / Spotify / SoundCloud / YT Music
- **관련도 정렬**: 텍스트 매칭 + 인기도, 0% 결과 제외
- **Every Noise 장르 맵**: 곡 위치 + 하위 장르 포커스 뷰
- **장르 유사도**: 분류된 장르별 % 막대 그래프
- **유사곡·장르·키워드 추천**
- **TheAudioDB UI**: 아티스트 배너, 앨범 아트, 무드/스타일

## API 키 설정 (필수)

프로젝트 루트에 `.env` 파일을 만듭니다:

```powershell
copy .env.example .env
```

`.env` 예시:

```env
LASTFM_API_KEY=여기에_발급받은_키
AUDIODB_API_KEY=2
# 선택
# SPOTIFY_CLIENT_ID=
# SPOTIFY_CLIENT_SECRET=
# SOUNDCLOUD_CLIENT_ID=
# YOUTUBE_API_KEY=
# YTMUSIC_HEADERS_JSON=
```

Last.fm API 키 발급: https://www.last.fm/api/account/create

## 실행 방법

### 스크립트 (권장)

```powershell
.\run-backend.ps1    # API (보통 8020)
.\run-frontend.ps1   # Vite (5173)
```

브라우저: http://127.0.0.1:5173

### 수동

```powershell
# 백엔드
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8020

# 프론트
cd frontend
npm install
npm run dev
```

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/health` | 헬스·키 설정 상태 |
| `GET /api/search?q=...` | 다중 소스 검색 |
| `GET /api/track?...` | 상세 + 장르 맵 + 유사곡 |
| `GET /api/genre-map` | Every Noise 장르 노드 |
| `GET /api/recommend/genre` | 단일 장르 추천 |
| `GET /api/recommend/genres` | 다중 장르 추천 |
| `GET /api/recommend/keywords` | 키워드 추천 |

## 예시 검색어

- `Bohemian Rhapsody Queen`
- `Ditto NewJeans`
- `Blinding Lights The Weeknd`

## 배포 (Render)

`render.yaml` Blueprint + Docker. `main` 푸시 시 자동 배포.

필수 환경 변수: `LASTFM_API_KEY`  
선택: Spotify / SoundCloud / YouTube / `YTMUSIC_HEADERS_JSON`
