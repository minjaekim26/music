"""YouTube Music 브라우저 헤더 설정 (1회 실행)."""

from __future__ import annotations

from pathlib import Path

from ytmusicapi.setup import setup

OUT = Path(__file__).resolve().parent.parent / "data" / "ytmusic_headers.json"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("YouTube Music 검색을 위해 브라우저 인증 헤더가 필요합니다.")
    print()
    print("1. Chrome/Edge에서 https://music.youtube.com 접속 (Google 로그인)")
    print("2. F12 → Network → 페이지 새로고침")
    print("3. music.youtube.com 요청 하나 클릭 → Headers → Request Headers 전체 복사")
    print("4. 아래에 붙여넣고 Enter, Ctrl+Z, Enter")
    print()
    setup(OUT.as_posix())
    print()
    print(f"저장 완료: {OUT}")
    print("music/run-backend.ps1 을 다시 실행하세요.")


if __name__ == "__main__":
    main()
