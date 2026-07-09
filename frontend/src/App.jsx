import React, { useEffect, useRef, useState } from "react";
import GenreMap from "./components/GenreMap.jsx";
import GenreBars from "./components/GenreBars.jsx";
import GenreExplorer from "./components/GenreExplorer.jsx";
import KeywordRecommend from "./components/KeywordRecommend.jsx";
import HelpPanel from "./components/HelpPanel.jsx";
import { TrackRecommendList } from "./components/TrackRecommendList.jsx";
import { PaginationBar, usePagination } from "./components/Pagination.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "";

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
        <div className="flex flex-col items-center gap-3 text-zinc-500 dark:text-zinc-400">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm">음악 DB에서 분석 중...</p>
        </div>
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
            <h2 className="font-display mt-1 text-3xl font-bold leading-tight text-white md:text-4xl">
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
        <GenreMap genreMap={detail.genre_map} />
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

  const searchPagination = usePagination(results);
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

    setSearching(true);
    setError("");
    setDetail(null);
    setSelected(null);
    setSelectedGenre(null);
    setGenreRecommendations([]);
    setSearchMeta(null);

    try {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}&limit=50`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "검색에 실패했습니다.");
      }
      setResults(data.results || []);
      setSearchMeta(data.meta || null);
      if (!data.results?.length) {
        setError(`검색 결과가 없습니다. ${searchEmptyHint(data.meta, q)}`);
      }
    } catch (err) {
      const msg = err.message || "검색 중 오류가 발생했습니다.";
      if (msg === "Failed to fetch" || msg.includes("NetworkError")) {
        setError("백엔드에 연결할 수 없습니다. music/run-backend.ps1을 실행했는지 확인하세요.");
      } else {
        setError(msg);
      }
      setResults([]);
    } finally {
      setSearching(false);
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

  async function recommendPickedGenres() {
    if (pickedGenres.length === 0) return;
    setLoadingPickedRecs(true);
    setError("");

    const params = new URLSearchParams();
    pickedGenres.forEach((g) => params.append("genres", g));
    if (detail?.title) params.set("exclude_title", detail.title);
    if (detail?.artist) params.set("exclude_artist", detail.artist);
    params.set("limit", "12");

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
      <header className="relative mb-8 flex min-h-10 items-center justify-end">
        <button
          type="button"
          onClick={resetHome}
          className="absolute left-1/2 -translate-x-1/2 font-display text-xl font-bold tracking-tight text-zinc-900 transition hover:text-accent dark:text-white dark:hover:text-accent"
        >
          distribution
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

      <div className="mx-auto max-w-2xl space-y-3">
        <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
          <form onSubmit={handleSearch} className="p-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="곡 · 아티스트 검색"
                className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={searching}
                className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent"
              >
                {searching ? "…" : "검색"}
              </button>
            </div>
          </form>

          {searchMeta?.query_expanded?.length > 0 && (
            <p className="border-t border-zinc-900/10 px-3 py-2 text-[11px] text-zinc-500 dark:border-white/10">
              한글 검색어를 영문으로 변환해 검색했습니다:{" "}
              <span className="text-zinc-700 dark:text-zinc-300">
                {searchMeta.query_expanded.join(" · ")}
              </span>
            </p>
          )}

          {results.length > 0 && (
            <div className="border-t border-zinc-900/10 dark:border-white/10">
              <p className="px-3 py-1.5 text-[11px] text-zinc-400">관련도 · 유사도순</p>
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
        </div>

        <KeywordRecommend key={homeKey} onSelectTrack={handleSimilarSelect} />

        {(pickedGenreRecs.length > 0 || loadingPickedRecs) && (
          <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white dark:border-white/10 dark:bg-white/5">
            <p className="border-b border-zinc-900/10 px-4 py-2 text-xs font-medium text-zinc-500 dark:border-white/10">
              {loadingPickedRecs ? "추천 불러오는 중…" : `장르 추천 · ${pickedGenres.join(", ")}`}
            </p>
            {pickedGenreRecs.length > 0 && (
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
            <div className="px-2 py-2">
              {loadingGenreRecs ? (
                <p className="py-4 text-center text-xs text-zinc-400">추천 계산 중…</p>
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

        <div className="flex justify-center pb-2">
          <button
            type="button"
            onClick={() => setGenreExplorerOpen(true)}
            className="text-sm text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
          >
            장르 맵
          </button>
        </div>
      </div>

      <GenreExplorer
        open={genreExplorerOpen}
        nodes={genreMapNodes}
        bounds={genreMapBounds}
        selectedGenres={pickedGenres}
        onToggleGenre={togglePickedGenre}
        onClose={() => setGenreExplorerOpen(false)}
        onRecommend={recommendPickedGenres}
        loading={loadingPickedRecs}
      />

      {error && (
        <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <main className="mx-auto max-w-4xl">
        <TrackDetail
          detail={detail}
          loading={loadingDetail}
          onSimilarSelect={handleSimilarSelect}
          onGenreSelect={handleGenreSelect}
          selectedGenre={selectedGenre}
        />
      </main>
    </div>
  );
}
