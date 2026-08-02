"""자연어 취향 분석 — LLM(OpenAI 호환) + 규칙 기반 폴백."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

import llm_config

_VALID_TEMPOS = frozenset({"slow", "mid", "fast"})

# 한국어·영어 힌트 → mood / genre / tempo (LLM 미설정 시 폴백)
_RULE_HINTS: list[tuple[tuple[str, ...], str, str]] = [
    (("몽환", "몽환적", "dreamy", "ethereal"), "mood", "dreamy"),
    (("감성", "감성적", "emotional", "sad", "슬픈", "우울"), "mood", "emotional"),
    (("차분", "잔잔", "평온", "calm", "chill", "relax", "편안"), "mood", "calm"),
    (("밤", "야간", "night", "late night"), "mood", "calm"),
    (("혼자", "alone", "solitude"), "mood", "emotional"),
    (("신나", "활기", "energetic", "upbeat", "party"), "mood", "energetic"),
    (("몽글", "포근", "cozy", "warm"), "mood", "calm"),
    (("인디", "indie"), "genre", "indie"),
    (("앰비언트", "ambient"), "genre", "ambient"),
    (("얼터너티브", "alternative"), "genre", "alternative rock"),
    (("재즈", "jazz"), "genre", "jazz"),
    (("클래식", "classical"), "genre", "classical"),
    (("힙합", "hip hop", "hip-hop", "rap"), "genre", "hip hop"),
    (("r&b", "rnb", "알앤비"), "genre", "rnb"),
    (("록", "rock"), "genre", "rock"),
    (("팝", "pop"), "genre", "pop"),
    (("일렉", "electronic", "edm"), "genre", "electronic"),
    (("슬로우", "느린", "slow", "ballad", "발라드"), "tempo", "slow"),
    (("빠른", "fast", "uptempo", "dance"), "tempo", "fast"),
    (("미드", "medium"), "tempo", "mid"),
]

_SYSTEM_PROMPT = """You analyze music taste / mood requests for a music recommendation app.
Return ONLY a JSON object (no markdown) with exactly these keys:
- "mood": array of English lowercase mood words (e.g. calm, dreamy, emotional) — 2-4 items
- "genre": array of English lowercase genre tags for Last.fm (e.g. indie, ambient, rock) — 1-4 items
- "tempo": one of "slow", "mid", "fast", or null
- "keywords": array of 4-8 English search keywords combining mood, genre, and tempo hints for music APIs

Rules:
- Always use English for all values.
- keywords should be useful for Last.fm tag search (single words or short phrases like "dream pop").
- Infer tempo from context (night alone → slow, workout → fast).
"""


def is_llm_configured() -> bool:
    return llm_config.is_configured()


def _normalize_tempo(value: Any) -> str | None:
    if not value:
        return None
    t = str(value).strip().lower()
    return t if t in _VALID_TEMPOS else None


def _clean_str_list(values: Any, *, limit: int = 8) -> list[str]:
    if not values:
        return []
    if isinstance(values, str):
        values = [values]
    out: list[str] = []
    seen: set[str] = set()
    for item in values:
        text = str(item).strip().lower()
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
        if len(out) >= limit:
            break
    return out


def profile_to_keywords(profile: dict[str, Any]) -> list[str]:
    """mood + genre + tempo → Last.fm 검색용 키워드 (중복 제거)."""
    combined: list[str] = []
    for key in ("keywords", "mood", "genre"):
        combined.extend(profile.get(key) or [])
    tempo = profile.get("tempo")
    if tempo in _VALID_TEMPOS:
        combined.append(tempo)
    seen: set[str] = set()
    out: list[str] = []
    for kw in combined:
        k = str(kw).strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out[:12]


def _parse_llm_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError("LLM response is not a JSON object")
    return data


def _normalize_profile(data: dict[str, Any], *, source: str, query: str) -> dict[str, Any]:
    mood = _clean_str_list(data.get("mood"))
    genre = _clean_str_list(data.get("genre"))
    tempo = _normalize_tempo(data.get("tempo"))
    keywords = _clean_str_list(data.get("keywords"), limit=12)

    if not keywords:
        keywords = profile_to_keywords({"mood": mood, "genre": genre, "tempo": tempo})

    return {
        "mood": mood,
        "genre": genre,
        "tempo": tempo,
        "keywords": keywords,
        "source": source,
        "query": query,
    }


def analyze_taste_rules(query: str) -> dict[str, Any]:
    """OPENAI_API_KEY 없을 때 키워드 규칙 매칭."""
    q = query.lower()
    moods: list[str] = []
    genres: list[str] = []
    tempo: str | None = None

    for needles, kind, value in _RULE_HINTS:
        if any(n in q for n in needles):
            if kind == "mood" and value not in moods:
                moods.append(value)
            elif kind == "genre" and value not in genres:
                genres.append(value)
            elif kind == "tempo" and tempo is None:
                tempo = value

    # 영문 단어 직접 추출 (dreamy indie slow 등)
    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9\-']{1,20}", query):
        t = token.lower()
        if t in _VALID_TEMPOS and tempo is None:
            tempo = t
        elif t in {"dreamy", "calm", "emotional", "chill", "sad", "happy", "energetic", "melancholy"}:
            if t not in moods:
                moods.append(t)
        elif t in {"indie", "ambient", "rock", "pop", "jazz", "classical", "electronic", "rnb", "folk", "soul"}:
            if t not in genres:
                genres.append(t)

    # 맥락 추론: 밤·혼자 + 몽환/차분 → indie/ambient, slow
    night_alone = any(n in q for n in ("밤", "야간", "night", "late night", "혼자", "alone", "solitude"))
    dreamy_calm = any(m in moods for m in ("dreamy", "calm", "emotional"))
    if night_alone and dreamy_calm:
        if tempo is None:
            tempo = "slow"
        for g in ("indie", "ambient"):
            if g not in genres:
                genres.append(g)

    if not moods and not genres and not tempo:
        moods = ["calm"]

    return _normalize_profile(
        {"mood": moods, "genre": genres, "tempo": tempo},
        source="rules",
        query=query,
    )


async def analyze_taste_llm(client: httpx.AsyncClient, query: str) -> dict[str, Any]:
    if not is_llm_configured():
        raise ValueError("LLM API key not configured")

    model = llm_config.chat_model()
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": query},
        ],
        "temperature": 0.25,
        "response_format": {"type": "json_object"},
    }

    resp = await client.post(
        f"{llm_config.base_url()}/chat/completions",
        headers=llm_config.headers(),
        json=payload,
        timeout=45.0,
    )
    if resp.status_code >= 400:
        # 일부 OpenAI 호환 API는 json_object 미지원 → 한 번 더 시도
        payload.pop("response_format", None)
        resp = await client.post(
            f"{llm_config.base_url()}/chat/completions",
            headers=llm_config.headers(),
            json=payload,
            timeout=45.0,
        )
    resp.raise_for_status()
    body = resp.json()
    content = body["choices"][0]["message"]["content"]
    data = _parse_llm_json(content)
    return _normalize_profile(data, source="llm", query=query)


async def analyze_taste_query(client: httpx.AsyncClient, query: str) -> dict[str, Any]:
    """자연어 → {mood, genre, tempo, keywords, source, query}."""
    query = query.strip()
    if not query:
        raise ValueError("취향 설명을 입력해 주세요.")

    if is_llm_configured():
        try:
            return await analyze_taste_llm(client, query)
        except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError):
            pass

    return analyze_taste_rules(query)
