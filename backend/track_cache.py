"""트랙 임베딩 SQLite 캐시.

테이블: track_embeddings
  key          TEXT PRIMARY KEY  -- "{title_lower}|{artist_lower}"
  embedding    BLOB              -- JSON float array
  metadata     TEXT              -- JSON (title, artist, genre_tags, ...)
  created_at   INTEGER           -- Unix timestamp
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

_DB_PATH = Path(__file__).resolve().parent / "data" / "track_cache.db"
_EMBEDDING_TTL = 60 * 60 * 24 * 30  # 30일


def _connect() -> sqlite3.Connection:
    _DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS track_embeddings (
                key        TEXT PRIMARY KEY,
                embedding  TEXT NOT NULL,
                metadata   TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_created ON track_embeddings(created_at)")
        conn.commit()


def make_key(title: str, artist: str) -> str:
    return f"{title.strip().lower()}|{artist.strip().lower()}"


def get_embedding_cache(key: str) -> list[float] | None:
    try:
        with _connect() as conn:
            row = conn.execute(
                "SELECT embedding, created_at FROM track_embeddings WHERE key = ?", (key,)
            ).fetchone()
        if row is None:
            return None
        age = time.time() - row["created_at"]
        if age > _EMBEDDING_TTL:
            return None
        return json.loads(row["embedding"])
    except Exception:
        return None


def save_embedding_cache(
    key: str,
    embedding: list[float],
    metadata: dict | None = None,
) -> None:
    try:
        with _connect() as conn:
            conn.execute(
                """
                INSERT INTO track_embeddings (key, embedding, metadata, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    embedding  = excluded.embedding,
                    metadata   = excluded.metadata,
                    created_at = excluded.created_at
                """,
                (
                    key,
                    json.dumps(embedding),
                    json.dumps(metadata or {}),
                    int(time.time()),
                ),
            )
            conn.commit()
    except Exception:
        pass


def purge_expired() -> int:
    """만료된 캐시 항목 삭제. 삭제된 행 수 반환."""
    cutoff = int(time.time()) - _EMBEDDING_TTL
    try:
        with _connect() as conn:
            cur = conn.execute(
                "DELETE FROM track_embeddings WHERE created_at < ?", (cutoff,)
            )
            conn.commit()
            return cur.rowcount
    except Exception:
        return 0
