"""한국어·오타 검색어 → 영문 검색어 확장 (SQLite 별칭 DB)."""

from __future__ import annotations

import difflib
import json
import re
import sqlite3
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent / "data"
DB_PATH = DATA_DIR / "search_aliases.db"
SEED_PATH = DATA_DIR / "search_aliases_seed.json"

HANGUL_RE = re.compile(r"[가-힣]")
FUZZY_MIN_RATIO = 0.72

_ALIAS_CACHE: list[tuple[str, str, str]] | None = None


def has_hangul(text: str) -> bool:
    return bool(HANGUL_RE.search(text))


def _normalize_alias(text: str) -> str:
    return re.sub(r"\s+", "", (text or "").strip().lower())


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_search_aliases_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS search_aliases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                alias TEXT NOT NULL COLLATE NOCASE,
                canonical TEXT NOT NULL,
                kind TEXT NOT NULL DEFAULT 'artist'
            )
            """
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_search_aliases_alias ON search_aliases(alias)"
        )
        count = conn.execute("SELECT COUNT(*) AS c FROM search_aliases").fetchone()["c"]
        if count == 0 and SEED_PATH.is_file():
            seed = json.loads(SEED_PATH.read_text(encoding="utf-8"))
            for row in seed:
                canonical = (row.get("canonical") or "").strip()
                kind = (row.get("kind") or "artist").strip()
                if not canonical:
                    continue
                for alias in row.get("aliases") or []:
                    alias = (alias or "").strip()
                    if alias:
                        conn.execute(
                            "INSERT OR IGNORE INTO search_aliases(alias, canonical, kind) VALUES (?, ?, ?)",
                            (alias, canonical, kind),
                        )
        conn.commit()
    global _ALIAS_CACHE
    _ALIAS_CACHE = None


def _load_aliases() -> list[tuple[str, str, str]]:
    global _ALIAS_CACHE
    if _ALIAS_CACHE is not None:
        return _ALIAS_CACHE

    init_search_aliases_db()
    with _connect() as conn:
        rows = conn.execute("SELECT alias, canonical, kind FROM search_aliases").fetchall()
    _ALIAS_CACHE = [(r["alias"], r["canonical"], r["kind"]) for r in rows]
    return _ALIAS_CACHE


def lookup_alias(text: str) -> str | None:
    needle = (text or "").strip()
    if not needle:
        return None

    norm_needle = _normalize_alias(needle)
    for alias, canonical, _kind in _load_aliases():
        if _normalize_alias(alias) == norm_needle:
            return canonical

    best_canonical: str | None = None
    best_ratio = 0.0
    for alias, canonical, _kind in _load_aliases():
        if not has_hangul(alias):
            continue
        ratio = difflib.SequenceMatcher(None, norm_needle, _normalize_alias(alias)).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_canonical = canonical

    if best_canonical and best_ratio >= FUZZY_MIN_RATIO:
        return best_canonical
    return None


def _replace_hangul_segments(query: str) -> tuple[str, list[dict[str, str]]]:
    """Replace known Korean tokens with English canonical terms."""
    matches: list[dict[str, str]] = []
    parts = re.split(r"(\s+)", query.strip())
    out: list[str] = []

    for part in parts:
        if not part or part.isspace():
            out.append(part)
            continue
        if not has_hangul(part):
            out.append(part)
            continue
        canonical = lookup_alias(part)
        if canonical:
            matches.append({"from": part, "to": canonical})
            out.append(canonical)
        else:
            out.append(part)

    return "".join(out).strip(), matches


def expand_search_queries(query: str) -> dict[str, Any]:
    """
    Expand a user query into one or more API search strings.

    Examples:
      드레이크 -> drake
      드레잌 -> drake (fuzzy)
      드레이크 god's plan -> drake god's plan
    """
    original = query.strip()
    if not original:
        return {"original": "", "queries": [], "matches": []}

    queries: list[str] = [original]
    matches: list[dict[str, str]] = []

    if not has_hangul(original):
        return {"original": original, "queries": queries, "matches": matches}

    whole = lookup_alias(original)
    if whole:
        matches.append({"from": original, "to": whole})
        queries.append(whole)

    replaced, token_matches = _replace_hangul_segments(original)
    matches.extend(token_matches)
    if replaced and replaced != original:
        queries.append(replaced)

    # Longest alias substring match (e.g. "아이유 좋은날")
    norm_query = _normalize_alias(original)
    best: tuple[str, str] | None = None
    for alias, canonical, _kind in _load_aliases():
        norm_alias = _normalize_alias(alias)
        if len(norm_alias) < 2 or norm_alias not in norm_query:
            continue
        if best is None or len(norm_alias) > len(_normalize_alias(best[0])):
            best = (alias, canonical)

    if best:
        alias, canonical = best
        idx = original.lower().find(alias.lower())
        if idx >= 0:
            expanded = f"{original[:idx]}{canonical}{original[idx + len(alias):]}".strip()
            expanded = re.sub(r"\s+", " ", expanded)
            if expanded and expanded != original:
                matches.append({"from": alias, "to": canonical})
                queries.append(expanded)

    unique: list[str] = []
    seen: set[str] = set()
    for q in queries:
        key = q.casefold()
        if key not in seen:
            seen.add(key)
            unique.append(q)

    # Prefer English-expanded queries first for external APIs
    unique.sort(key=lambda q: (has_hangul(q), q))

    unique_matches: list[dict[str, str]] = []
    seen_match: set[tuple[str, str]] = set()
    for match in matches:
        key = (match.get("from", ""), match.get("to", ""))
        if key in seen_match:
            continue
        seen_match.add(key)
        unique_matches.append(match)

    return {"original": original, "queries": unique, "matches": unique_matches}


def pick_canonical_search_query(original: str, terms: list[str]) -> str:
    """한/영 혼합 검색어에서 API·정확도용 영문(원명) 쿼리 선택."""
    original = (original or "").strip()
    if not terms:
        return original
    english = [t.strip() for t in terms if t.strip() and not has_hangul(t)]
    if not english:
        return original
    return max(english, key=lambda t: (len([p for p in t.split() if len(p) > 1]), len(t)))


def add_search_alias(alias: str, canonical: str, kind: str = "artist") -> bool:
    alias = alias.strip()
    canonical = canonical.strip()
    if not alias or not canonical:
        return False
    init_search_aliases_db()
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO search_aliases(alias, canonical, kind) VALUES (?, ?, ?)",
            (alias, canonical, kind),
        )
        conn.commit()
    global _ALIAS_CACHE
    _ALIAS_CACHE = None
    return True
