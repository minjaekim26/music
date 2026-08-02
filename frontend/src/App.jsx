import React, { useEffect, useRef, useState } from "react";
import GenreMap from "./components/GenreMap.jsx";
import GenreBars from "./components/GenreBars.jsx";
import GenreExplorer from "./components/GenreExplorer.jsx";
import HomeGenreMap from "./components/HomeGenreMap.jsx";
import CountryPicker from "./components/CountryPicker.jsx";
import HelpPanel from "./components/HelpPanel.jsx";
import Hero from "./components/Hero.jsx";
import LoadingSteps from "./components/LoadingSteps.jsx";
import { TasteProfileCard } from "./components/TasteProfileCard.jsx";
import { TrackRecommendList } from "./components/TrackRecommendList.jsx";
import { PaginationBar, usePagination } from "./components/Pagination.jsx";
import { classifySearchQuery } from "./utils/searchIntent.js";

const API_BASE = import.meta.env.VITE_API_BASE || "";

function appendCountry(params, country) {
  if (country) params.set("country", country);
}

function searchEmptyHint(meta, query) {
  if (!meta) {
    return "다른 검색어로 다시 시도해 보세요.";
  }
  if (!meta.lastfm_configured) {
    return "Last.fm API 키가 없습니다. music/.env에 LASTFM_API_KEY를 넣고 백엔드를 재시작하세요.";
  }
  if (!meta.lastfm_ok && !meta.musicbrainz_ok && !meta.deezer_ok && !meta.spotify_ok && !meta.soundcloud_ok && !meta.ytmusic_ok) {
    if (!meta.spotify_configured && !meta.soundcloud_configured) {
      return "외부 API 연결 실패. music/.env에 Spotify·SoundCloud 키를 넣거나 백엔드를 재시작하세요.";
    }
    return "외부 음악 API에 연결하지 못했습니다. music/run-backend.ps1 실행 여부를 확인하세요 (포트 8020).";
  }
  return `'${query}'에 맞는 곡을 찾지 못했습니다. 영문 제목·아티스트로 검색해 보세요.`;
}

function AiReasonBox({ text, className = "" }) {
  if (!text) return null;
  return (
    <div className={`rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">AI 추천 설명</p>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">{text}</p>
    </div>
  );
}

function fallbackAiReason(query, tracks) {
  if (!tracks?.length) return "";
  const bits = [];
  for (const t of tracks.slice(0, 5)) {
    for (const r of t.reasons || (t.reason ? [t.reason] : [])) {
      if (r && !bits.includes(r)) bits.push(r);
      if (bits.length >= 3) break;
    }
    if (bits.length >= 3) break;
  }
  const focus = bits.join(", ") || "비슷한 분위기";
  const artists = [...new Set(tracks.slice(0, 3).map((t) => t.artist).filter(Boolean))];
  const artistPart = artists.length ? `${artists.slice(0, 2).join(", ")} 등의 곡` : "선별된 곡들";
  const q = (query || "요청하신 취향").trim();
  return `「${q}」에 맞춰 ${focus} 기준으로 골랐어요. ${artistPart}이 잘 어울립니다.`;
}

function applyTheme(next) {
  const root = document.documentElement;
  if (next === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    localStorage.setItem("distribution_theme", next);
  } catch {}
}

function getInitialTheme() {
  try {
    const saved = localStorage.getItem("distribution_theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {}
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function Chip({ children, variant = "default", onClick, active = false }) {
  const styles =
    variant === "genre"
      ? active
        ? "bg-accent/20 text-accent border-accent/40 cursor-pointer dark:bg-accent/30 dark:text-white"
        : "bg-accent/10 text-accent border-accent/30 cursor-pointer hover:bg-accent/15 dark:bg-accent/20 dark:text-violet-200 dark:hover:bg-accent/30"
      : variant === "mood"
        ? "bg-glow/10 text-pink-700 border-glow/25 dark:bg-glow/15 dark:text-pink-200 dark:border-glow/30"
        : onClick
          ? "bg-zinc-900/5 text-zinc-700 border-zinc-900/10 cursor-pointer hover:bg-zinc-900/10 dark:bg-white/5 dark:text-zinc-300 dark:border-white/10 dark:hover:bg-white/10"
          : "bg-zinc-900/5 text-zinc-700 border-zinc-900/10 dark:bg-white/5 dark:text-zinc-300 dark:border-white/10";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${styles}`}
      >
        {children}
      </button>
    );
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

function formatNumber(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function SearchResult({ item, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`group flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition ${
        active
          ? "border-accent/50 bg-accent/10"
          : "border-zinc-900/10 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
      }`}
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {item.cover ? (
          <img src={item.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-zinc-200 dark:bg-zinc-800" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900 dark:text-white">{item.title}</p>
        <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">{item.artist}</p>
        {item.listeners > 0 && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-500">리스너 {formatNumber(item.listeners)}</p>
        )}
        {item.source_label && (
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{item.source_label}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.relevance != null && (
          <span className="text-[10px] font-medium tabular-nums text-accent">{item.relevance}%</span>
        )}
        {item.duration && <span className="text-xs text-zinc-500 dark:text-zinc-500">{item.duration}</span>}
      </div>
    </button>
  );
}


function TrackDetail({
  detail,
  loading,
  onSimilarSelect,
  onGenreSelect,
  selectedGenre,
}) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) audioRef.current.load();
  }, [detail?.preview]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-zinc-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
        <LoadingSteps active />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-[360px] rounded-3xl border border-dashed border-zinc-900/10 bg-white dark:border-white/10 dark:bg-white/5" />
    );
  }

  const ui = detail.ui || {};
  const banner = ui.artist_banner || ui.album_banner;

  return (
    <div className="animate-fade-in space-y-6 rounded-3xl border border-zinc-900/10 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
      {banner && (
        <div className="relative -mx-6 -mt-6 mb-2 h-36 overflow-hidden rounded-t-3xl">
          <img src={banner} alt="" className="h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/90 dark:to-card/90" />
        </div>
      )}

      <div className="flex flex-col gap-6 md:flex-row">
        <div className="mx-auto h-56 w-56 shrink-0 overflow-hidden rounded-2xl bg-white/5 shadow-2xl ring-2 ring-white/10 md:mx-0">
          {(detail.cover || ui.album_thumb || ui.track_thumb) ? (
            <img
              src={detail.cover || ui.album_thumb || ui.track_thumb}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-zinc-200 dark:bg-zinc-800" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-accent">distribution</p>
            <h2 className="font-display mt-1 text-2xl font-bold leading-tight text-white md:text-3xl">
              <span className="text-zinc-900 dark:text-white">{detail.title}</span>
            </h2>
            <p className="mt-1 text-lg text-zinc-700 dark:text-zinc-300">{detail.artist}</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-zinc-600 dark:text-zinc-400">
            {detail.album && <span>앨범 · {detail.album}</span>}
            {detail.release_date && <span>발매 · {detail.release_date}</span>}
            {detail.duration && <span>길이 · {detail.duration}</span>}
            {ui.label && <span>레이블 · {ui.label}</span>}
            {ui.artist_country && <span>국가 · {ui.artist_country}</span>}
            {detail.source_label && <span>출처 · {detail.source_label}</span>}
          </div>

          {detail.external_url && (
            <a
              href={detail.external_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-sm font-medium text-accent hover:underline"
            >
              {detail.source_label || "원본"}에서 열기
            </a>
          )}

          {(detail.listeners > 0 || detail.playcount > 0) && (
            <div className="flex flex-wrap gap-2">
              {detail.listeners > 0 && (
                <Chip variant="genre">Last.fm 리스너 {formatNumber(detail.listeners)}</Chip>
              )}
              {detail.playcount > 0 && (
                <Chip variant="genre">재생 {formatNumber(detail.playcount)}</Chip>
              )}
            </div>
          )}

          {(ui.track_mood || ui.track_style || ui.artist_mood) && (
            <div className="flex flex-wrap gap-2">
              {[ui.track_mood, ui.track_style, ui.artist_mood].filter(Boolean).map((m) => (
                <Chip key={m} variant="mood">
                  {m}
                </Chip>
              ))}
            </div>
          )}

          {(ui.track_description || ui.artist_bio) && (
            <p className="text-sm leading-relaxed text-zinc-300">
              {ui.track_description || ui.artist_bio}
            </p>
          )}

          {detail.preview && (
            <div className="rounded-2xl border border-zinc-900/10 bg-zinc-900/5 p-4 dark:border-white/10 dark:bg-black/20">
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">미리듣기</p>
              <audio ref={audioRef} controls className="w-full" src={detail.preview}>
                브라우저가 오디오를 지원하지 않습니다.
              </audio>
            </div>
          )}
        </div>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <GenreMap genreMap={detail.genre_map} onGenreClick={onGenreSelect} />
        <GenreBars
          genres={detail.genre_map?.matched_genres}
          title="분류 장르 유사도"
          onGenreClick={onGenreSelect}
          selectedGenre={selectedGenre}
        />
      </section>

      <section>
        <h3 className="font-display mb-2 text-lg font-semibold text-white">장르 분석</h3>
        <p className="mb-4 text-sm leading-relaxed text-zinc-300">{detail.genres.description}</p>
        <div className="flex flex-wrap gap-2">
          {detail.genres.primary.map((g) => (
            <Chip
              key={g}
              variant="genre"
              active={selectedGenre === g}
              onClick={onGenreSelect ? () => onGenreSelect(g) : undefined}
            >
              {g}
            </Chip>
          ))}
          {detail.genres.tags.slice(0, 10).map((t) => (
            <Chip
              key={t}
              active={selectedGenre === t}
              onClick={onGenreSelect ? () => onGenreSelect(t) : undefined}
            >
              {t}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [genreRecommendations, setGenreRecommendations] = useState([]);
  const [loadingGenreRecs, setLoadingGenreRecs] = useState(false);
  const [genreMapNodes, setGenreMapNodes] = useState([]);
  const [genreMapBounds, setGenreMapBounds] = useState(null);
  const [genreExplorerOpen, setGenreExplorerOpen] = useState(false);
  const [pickedGenres, setPickedGenres] = useState([]);
  const [pickedGenreRecs, setPickedGenreRecs] = useState([]);
  const [loadingPickedRecs, setLoadingPickedRecs] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [homeKey, setHomeKey] = useState(0);
  const [backendOk, setBackendOk] = useState(true);
  const [searchMeta, setSearchMeta] = useState(null);
  const [searchIntent, setSearchIntent] = useState(null);
  const [recResult, setRecResult] = useState(null);
  const [tasteProfile, setTasteProfile] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState("");

  const searchPagination = usePagination(results);
  const recPagination = usePagination(recResult?.tracks || []);
  const pickedRecPagination = usePagination(pickedGenreRecs);
  const detailRecTracks =
    genreRecommendations.length > 0 ? genreRecommendations : detail?.similar_tracks || [];
  const detailRecPagination = usePagination(detailRecTracks);

  function resetHome() {
    setQuery("");
    setResults([]);
    setSelected(null);
    setDetail(null);
    setSearching(false);
    setLoadingDetail(false);
    setError("");
    setSelectedGenre(null);
    setGenreRecommendations([]);
    setLoadingGenreRecs(false);
    setGenreExplorerOpen(false);
    setPickedGenres([]);
    setPickedGenreRecs([]);
    setLoadingPickedRecs(false);
    setHelpOpen(false);
    setSearchIntent(null);
    setRecResult(null);
    setTasteProfile(null);
    setRecLoading(false);
    setHomeKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/health`)
      .then((r) => {
        if (!r.ok) throw new Error("health failed");
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setBackendOk(d?.status === "ok");
      })
      .catch(() => {
        if (!cancelled) setBackendOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [homeKey]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/genre-map`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setGenreMapNodes(d.nodes || []);
        setGenreMapBounds(d.bounds || null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSearch(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    const intent = classifySearchQuery(q);
    setSearchIntent(intent);
    setSearching(true);
    setRecLoading(intent.primary !== "catalog");
    setError("");
    setDetail(null);
    setSelected(null);
    setSelectedGenre(null);
    setGenreRecommendations([]);
    setSearchMeta(null);
    setResults([]);
    setRecResult(null);
    setTasteProfile(null);

    try {
      if (intent.primary === "catalog") {
        const params = new URLSearchParams({ q, limit: "50" });
        appendCountry(params, selectedCountry);
        const res = await fetch(`${API_BASE}/api/search?${params}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || "검색에 실패했습니다.");
        }
        const filtered = (data.results || [])
          .filter((t) => (t.relevance ?? 0) > 0)
          .sort((a, b) => {
            const ao = a.is_official ? 0 : 1;
            const bo = b.is_official ? 0 : 1;
            if (ao !== bo) return ao - bo;
            return (b.relevance ?? 0) - (a.relevance ?? 0);
          });
        setResults(filtered);
        setSearchMeta(data.meta || null);
        if (!filtered.length) {
          setError(`검색 결과가 없습니다. ${searchEmptyHint(data.meta, q)}`);
        }
      } else if (intent.primary === "taste") {
        const params = new URLSearchParams({ query: q, limit: "30" });
        appendCountry(params, selectedCountry);
        const res = await fetch(`${API_BASE}/api/recommend/taste?${params}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || "취향 추천에 실패했습니다.");
        }
        setTasteProfile(data.taste_profile || null);
        setRecResult(data);
        if (!data.tracks?.length) {
          setError("추천 결과가 없습니다. 다른 표현으로 다시 검색해 보세요.");
        }
      } else if (intent.primary === "keywords") {
        const params = new URLSearchParams();
        intent.keywords.forEach((k) => params.append("keywords", k));
        params.set("limit", "30");
        appendCountry(params, selectedCountry);
        const res = await fetch(`${API_BASE}/api/recommend/keywords?${params}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.detail || "키워드 추천에 실패했습니다.");
        }
        setRecResult(data);
        if (!data.tracks?.length) {
          setError("추천 결과가 없습니다. 다른 키워드로 다시 검색해 보세요.");
        }
      }
    } catch (err) {
      const msg = err.message || "검색 중 오류가 발생했습니다.";
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
        setError("백엔드에 연결할 수 없습니다. music/run-backend.ps1을 실행했는지 확인하세요.");
      } else {
        setError(msg);
      }
      setResults([]);
      setRecResult(null);
      setTasteProfile(null);
    } finally {
      setSearching(false);
      setRecLoading(false);
    }
  }

  async function loadDetail(item) {
    setSelected(item);
    setLoadingDetail(true);
    setError("");

    const params = new URLSearchParams();
    if (item.mbid) params.set("mbid", item.mbid);
    if (item.deezer_id) params.set("deezer_id", String(item.deezer_id));
    if (item.soundcloud_id) params.set("soundcloud_id", String(item.soundcloud_id));
    if (item.title) params.set("title", item.title);
    if (item.artist) params.set("artist", item.artist);
    if (item.external_url) params.set("external_url", item.external_url);
    if (item.source) params.set("source", item.source);

    try {
      const res = await fetch(`${API_BASE}/api/track?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "곡 정보를 불러오지 못했습니다.");
      }
      setDetail(await res.json());
      setSelectedGenre(null);
      setGenreRecommendations([]);
    } catch (err) {
      setError(err.message || "상세 정보 로딩 실패");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleGenreSelect(genre) {
    if (!detail) return;

    setSelectedGenre(genre);
    setLoadingGenreRecs(true);
    setError("");

    const params = new URLSearchParams({
      genre,
      exclude_title: detail.title,
      exclude_artist: detail.artist,
      limit: "12",
    });
    appendCountry(params, selectedCountry);

    try {
      const res = await fetch(`${API_BASE}/api/recommend/genre?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "장르 추천을 불러오지 못했습니다.");
      }
      const data = await res.json();
      setGenreRecommendations(data.tracks || []);
      if (!data.tracks?.length) {
        setError(`'${genre}' 장르 추천곡을 찾지 못했습니다.`);
      }
    } catch (err) {
      setError(err.message || "장르 추천 로딩 실패");
      setGenreRecommendations([]);
    } finally {
      setLoadingGenreRecs(false);
    }
  }

  function togglePickedGenre(genre) {
    setPickedGenres((prev) => {
      const has = prev.includes(genre);
      if (has) return prev.filter((g) => g !== genre);
      if (prev.length >= 10) return prev;
      return [...prev, genre];
    });
  }

  function clearPickedRecommendations() {
    setPickedGenreRecs([]);
    setLoadingPickedRecs(false);
  }

  async function recommendPickedGenres() {
    if (pickedGenres.length === 0) return;
    setLoadingPickedRecs(true);
    setError("");

    const params = new URLSearchParams();
    pickedGenres.forEach((g) => params.append("genres", g));
    if (detail?.title) params.set("exclude_title", detail.title);
    if (detail?.artist) params.set("exclude_artist", detail.artist);
    params.set("limit", "12");
    appendCountry(params, selectedCountry);

    try {
      const res = await fetch(`${API_BASE}/api/recommend/genres?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "선택 장르 추천을 불러오지 못했습니다.");
      }
      const data = await res.json();
      setPickedGenreRecs(data.tracks || []);
      setGenreExplorerOpen(false);
    } catch (err) {
      setError(err.message || "선택 장르 추천 실패");
      setPickedGenreRecs([]);
    } finally {
      setLoadingPickedRecs(false);
    }
  }

  async function handleSimilarSelect(track) {
    await loadDetail({
      title: track.title,
      artist: track.artist,
      deezer_id: track.deezer_id,
      mbid: track.mbid,
      cover: track.cover,
      duration: track.duration,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={resetHome}
          className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-zinc-900 transition hover:opacity-90 dark:text-white"
        >
          <img src="/logo.png" alt="" className="h-8 w-8 rounded-full object-contain" />
          <span className="hover:text-accent">distribution</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="rounded-full border border-zinc-900/10 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            도움말
          </button>
          <button
            type="button"
            onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              setTheme(next);
              applyTheme(next);
            }}
            className="rounded-full border border-zinc-900/10 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            {theme === "dark" ? "라이트" : "다크"}
          </button>
        </div>
      </header>

      <HelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />

      {!backendOk && (
        <div className="mx-auto mb-4 max-w-2xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
          music 백엔드에 연결되지 않았습니다. <code className="text-xs">music\run-backend.ps1</code>을
          실행하세요 (포트 8020). project-practice는 8001입니다.
        </div>
      )}

      <Hero />

      <div className="mx-auto max-w-2xl space-y-3">
        <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          <form onSubmit={handleSearch} className="p-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="곡, 아티스트, 키워드, 취향 자연어 검색"
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={searching || recLoading}
                className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent"
              >
                {searching || recLoading ? "…" : "검색"}
              </button>
            </div>
            <div className="border-t border-zinc-900/10 px-3 py-2 dark:border-white/10">
              <CountryPicker value={selectedCountry} onChange={setSelectedCountry} />
            </div>
          </form>

          {searchIntent && (
            <p className="border-t border-zinc-900/10 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-white/10">
              <span className="text-zinc-400">해석:</span>{" "}
              <span className="text-zinc-700 dark:text-zinc-300">{searchIntent.label}</span>
            </p>
          )}

          <TasteProfileCard profile={tasteProfile} />

          {(searching || recLoading) && (
            <LoadingSteps
              active={searching || recLoading}
              compact
              className="border-t border-zinc-900/10 dark:border-white/10"
            />
          )}

          {(searchMeta?.query_canonical || searchMeta?.query_expanded?.length > 0) && (
            <p className="border-t border-zinc-900/10 px-3 py-2 text-[11px] text-zinc-500 dark:border-white/10">
              원명으로 검색:{" "}
              <span className="text-zinc-700 dark:text-zinc-300">
                {searchMeta.query_canonical || searchMeta.query_expanded.join(" · ")}
              </span>
            </p>
          )}

          {results.length > 0 && (
            <div className="border-t border-zinc-900/10 dark:border-white/10">
              <p className="px-3 py-1.5 text-[11px] text-zinc-400">곡 · 아티스트 · 정확도순</p>
              <div className="space-y-1.5 px-2">
                {searchPagination.slice.map((item) => (
                  <SearchResult
                    key={`${item.mbid || "x"}-${item.title}-${item.artist}`}
                    item={item}
                    active={selected?.title === item.title && selected?.artist === item.artist}
                    onSelect={loadDetail}
                  />
                ))}
              </div>
              <PaginationBar
                page={searchPagination.page}
                totalPages={searchPagination.totalPages}
                total={searchPagination.total}
                onPageChange={searchPagination.setPage}
              />
            </div>
          )}

          {(recResult?.tracks?.length > 0) && !searching && !recLoading && (
            <div className="border-t border-zinc-900/10 dark:border-white/10">
              <p className="px-3 py-1.5 text-[11px] text-zinc-400">추천 · 유사도순</p>
              <AiReasonBox
                className="mx-2 mb-2"
                text={
                  recResult.recommendation_reason ||
                  fallbackAiReason(query, recResult.tracks)
                }
              />
              <div className="px-2 py-2">
                <TrackRecommendList
                  tracks={recPagination.slice}
                  onSelect={handleSimilarSelect}
                  showReason
                />
                <PaginationBar
                  page={recPagination.page}
                  totalPages={recPagination.totalPages}
                  total={recPagination.total}
                  onPageChange={recPagination.setPage}
                />
              </div>
            </div>
          )}
        </div>

        {(pickedGenreRecs.length > 0 || loadingPickedRecs) && (
          <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white dark:border-white/10 dark:bg-white/5">
            {!loadingPickedRecs && (
              <p className="border-b border-zinc-900/10 px-4 py-2 text-xs font-medium text-zinc-500 dark:border-white/10">
                장르 모두 포함 · {pickedGenres.join(", ")}
              </p>
            )}
            {loadingPickedRecs ? (
              <LoadingSteps active compact />
            ) : (
              <div className="px-2 py-2">
                <TrackRecommendList tracks={pickedRecPagination.slice} onSelect={handleSimilarSelect} showReason />
                <PaginationBar
                  page={pickedRecPagination.page}
                  totalPages={pickedRecPagination.totalPages}
                  total={pickedRecPagination.total}
                  onPageChange={pickedRecPagination.setPage}
                />
              </div>
            )}
          </div>
        )}

        <HomeGenreMap
          nodes={genreMapNodes}
          bounds={genreMapBounds}
          selectedGenres={pickedGenres}
          selectedCountry={selectedCountry}
          onCountryChange={setSelectedCountry}
          onToggleGenre={togglePickedGenre}
          onOpenFull={() => setGenreExplorerOpen(true)}
          onRecommend={recommendPickedGenres}
          onClearRecommendations={clearPickedRecommendations}
          loading={loadingPickedRecs}
        />
      </div>

      <GenreExplorer
        open={genreExplorerOpen}
        nodes={genreMapNodes}
        bounds={genreMapBounds}
        selectedGenres={pickedGenres}
        selectedCountry={selectedCountry}
        onCountryChange={setSelectedCountry}
        onToggleGenre={togglePickedGenre}
        onClose={() => setGenreExplorerOpen(false)}
        onRecommend={recommendPickedGenres}
        onClearRecommendations={clearPickedRecommendations}
        loading={loadingPickedRecs}
      />

      {error && (
        <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <main className="mx-auto max-w-4xl space-y-4">
        <TrackDetail
          detail={detail}
          loading={loadingDetail}
          onSimilarSelect={handleSimilarSelect}
          onGenreSelect={handleGenreSelect}
          selectedGenre={selectedGenre}
        />

        {(detail?.similar_tracks?.length > 0 ||
          genreRecommendations.length > 0 ||
          loadingGenreRecs) && (
          <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white dark:border-white/10 dark:bg-white/5">
            <p className="border-b border-zinc-900/10 px-4 py-2 text-xs font-medium text-zinc-500 dark:border-white/10">
              {selectedGenre
                ? `'${selectedGenre}' 추천`
                : detail?.title
                  ? `'${detail.title}' 비슷한 음악`
                  : "추천"}
            </p>
            {!loadingGenreRecs && (
              <AiReasonBox
                className="mx-3 mt-3"
                text={
                  detail?.recommendation_reason ||
                  fallbackAiReason(
                    detail?.title ? `${detail.title} · ${detail.artist}` : query,
                    detailRecTracks,
                  )
                }
              />
            )}
            <div className="px-2 py-2">
              {loadingGenreRecs ? (
                <LoadingSteps active compact />
              ) : (
                <>
                  <TrackRecommendList
                    tracks={detailRecPagination.slice}
                    onSelect={handleSimilarSelect}
                    showReason
                  />
                  <PaginationBar
                    page={detailRecPagination.page}
                    totalPages={detailRecPagination.totalPages}
                    total={detailRecPagination.total}
                    onPageChange={detailRecPagination.setPage}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
