"""자연어 취향 분석 — LLM(OpenAI 호환) + 규칙 기반 폴백."""

from __future__ import annotations

import json
import re
from typing import Any

import httpx

import llm_config
from country_filter import COUNTRIES, infer_country_from_query, normalize_country

_VALID_TEMPOS = frozenset({"slow", "mid", "fast"})
_VALID_COUNTRIES = frozenset(COUNTRIES.keys())

# 한국어·영어 힌트 → mood / genre / tempo (LLM 미설정 시 폴백)
_RULE_HINTS: list[tuple[tuple[str, ...], str, str]] = [
    (("몽환", "몽환적", "dreamy", "ethereal"), "mood", "dreamy"),
    (("감성", "감성적", "emotional", "sad", "슬픈", "우울"), "mood", "emotional"),
    (("차분", "잔잔", "평온", "calm", "chill", "relax", "편안"), "mood", "calm"),
    (("밤", "야간", "night", "late night"), "mood", "calm"),
    (("혼자", "alone", "solitude"), "mood", "emotional"),
    (("신나", "활기", "energetic", "upbeat", "party"), "mood", "energetic"),
    (("몽글", "포근", "cozy", "warm"), "mood", "calm"),
    (("트랩", "trap", "drill"), "genre", "trap"),
    (("인디", "indie"), "genre", "indie"),
    (("앰비언트", "ambient"), "genre", "ambient"),
    (("얼터너티브", "alternative"), "genre", "alternative rock"),
    (("재즈", "jazz"), "genre", "jazz"),
    (("클래식", "classical"), "genre", "classical"),
    (("힙합", "hip hop", "hip-hop", "hiphop", "rap"), "genre", "hip hop"),
    (("r&b", "rnb", "알앤비"), "genre", "rnb"),
    (("록", "rock"), "genre", "rock"),
    (("팝", "pop"), "genre", "pop"),
    (("일렉", "electronic", "edm"), "genre", "electronic"),
    (("슬로우", "느린", "slow", "ballad", "발라드"), "tempo", "slow"),
    (("빠른", "fast", "uptempo", "dance"), "tempo", "fast"),
    (("미드", "medium"), "tempo", "mid"),
]

_SYSTEM_PROMPT = """You analyze music taste / curation requests for a recommendation app (Last.fm tags + country filters).

Return ONLY a JSON object (no markdown) with exactly these keys:
- "mood": array of English lowercase mood words — 0-4 items
- "genre": array of English lowercase genre tags — 1-4 items
- "tempo": one of "slow", "mid", "fast", or null
- "country": one of "kr", "jp", "us", "uk", "fr", "br", "mx", "latin", or null
- "keywords": array of 5-10 English search phrases for music APIs (most specific first)
- "intent_summary": one short English line summarizing the user's ask

Critical rules:
- ALWAYS preserve regional/national modifiers in BOTH country AND keywords.
  Example: "Korean trap" / "한국 트랩" → country: "kr", keywords MUST start with "korean trap", "korean hip hop" — NOT just "trap".
  Example: generic "trap" with no region → country: null, keywords: ["trap", ...].
- Use compound phrases for region+genre: "uk drill", "french house", "japanese city pop", "latin trap".
- keywords[0] must be the most specific phrase matching the user's exact request.
- kr = Korea/K-pop/K-hip-hop/K-indie, jp = Japan/J-pop, uk = UK/grime, etc.
- Infer tempo/mood from context (study → calm, workout → energetic/fast).
- All field values in English except you may echo the user's core ask in intent_summary.
"""


def is_llm_configured() -> bool:
    return llm_config.is_configured()


def _normalize_tempo(value: Any) -> str | None:
    if not value:
        return None
    t = str(value).strip().lower()
    return t if t in _VALID_TEMPOS else None


def _normalize_country(value: Any) -> str | None:
    if not value:
        return None
    cid = normalize_country(str(value).strip())
    return cid if cid in _VALID_COUNTRIES else None


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


def enrich_keywords_with_country(
    keywords: list[str],
    country_id: str | None,
    genres: list[str],
) -> list[str]:
    """지역+장르 복합 키워드를 앞에 붙임 (korean trap ≠ trap)."""
    if not country_id:
        return keywords
    cfg = COUNTRIES.get(country_id)
    if not cfg:
        return keywords

    primary = cfg["genre_hints"][0] if cfg.get("genre_hints") else cfg["tags"][0]
    compounds = [f"{primary} {g}".strip() for g in genres[:3]]
    hints = list((cfg.get("genre_hints") or [])[:2])

    out: list[str] = []
    seen: set[str] = set()
    for item in compounds + hints + keywords:
        k = str(item).strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out[:12]


def profile_to_keywords(profile: dict[str, Any]) -> list[str]:
    """mood + genre + tempo + country → Last.fm 검색용 키워드."""
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

    out = enrich_keywords_with_country(out, profile.get("country"), profile.get("genre") or [])
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
    country = _normalize_country(data.get("country")) or infer_country_from_query(query)
    keywords = _clean_str_list(data.get("keywords"), limit=12)
    intent_summary = str(data.get("intent_summary") or "").strip()

    if not keywords:
        keywords = profile_to_keywords({"mood": mood, "genre": genre, "tempo": tempo, "country": country})
    else:
        keywords = enrich_keywords_with_country(keywords, country, genre)

    return {
        "mood": mood,
        "genre": genre,
        "tempo": tempo,
        "country": country,
        "keywords": keywords,
        "intent_summary": intent_summary,
        "source": source,
        "query": query,
    }


def analyze_taste_rules(query: str) -> dict[str, Any]:
    """LLM 미설정 시 키워드 규칙 매칭."""
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

    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9\-']{1,20}", query):
        t = token.lower()
        if t in _VALID_TEMPOS and tempo is None:
            tempo = t
        elif t in {"dreamy", "calm", "emotional", "chill", "sad", "happy", "energetic", "melancholy"}:
            if t not in moods:
                moods.append(t)
        elif t in {"indie", "ambient", "rock", "pop", "jazz", "classical", "electronic", "rnb", "folk", "soul", "trap", "drill"}:
            if t not in genres:
                genres.append(t)

    country = infer_country_from_query(query)

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
        {"mood": moods, "genre": genres, "tempo": tempo, "country": country},
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
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }

    resp = await client.post(
        f"{llm_config.base_url()}/chat/completions",
        headers=llm_config.headers(),
        json=payload,
        timeout=45.0,
    )
    if resp.status_code >= 400:
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
    profile = _normalize_profile(data, source="llm", query=query)
    if not profile.get("country"):
        profile["country"] = infer_country_from_query(query)
        profile["keywords"] = enrich_keywords_with_country(
            profile.get("keywords") or [],
            profile.get("country"),
            profile.get("genre") or [],
        )
    return profile


async def analyze_taste_query(client: httpx.AsyncClient, query: str) -> dict[str, Any]:
    """자연어 → {mood, genre, tempo, country, keywords, source, query}."""
    query = query.strip()
    if not query:
        raise ValueError("취향 설명을 입력해 주세요.")

    if is_llm_configured():
        try:
            return await analyze_taste_llm(client, query)
        except (httpx.HTTPError, json.JSONDecodeError, KeyError, ValueError):
            pass

    return analyze_taste_rules(query)


if __name__ == "__main__":
    assert infer_country_from_query("한국 트랩 골라줘") == "kr"
    assert infer_country_from_query("trap playlist") is None
    kr_kw = enrich_keywords_with_country(["trap"], "kr", ["trap"])
    assert kr_kw[0].startswith("korean")
    print("taste_analysis ok", kr_kw[:3])
