import React, { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

function Chip({ children, variant = "default" }) {
  const styles =
    variant === "genre"
      ? "bg-accent/20 text-violet-200 border-accent/30"
      : "bg-white/5 text-zinc-300 border-white/10";
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}

function SearchResult({ item, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`group flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition ${
        active
          ? "border-accent/60 bg-accent/10 shadow-[0_0_30px_rgba(124,92,255,0.15)]"
          : "border-white/5 bg-card/60 hover:border-white/15 hover:bg-card"
      }`}
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
        {item.cover ? (
          <img src={item.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xl text-white/20">♪</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{item.title}</p>
        <p className="truncate text-sm text-zinc-400">{item.artist}</p>
      </div>
      {item.duration && <span className="text-xs text-zinc-500">{item.duration}</span>}
    </button>
  );
}

function SimilarCard({ track, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(track)}
      className="animate-slide-up flex flex-col overflow-hidden rounded-2xl border border-white/5 bg-card/80 text-left transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_8px_30px_rgba(124,92,255,0.12)]"
    >
      <div className="relative aspect-square w-full bg-white/5">
        {track.cover ? (
          <img src={track.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-white/15">♪</div>
        )}
        <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-zinc-300">
          {track.reason}
        </span>
      </div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-white">{track.title}</p>
        <p className="truncate text-xs text-zinc-400">{track.artist}</p>
        {track.duration && <p className="text-[11px] text-zinc-500">{track.duration}</p>}
      </div>
    </button>
  );
}

function TrackDetail({ detail, loading, onSimilarSelect }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [detail?.preview]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-white/5 bg-card/40">
        <div className="flex flex-col items-center gap-3 text-zinc-400">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm">곡 정보를 분석하는 중...</p>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-card/20 px-6 text-center">
        <div className="mb-4 text-5xl opacity-30">🎧</div>
        <h3 className="font-display text-xl font-semibold text-white">궁금한 음악을 검색해 보세요</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-400">
          곡명이나 아티스트를 입력하면 상세 정보, 장르 분석, 비슷한 음악 추천을 받을 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 rounded-3xl border border-white/5 bg-card/50 p-6 backdrop-blur">
      <div className="flex flex-col gap-6 md:flex-row">
        <div className="mx-auto h-56 w-56 shrink-0 overflow-hidden rounded-2xl bg-white/5 shadow-2xl md:mx-0">
          {detail.cover ? (
            <img src={detail.cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl text-white/10">♪</div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-accent">Now Playing Info</p>
            <h2 className="font-display mt-1 text-3xl font-bold leading-tight text-white md:text-4xl">
              {detail.title}
            </h2>
            <p className="mt-1 text-lg text-zinc-300">{detail.artist}</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
            {detail.album && <span>앨범 · {detail.album}</span>}
            {detail.release_date && <span>발매 · {detail.release_date}</span>}
            {detail.duration && <span>길이 · {detail.duration}</span>}
          </div>

          {detail.preview && (
            <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
              <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">30초 미리듣기</p>
              <audio ref={audioRef} controls className="w-full" src={detail.preview}>
                브라우저가 오디오를 지원하지 않습니다.
              </audio>
            </div>
          )}
        </div>
      </div>

      <section>
        <h3 className="font-display mb-3 text-lg font-semibold text-white">장르 & 스타일</h3>
        <p className="mb-4 text-sm leading-relaxed text-zinc-300">{detail.genres.description}</p>
        <div className="flex flex-wrap gap-2">
          {detail.genres.primary.map((g) => (
            <Chip key={g} variant="genre">
              {g}
            </Chip>
          ))}
          {detail.genres.tags.slice(0, 10).map((t) => (
            <Chip key={t}>{t}</Chip>
          ))}
        </div>
      </section>

      {detail.similar_tracks?.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-white">비슷한 음악 추천</h3>
              <p className="text-sm text-zinc-400">장르와 아티스트 관계를 기반으로 골라봤어요</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {detail.similar_tracks.map((track) => (
              <SimilarCard
                key={`${track.deezer_id}-${track.title}`}
                track={track}
                onSelect={onSimilarSelect}
              />
            ))}
          </div>
        </section>
      )}
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

  async function handleSearch(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearching(true);
    setError("");
    setDetail(null);
    setSelected(null);

    try {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}&limit=12`);
      if (!res.ok) throw new Error("검색에 실패했습니다.");
      const data = await res.json();
      setResults(data.results || []);
      if (data.results?.length === 0) {
        setError("검색 결과가 없습니다. 다른 키워드로 시도해 보세요.");
      }
    } catch (err) {
      setError(err.message || "검색 중 오류가 발생했습니다.");
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
    if (item.title) params.set("title", item.title);
    if (item.artist) params.set("artist", item.artist);

    try {
      const res = await fetch(`${API_BASE}/api/track?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "곡 정보를 불러오지 못했습니다.");
      }
      const data = await res.json();
      setDetail(data);
    } catch (err) {
      setError(err.message || "상세 정보 로딩 실패");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleSimilarSelect(track) {
    const item = {
      title: track.title,
      artist: track.artist,
      deezer_id: track.deezer_id,
      cover: track.cover,
      duration: track.duration,
    };
    await loadDetail(item);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <header className="mb-10 text-center md:mb-14">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.25em] text-accent">Music Explorer</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-white md:text-5xl">
          궁금한 음악, 바로 탐색
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400 md:text-base">
          곡명이나 아티스트를 검색하면 상세 정보와 구체적인 장르, 비슷한 음악 추천을 한곳에서 확인할 수
          있습니다.
        </p>
      </header>

      <form onSubmit={handleSearch} className="mx-auto mb-8 max-w-2xl">
        <div className="flex gap-2 rounded-2xl border border-white/10 bg-surface/80 p-2 shadow-[0_0_40px_rgba(124,92,255,0.08)] backdrop-blur">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: Bohemian Rhapsody Queen, NewJeans Ditto"
            className="flex-1 bg-transparent px-4 py-3 text-white outline-none placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-xl bg-gradient-to-r from-accent to-glow px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {searching ? "검색 중..." : "검색"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mx-auto mb-6 max-w-2xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-3">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            검색 결과 {results.length > 0 && `(${results.length})`}
          </h2>
          {results.length === 0 && !searching ? (
            <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">
              검색어를 입력하면 결과가 여기에 표시됩니다.
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((item) => (
                <SearchResult
                  key={`${item.mbid || "x"}-${item.deezer_id || item.title}`}
                  item={item}
                  active={selected?.title === item.title && selected?.artist === item.artist}
                  onSelect={loadDetail}
                />
              ))}
            </div>
          )}
        </aside>

        <main>
          <TrackDetail
            detail={detail}
            loading={loadingDetail}
            onSimilarSelect={handleSimilarSelect}
          />
        </main>
      </div>
    </div>
  );
}
