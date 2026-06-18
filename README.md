# Music Explorer

궁금한 음악을 검색하면 **곡 정보**, **구체적인 장르**, **비슷한 음악 추천**을 제공하는 웹 앱입니다.

- 저장소: https://github.com/minjaekim26/music
- 기술: FastAPI + React + Vite + Tailwind CSS
- 데이터: [MusicBrainz](https://musicbrainz.org/) (메타데이터·장르) + [Deezer](https://developers.deezer.com/) (미리듣기·유사곡)

## 기능

- 곡명 / 아티스트 검색
- 앨범, 발매일, 재생 시간 등 상세 정보
- MusicBrainz 기반 장르·태그 분석 및 설명
- 비슷한 아티스트·같은 앨범·장르 기반 유사곡 추천
- 30초 미리듣기 (Deezer 제공)

## 사전 준비

| 항목 | 권장 |
|------|------|
| Python | 3.10+ |
| Node.js | 18+ |

## 실행 방법

### 1. 백엔드

```powershell
cd C:\Users\selen\Projects\music\backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

또는 프로젝트 루트에서:

```powershell
.\run-backend.ps1
```

API 문서: http://127.0.0.1:8000/docs

### 2. 프론트엔드

```powershell
cd C:\Users\selen\Projects\music\frontend
npm install
npm run dev
```

또는:

```powershell
.\run-frontend.ps1
```

브라우저: http://127.0.0.1:5173

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/search?q=...` | 음악 검색 |
| `GET /api/track?mbid=...&deezer_id=...` | 상세 정보 + 장르 + 유사곡 |

## 예시 검색어

- `Bohemian Rhapsody Queen`
- `Ditto NewJeans`
- `Blinding Lights The Weeknd`
