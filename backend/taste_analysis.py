"""자연어 취향 분석 — LLM(OpenAI 호환) + 규칙 기반 폴백."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

import llm_config
from country_filter import COUNTRIES, infer_country_from_query, normalize_country

logger = logging.getLogger(__name__)

_VALID_TEMPOS = frozenset({"slow", "mid", "fast"})
_VALID_COUNTRIES = frozenset(COUNTRIES.keys())

_RULE_HINTS: list[tuple[tuple[str, ...], str, str]] = [
    (("몽환", "몽환적", "dreamy", "ethereal", "슈게이즈", "shoegaze"), "mood", "dreamy"),
    (("감성", "감성적", "emotional", "sad", "슬픈", "우울", "melancholy"), "mood", "emotional"),
    (("차분", "잔잔", "평온", "calm", "chill", "relax", "편안", "잔잔한"), "mood", "calm"),
    (("밤", "야간", "night", "late night", "드라이브"), "mood", "calm"),
    (("혼자", "alone", "solitude"), "mood", "emotional"),
    (("신나", "활기", "energetic", "upbeat", "party", "터지", "고에너지"), "mood", "energetic"),
    (("몽글", "포근", "cozy", "warm"), "mood", "calm"),
    (("집중", "공부", "study", "focus"), "mood", "calm"),
    (("트랩", "trap", "drill"), "genre", "trap"),
    (("하이퍼팝", "hyperpop", "digicore"), "genre", "hyperpop"),
    (("로파이", "lofi", "lo-fi", "lo fi"), "genre", "lo-fi"),
    (("시티팝", "city pop", "citypop"), "genre", "city pop"),
    (("신스", "synthwave", "synth pop", "synthpop"), "genre", "synthpop"),
    (("인디", "indie"), "genre", "indie"),
    (("앰비언트", "ambient"), "genre", "ambient"),
    (("얼터너티브", "alternative"), "genre", "alternative rock"),
    (("재즈", "jazz", "jazz rap"), "genre", "jazz"),
    (("클래식", "classical"), "genre", "classical"),
    (("힙합", "hip hop", "hip-hop", "hiphop", "rap"), "genre", "hip hop"),
    (("r&b", "rnb", "알앤비"), "genre", "rnb"),
    (("록", "rock"), "genre", "rock"),
    (("팝", "pop"), "genre", "pop"),
    (("일렉", "electronic", "edm", "house", "techno"), "genre", "electronic"),
    (("메탈", "metal"), "genre", "metal"),
    (("펑크", "punk"), "genre", "punk"),
    (("포크", "folk", "acoustic"), "genre", "folk"),
    (("발라드", "ballad"), "genre", "ballad"),
    (("ost", "사운드트랙", "soundtrack"), "genre", "soundtrack"),
    (("슬로우", "느린", "slow"), "tempo", "slow"),
    (("빠른", "fast", "uptempo", "dance"), "tempo", "fast"),
    (("미드", "medium"), "tempo", "mid"),
]

_CHAT_INTENT_SYSTEM = """You analyze music curation chat for a Korean/English music app.

Input: a conversation (User / Assistant). Understand the LATEST user intent IN FULL CONTEXT.

Return ONLY JSON (no markdown):
{
  "mood": ["..."],
  "genre": ["..."],
  "tempo": "slow"|"mid"|"fast"|null,
  "country": "kr"|"jp"|"us"|"uk"|"fr"|"br"|"mx"|"latin"|null,
  "keywords": ["..."],
  "intent_summary": "..."
}

Rules:
- Korean and English both common. Parse Korean naturally (한국 트랩=korean trap, 잔잔한=calm, 신나는=energetic).
- Follow-ups inherit prior context: "더 신나게" keeps earlier genre/country and bumps energy.
- Regional modifiers → country + compound keywords: "한국 트랩" → kr + ["korean trap","korean hip hop"].
- Situation phrases: "비 오는 날"→rainy calm, "운동"→energetic fast, "이별"→emotional.
- keywords[0] = most specific phrase for the current ask."""

_TASTE_SYSTEM = _CHAT_INTENT_SYSTEM + "\n\n(Single message mode — no prior conversation.)"


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


_GENERIC_COUNTRY_TAGS = frozenset({
    "korean", "korea", "k-pop", "kpop", "k pop",
    "japanese", "japan", "j-pop", "jpop",
    "american", "british", "english", "latin",
})


def enrich_keywords_with_country(
    keywords: list[str],
    country_id: str | None,
    genres: list[str],
) -> list[str]:
    if not country_id:
        return keywords
    cfg = COUNTRIES.get(country_id)
    if not cfg:
        return keywords

    primary = cfg["genre_hints"][0] if cfg.get("genre_hints") else cfg["tags"][0]
    compounds = [f"{primary} {g}".strip() for g in genres[:3] if g]
    hints = list((cfg.get("genre_hints") or [])[:2])

    # LLM/사용자 키워드 우선 → 복합어 추가 → 범용 k-pop 등은 맨 뒤
    ordered: list[str] = list(keywords)
    for c in compounds:
        if c.lower() not in {x.lower() for x in ordered}:
            ordered.insert(0, c)
    for h in hints:
        if h.lower() not in {x.lower() for x in ordered}:
            ordered.append(h)

    out: list[str] = []
    seen: set[str] = set()
    for item in ordered:
        k = str(item).strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(k)
    return out[:12]


def pick_search_keywords(keywords: list[str]) -> list[str]:
    """Last.fm/Deezer 검색용 — 구체적 구문 우선, k-pop 같은 범용 태그는 후순위."""
    if not keywords:
        return []
    out: list[str] = []
    seen: set[str] = set()

    for k in keywords:
        ks = str(k).strip().lower()
        if ks and " " in ks and ks not in seen:
            seen.add(ks)
            out.append(ks)

    for k in keywords:
        ks = str(k).strip().lower()
        if ks and ks not in seen and ks not in _GENERIC_COUNTRY_TAGS:
            seen.add(ks)
            out.append(ks)

    if len(out) < 2:
        for k in keywords:
            ks = str(k).strip().lower()
            if ks and ks not in seen:
                seen.add(ks)
                out.append(ks)

    return out[:5]


def profile_to_keywords(profile: dict[str, Any]) -> list[str]:
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


def _format_conversation(messages: list[dict[str, str]]) -> str:
    lines: list[str] = []
    for m in messages[-14:]:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content}")
    return "\n".join(lines)


def _extract_raw_keywords(query: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9\-']{1,24}", query):
        t = token.lower()
        if t not in seen and len(t) > 2:
            seen.add(t)
            out.append(t)
    for chunk in re.findall(r"[가-힣]{2,8}", query):
        if chunk not in seen:
            seen.add(chunk)
            out.append(chunk)
    return out[:8]


def _parse_llm_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise
        data = json.loads(match.group())
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

    if not intent_summary:
        intent_summary = query[:120]

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
        elif t in {
            "indie", "ambient", "rock", "pop", "jazz", "classical", "electronic", "rnb", "folk",
            "soul", "trap", "drill", "hyperpop", "lo-fi", "lofi", "synthpop", "metal", "punk",
        }:
            if t not in genres:
                genres.append(t)

    country = infer_country_from_query(query)
    raw_kw = _extract_raw_keywords(query)

    if any(n in q for n in ("밤", "야간", "night", "혼자")) and not tempo:
        tempo = "slow"

    if not moods and not genres and raw_kw:
        return _normalize_profile(
            {"mood": moods, "genre": genres, "tempo": tempo, "country": country, "keywords": raw_kw},
            source="rules",
            query=query,
        )

    if not moods and not genres and not tempo:
        moods = ["calm"]

    return _normalize_profile(
        {"mood": moods, "genre": genres, "tempo": tempo, "country": country},
        source="rules",
        query=query,
    )


async def _call_intent_llm(
    client: httpx.AsyncClient,
    *,
    system: str,
    user_content: str,
) -> dict[str, Any]:
    if llm_config.is_rate_limited():
        raise RuntimeError("LLM rate limited")

    model = llm_config.chat_model()
    base_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.25,
    }

    last_err: Exception | None = None
    for extra in ({"response_format": {"type": "json_object"}}, {}):
        payload = {**base_payload, **extra}
        resp = await client.post(
            f"{llm_config.base_url()}/chat/completions",
            headers=llm_config.headers(),
            json=payload,
            timeout=50.0,
        )
        if resp.status_code >= 400:
            if resp.status_code == 429:
                llm_config.mark_rate_limited()
            last_err = httpx.HTTPStatusError("LLM error", request=resp.request, response=resp)
            continue
        body = resp.json()
        content = body["choices"][0]["message"].get("content") or ""
        return _parse_llm_json(content)

    if last_err:
        raise last_err
    raise RuntimeError("LLM intent call failed")


async def analyze_chat_intent(
    client: httpx.AsyncClient,
    messages: list[dict[str, str]],
) -> dict[str, Any]:
    """AI DJ — 대화 전체 맥락으로 최신 의도 분석."""
    user_texts = [m["content"] for m in messages if m.get("role") == "user" and m.get("content")]
    if not user_texts:
        raise ValueError("사용자 메시지가 필요합니다.")

    last_query = user_texts[-1].strip()
    convo = _format_conversation(messages)
    user_block = (
        f"Conversation:\n{convo}\n\n"
        "Analyze the LATEST User message for music curation. "
        "Use full conversation context for follow-ups."
    )

    if is_llm_configured():
        try:
            data = await _call_intent_llm(
                client,
                system=_CHAT_INTENT_SYSTEM,
                user_content=user_block,
            )
            profile = _normalize_profile(data, source="llm", query=last_query)
            if not profile.get("country"):
                profile["country"] = infer_country_from_query(last_query)
                profile["keywords"] = enrich_keywords_with_country(
                    profile.get("keywords") or [],
                    profile.get("country"),
                    profile.get("genre") or [],
                )
            return profile
        except Exception as exc:
            logger.warning("analyze_chat_intent LLM failed, using rules: %s", exc)

    # ponytail: rules는 마지막 User 발화만 — 이전 턴 키워드가 섞이면 같은 곡만 반복
    return analyze_taste_rules(last_query)


async def analyze_taste_llm(client: httpx.AsyncClient, query: str) -> dict[str, Any]:
    if not is_llm_configured():
        raise ValueError("LLM API key not configured")

    data = await _call_intent_llm(
        client,
        system=_TASTE_SYSTEM,
        user_content=query,
    )
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
    query = query.strip()
    if not query:
        raise ValueError("취향 설명을 입력해 주세요.")

    if is_llm_configured():
        try:
            return await analyze_taste_llm(client, query)
        except Exception as exc:
            logger.warning("analyze_taste_query LLM failed, using rules: %s", exc)

    return analyze_taste_rules(query)


if __name__ == "__main__":
    assert infer_country_from_query("한국 트랩 골라줘") == "kr"
    kr_kw = enrich_keywords_with_country(["trap", "korean hip hop"], "kr", ["trap"])
    assert kr_kw[0] == "korean trap"
    assert pick_search_keywords(kr_kw)[0] == "korean trap"
    assert "k-pop" not in pick_search_keywords(kr_kw)[:3]
    convo = _format_conversation([
        {"role": "user", "content": "한국 트랩 골라줘"},
        {"role": "assistant", "content": "골랐어요."},
        {"role": "user", "content": "더 신나게"},
    ])
    assert "더 신나게" in convo
    print("taste_analysis ok", kr_kw[:3])
