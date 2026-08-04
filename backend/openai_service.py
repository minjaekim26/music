"""LLM chat + OpenAI embeddings. Key 없거나 실패해도 서버는 계속 동작."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

import llm_config

logger = logging.getLogger(__name__)

_EMBED_MODEL = "text-embedding-3-small"
_MAX_REASON_TRACKS = 5
_OPENAI_EMBED_BASE = "https://api.openai.com/v1"


def _api_key() -> str:
    return llm_config.api_key()


def is_configured() -> bool:
    return llm_config.is_configured()


def _base_url() -> str:
    return llm_config.base_url()


def _headers() -> dict[str, str]:
    return llm_config.headers()


def _chat_model() -> str:
    return llm_config.chat_model()


def _openai_error_detail(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error") or {}
        msg = str(err.get("message") or "")
        code = str(err.get("code") or err.get("type") or "")
    except Exception:
        msg, code = resp.text[:200], ""
    low = msg.lower()
    provider = llm_config.provider_label()
    if resp.status_code == 429 or "quota" in code or "quota" in low or "insufficient_quota" in code:
        llm_config.mark_rate_limited()
        if provider == "gemini":
            return "Gemini 무료 한도에 도달했어요. 내일 다시 시도하거나 Google AI Studio에서 한도를 확인해 주세요."
        if provider == "groq":
            return "Groq 무료 한도에 도달했어요. 잠시 후 다시 시도해 주세요."
        return "AI API 사용 한도가 초과됐어요. 잠시 후 다시 시도하거나 플랜·결제를 확인해 주세요."
    if resp.status_code == 401:
        return "AI API 키가 올바르지 않습니다. Render 환경 변수를 확인해 주세요."
    if resp.status_code == 404 or "model" in low:
        return f"AI 모델 설정 오류입니다. ({msg[:120]})"
    return f"AI 응답 오류 ({resp.status_code})"


async def create_embedding(client: httpx.AsyncClient, text: str) -> list[float] | None:
    # ponytail: embeddings는 OpenAI 전용; Gemini/Groq 키면 None (유사도 검색만 규칙 기반)
    embed_key = os.getenv("OPENAI_EMBED_API_KEY", "").strip() or (
        _api_key() if llm_config.provider_label() == "openai" else ""
    )
    if not embed_key or not text.strip():
        return None
    model = os.getenv("OPENAI_EMBED_MODEL", _EMBED_MODEL)
    embed_base = os.getenv("OPENAI_EMBED_BASE_URL", _OPENAI_EMBED_BASE).rstrip("/")
    try:
        resp = await client.post(
            f"{embed_base}/embeddings",
            headers={
                "Authorization": f"Bearer {embed_key}",
                "Content-Type": "application/json",
            },
            json={"model": model, "input": text[:8192]},
            timeout=20.0,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]
    except Exception:
        return None


def _track_reason_bits(tracks: list[dict], limit: int = 3) -> list[str]:
    bits: list[str] = []
    for t in tracks[:6]:
        for r in t.get("reasons") or ([t["reason"]] if t.get("reason") else []):
            text = str(r).strip()
            if text and text not in bits:
                bits.append(text)
            if len(bits) >= limit:
                return bits
    return bits


def fallback_recommendation_reason(user_query: str, tracks: list[dict]) -> str:
    if not tracks:
        return ""
    query = (user_query or "").strip() or "요청하신 취향"
    artists = list(
        dict.fromkeys(a for t in tracks[:4] if (a := (t.get("artist") or "").strip()))
    )
    focus = ", ".join(_track_reason_bits(tracks)) or "비슷한 분위기와 장르"
    artist_part = f"{', '.join(artists[:2])} 등의 곡" if artists else "선별된 곡들"
    return f"「{query}」에 맞춰 {focus} 기준으로 골랐어요. {artist_part}이 잘 어울립니다."


def _build_reason_prompt(user_query: str, tracks: list[dict]) -> str:
    lines = [
        f'사용자가 다음을 요청했습니다: "{user_query}"',
        "",
        "아래 음악들이 추천되었습니다:",
    ]
    for i, t in enumerate(tracks[:_MAX_REASON_TRACKS], 1):
        tags = ", ".join((t.get("genre_tags") or [])[:4])
        reasons = t.get("reasons") or t.get("recommendation_reasons") or []
        if isinstance(reasons, str):
            reasons = [reasons]
        reason_text = "; ".join(reasons[:2]) or str(t.get("reason") or "")
        line = f"{i}. {t.get('title', '')} — {t.get('artist', '')}"
        if tags:
            line += f"  [장르: {tags}]"
        if reason_text:
            line += f"  ({reason_text})"
        lines.append(line)
    lines += [
        "",
        "위 추천 결과 전체에 대해 사용자의 요청과 어떻게 연결되는지",
        "자연스럽고 따뜻한 한국어로 2~3문장으로 설명해주세요.",
        "각 곡을 나열하지 말고 전체적인 큐레이션 이유를 설명하세요.",
    ]
    return "\n".join(lines)


async def chat_completion(
    client: httpx.AsyncClient,
    messages: list[dict[str, str]],
) -> tuple[str, str]:
    """Return (assistant_text, model_name). Raises on missing key; empty string if API error."""
    if not is_configured():
        raise ValueError("AI API 키가 설정되지 않았습니다.")

    model = _chat_model()
    system = {
        "role": "system",
        "content": (
            "당신은 distribution 음악 탐색 앱의 AI 어시스턴트입니다. "
            "음악 검색, 장르 설명, 아티스트·곡 추천, playlist 아이디어, 취향 상담을 "
            "친근한 한국어로 도와줍니다. "
            "앱 기능: 곡/아티스트 검색, Every Noise 장르 맵, 키워드·자연어 취향 추천, 유사곡. "
            "모르는 정보는 지어내지 말고, 구체적인 검색어나 장르를 제안하세요."
        ),
    }
    payload_messages = [system]
    for m in messages[-20:]:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            payload_messages.append({"role": role, "content": content[:4000]})

    if len(payload_messages) < 2:
        raise ValueError("메시지가 비어 있습니다.")

    resp = await client.post(
        f"{_base_url()}/chat/completions",
        headers=_headers(),
        json={
            "model": model,
            "messages": payload_messages,
            "max_tokens": 800,
            "temperature": 0.75,
        },
        timeout=60.0,
    )
    if resp.status_code >= 400:
        detail = _openai_error_detail(resp)
        logger.warning("OpenAI chat failed: %s %s", resp.status_code, resp.text[:300])
        raise RuntimeError(detail)
    content = (resp.json()["choices"][0]["message"].get("content") or "").strip()
    if not content:
        raise RuntimeError("AI가 빈 응답을 반환했습니다.")
    return content, model


def _genre_fallback_reply(genre: dict[str, Any], tracks: list[dict]) -> str:
    name = genre.get("name", "이 장르")
    parent = genre.get("parent_name")
    kids = ", ".join((genre.get("children") or [])[:4])
    content = f"**{name}**은(는) Every Noise 장르 맵에 있는 장르예요."
    if parent:
        content += f" {parent} 계열에 가깝고,"
    if kids:
        content += f" {kids} 등과 연결돼 있어요."
    if tracks:
        artists = ", ".join(
            dict.fromkeys(a for t in tracks[:3] if (a := (t.get("artist") or "").strip()))
        )
        if artists:
            content += f" {artists} 같은 아티스트 곡도 함께 골라 뒀어요."
    return content


_COUNSELOR_SYSTEM = """당신은 distribution 음악 앱의 「AI DJ」입니다. 친구처럼 자연스럽고 똑똑한 한국어로 대화합니다.

역할:
- 사용자가 말한 장르·국가·분위기·상황을 정확히 짚고 공감한다. 엉뚱한 장르로 답하지 않는다.
- 국가·지역(한국 트랩, k-indie 등)을 언급했으면 답변에 반드시 반영한다.
- [큐레이션 결과]의 intent_summary·키워드·곡만 근거로 한다. 없는 곡은 지어내지 않는다.
- 곡 제목 나열·번호 매기기 금지. 2~4문장 큐레이션 톤.
- "더 신나게/잔잔하게" 같은 follow-up은 직전 대화 맥락을 이어 받는다.
- 곡이 없으면 솔직히 말하고, 비슷한 표현을 제안한다."""


def _build_curation_context(
    profile: dict[str, Any],
    tracks: list[dict],
    keywords: list[str],
    *,
    country: str | None = None,
) -> str:
    from country_filter import COUNTRIES

    country_line = "—"
    if country and country in COUNTRIES:
        country_line = f"{COUNTRIES[country]['label']} ({country}) — 해당 국가 아티스트·태그 위주 필터"

    lines = [
        "[큐레이션 결과 — 답변에 반드시 반영]",
        f"사용자 의도: {profile.get('intent_summary') or profile.get('query') or '—'}",
        f"국가 필터: {country_line}",
        f"분석 mood: {', '.join(profile.get('mood') or []) or '—'}",
        f"분석 genre: {', '.join(profile.get('genre') or []) or '—'}",
        f"tempo: {profile.get('tempo') or '—'}",
        f"검색 키워드: {', '.join(keywords) or '—'}",
    ]
    if tracks:
        lines.append("추천 곡:")
        for i, t in enumerate(tracks[:8], 1):
            sim = t.get("similarity") or t.get("genre_similarity") or 0
            tags = ", ".join((t.get("genre_tags") or [])[:3])
            extra = f" [{tags}]" if tags else ""
            lines.append(f"  {i}. {t.get('title', '')} — {t.get('artist', '')} (유사도 {sim}%){extra}")
    else:
        lines.append("추천 곡: (매칭 없음 — 표현을 바꿔 달라고 안내)")
    return "\n".join(lines)


async def chat_taste_counseling(
    client: httpx.AsyncClient,
    messages: list[dict[str, str]],
    *,
    profile: dict[str, Any],
    tracks: list[dict],
    keywords: list[str],
    country: str | None = None,
) -> tuple[str, str]:
    """AI DJ — 큐레이션 컨텍스트 + 대화 히스토리로 응답 생성."""
    if not is_configured():
        raise ValueError("AI API 키가 설정되지 않았습니다.")

    model = llm_config.counsel_model()
    user_q = messages[-1].get("content", "") if messages else ""
    if llm_config.is_rate_limited():
        if tracks:
            return fallback_recommendation_reason(user_q, tracks), model
        return (
            "Gemini 무료 한도에 잠시 걸렸어요. 잠시 후 다시 시도해 주세요.",
            model,
        )

    context = _build_curation_context(profile, tracks, keywords, country=country or profile.get("country"))
    payload_messages: list[dict[str, str]] = [
        {"role": "system", "content": f"{_COUNSELOR_SYSTEM}\n\n{context}"},
    ]
    for m in messages[-16:]:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            payload_messages.append({"role": role, "content": content[:4000]})

    if len(payload_messages) < 2:
        raise ValueError("메시지가 비어 있습니다.")

    resp = await client.post(
        f"{_base_url()}/chat/completions",
        headers=_headers(),
        json={
            "model": model,
            "messages": payload_messages,
            "max_tokens": 750,
            "temperature": 0.72,
        },
        timeout=60.0,
    )
    if resp.status_code >= 400:
        detail = _openai_error_detail(resp)
        logger.warning("OpenAI counsel chat failed: %s %s", resp.status_code, resp.text[:300])
        user_q = messages[-1].get("content", "") if messages else ""
        if tracks:
            return fallback_recommendation_reason(user_q, tracks), model
        return detail, model
    content = (resp.json()["choices"][0]["message"].get("content") or "").strip()
    if not content:
        if tracks:
            content = fallback_recommendation_reason(
                messages[-1].get("content", "") if messages else "",
                tracks,
            )
        else:
            content = "말씀해 주신 분위기를 조금 더 구체적으로 알려주시면, 맞는 곡을 바로 골라 드릴게요."
    return content, model


_GENRE_GUIDE_SYSTEM = """당신은 Every Noise 장르 맵을 아는 음악 가이드입니다. Google Gemini처럼 명확하고 친근한 한국어로 설명합니다.

역할:
- 제공된 [장르 맵 데이터]만 근거로 해당 장르를 초보자도 이해할 수 있게 한국어로 설명합니다.
- 첫 줄: 한 문장 요약 (이 장르 한마디로)
- 이어서: 분위기·대표적 사운드·어떤 때 듣는지 2~3문장
- 상위·하위·비슷한 장르와의 관계를 자연스럽게 연결 (제공된 목록만 사용)
- 큐레이션 곡이 있으면 1문장으로 연결하되 곡 제목 나열은 하지 않습니다.
- 지어낸 역사·아티스트는 쓰지 않습니다."""


def _build_genre_context(genre: dict[str, Any], tracks: list[dict], *, country: str | None = None) -> str:
    from country_filter import COUNTRIES

    lines = ["[장르 맵 데이터]"]
    if country and country in COUNTRIES:
        lines.append(f"국가 필터: {COUNTRIES[country]['label']} — 큐레이션 곡은 이 지역 위주")
    lines.extend([
        f"장르: {genre.get('name', '')}",
        f"상위 장르: {genre.get('parent_name') or '—'}",
        f"하위 장르: {', '.join(genre.get('children') or []) or '—'}",
        f"형제/인접: {', '.join(genre.get('siblings') or []) or '—'}",
        f"맵에서 가까운 장르: {', '.join(genre.get('nearby') or []) or '—'}",
    ])
    if tracks:
        lines.append("이 장르 대표곡 큐레이션:")
        for i, t in enumerate(tracks[:6], 1):
            lines.append(f"  {i}. {t.get('title', '')} — {t.get('artist', '')}")
    return "\n".join(lines)


async def chat_genre_explanation(
    client: httpx.AsyncClient,
    messages: list[dict[str, str]],
    *,
    genre: dict[str, Any],
    tracks: list[dict],
    country: str | None = None,
) -> tuple[str, str]:
    if not is_configured():
        raise ValueError("AI API 키가 설정되지 않았습니다.")

    model = llm_config.counsel_model()
    if llm_config.is_rate_limited():
        return _genre_fallback_reply(genre, tracks), model

    context = _build_genre_context(genre, tracks, country=country)
    payload_messages: list[dict[str, str]] = [
        {"role": "system", "content": f"{_GENRE_GUIDE_SYSTEM}\n\n{context}"},
    ]
    for m in messages[-12:]:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            payload_messages.append({"role": role, "content": content[:4000]})

    resp = await client.post(
        f"{_base_url()}/chat/completions",
        headers=_headers(),
        json={
            "model": model,
            "messages": payload_messages,
            "max_tokens": 550,
            "temperature": 0.65,
        },
        timeout=60.0,
    )
    if resp.status_code >= 400:
        detail = _openai_error_detail(resp)
        logger.warning("OpenAI genre chat failed: %s %s", resp.status_code, resp.text[:300])
        if tracks or genre.get("name"):
            return _genre_fallback_reply(genre, tracks), model
        return detail, model
    content = (resp.json()["choices"][0]["message"].get("content") or "").strip()
    if not content:
        content = _genre_fallback_reply(genre, tracks)
    return content, model


async def generate_recommendation_reason(
    client: httpx.AsyncClient,
    user_query: str,
    tracks: list[dict],
) -> str:
    if not tracks:
        return ""
    fallback = fallback_recommendation_reason(user_query, tracks)
    if not is_configured() or llm_config.is_rate_limited():
        return fallback

    model = _chat_model()
    try:
        resp = await client.post(
            f"{_base_url()}/chat/completions",
            headers=_headers(),
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "당신은 음악 큐레이터입니다. "
                            "사용자의 음악 취향에 맞는 추천 결과를 "
                            "따뜻하고 자연스러운 한국어로만 설명합니다."
                        ),
                    },
                    {"role": "user", "content": _build_reason_prompt(user_query, tracks)},
                ],
                "max_tokens": 300,
                "temperature": 0.7,
            },
            timeout=45.0,
        )
        if resp.status_code >= 400:
            logger.warning("OpenAI chat failed: %s %s", resp.status_code, resp.text[:300])
            return fallback
        content = (resp.json()["choices"][0]["message"].get("content") or "").strip()
        return content or fallback
    except Exception as exc:
        logger.warning("OpenAI recommendation_reason failed: %s", exc)
        return fallback
