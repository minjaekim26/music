# Music Explorer

궁금한 음악을 검색하면 **Every Noise 스타일 장르 맵**, **장르 유사도**, **상업곡 추천**을 제공하는 웹 앱입니다.

- 저장소: https://github.com/minjaekim26/music
- 기술: FastAPI + React + Vite + Tailwind CSS
- 데이터: [Last.fm](https://www.last.fm/api) · [MusicBrainz](https://musicbrainz.org/) · [TheAudioDB](https://www.theaudiodb.com/) · Deezer(미리듣기)

## 기능

- **상업곡 중심 검색**: Last.fm 리스너/재생 수 기준으로 인기 곡 우선
- **Every Noise 장르 맵**: 2D 장르 공간에 곡 위치 시각화
- **장르 유사도**: 분류된 장르별 % 막대 그래프
- **유사곡 추천**: Last.fm 유사곡 + 장르 맵 거리/태그 유사도 종합 점수
- **TheAudioDB UI**: 아티스트 배너, 앨범 아트, 무드/스타일, 설명

## API 키 설정 (필수)

프로젝트 루트에 `.env` 파일을 만듭니다:

```powershell
copy .env.example .env
```

`.env` 내용:

```env
LASTFM_API_KEY=여기에_발급받은_키
AUDIODB_API_KEY=2
```

Last.fm API 키 발급: https://www.last.fm/api/account/create

## 실행 방법

### 백엔드

```powershell
cd C:\Users\selen\Projects\music\backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### 프론트엔드

```powershell
cd C:\Users\selen\Projects\music\frontend
npm install
npm run dev
```

브라우저: http://127.0.0.1:5173

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/search?q=...` | 상업곡 검색 |
| `GET /api/track?...` | 상세 + 장르 맵 + 유사곡 |
| `GET /api/genre-map` | Every Noise 스타일 장르 노드 |

## 예시 검색어

- `Bohemian Rhapsody Queen`
- `Ditto NewJeans`
- `Blinding Lights The Weeknd`
