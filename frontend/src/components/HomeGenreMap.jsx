import React, { useEffect, useMemo, useState } from "react";
import EveryNoiseMap, { computeLocalBounds, normalizeNodesInBounds } from "./EveryNoiseMap.jsx";
import CountryPicker from "./CountryPicker.jsx";
import { countryLabel, sortNodesForCountryPreview } from "../utils/countries.js";

function scoreMatch(node, query) {
  const name = node.name.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  let textScore = 0;
  if (name === q) textScore = 100;
  else if (name.startsWith(q)) textScore = 92;
  else if (name.split(/\s+/).some((w) => w.startsWith(q))) textScore = 86;
  else if (name.includes(` ${q}`) || name.includes(`${q} `)) textScore = 80;
  else if (name.includes(q)) textScore = 72;

  if (name.includes(q)) {
    textScore += Math.max(0, 8 - (name.length - q.length) * 0.12);
  }

  const popScore = Math.min(100, ((node.fontSize || 100) / 160) * 100);
  return textScore * 0.85 + popScore * 0.15;
}

export default function HomeGenreMap({
  nodes,
  bounds,
  selectedGenres,
  selectedCountry,
  onCountryChange,
  onToggleGenre,
  onOpenFull,
  onRecommend,
  loading,
  onClearRecommendations,
}) {
  const [genreSearch, setGenreSearch] = useState("");
  const selection = selectedGenres || [];
  const searchQuery = genreSearch.trim().toLowerCase();

  const previewNodes = useMemo(
    () => sortNodesForCountryPreview(nodes, selectedCountry),
    [nodes, selectedCountry],
  );

  const searchMatches = useMemo(() => {
    if (!searchQuery || !nodes?.length) return null;
    return nodes
      .filter((n) => n.name.toLowerCase().includes(searchQuery))
      .map((n) => ({
        ...n,
        searchScore: Math.round(scoreMatch(n, searchQuery)),
      }))
      .sort(
        (a, b) =>
          b.searchScore - a.searchScore ||
          (b.fontSize || 0) - (a.fontSize || 0) ||
          a.name.localeCompare(b.name),
      );
  }, [searchQuery, nodes]);

  useEffect(() => {
    if (!onClearRecommendations) return;
    const q = genreSearch.trim();
    if (q && searchMatches && searchMatches.length === 0) {
      onClearRecommendations();
    }
  }, [genreSearch, searchMatches, onClearRecommendations]);

  const { displayNodes, displayBounds } = useMemo(() => {
    if (!nodes?.length) return { displayNodes: [], displayBounds: bounds };
    if (!searchMatches) {
      return { displayNodes: previewNodes, displayBounds: bounds };
    }
    if (searchMatches.length === 0) {
      return { displayNodes: [], displayBounds: bounds };
    }
    const subset = searchMatches.slice(0, 80);
    if (!bounds) return { displayNodes: subset, displayBounds: bounds };
    const local = computeLocalBounds(subset, bounds);
    return {
      displayNodes: normalizeNodesInBounds(subset, bounds, local),
      displayBounds: { ...local, minLeft: 0, minTop: 0 },
    };
  }, [nodes, bounds, searchMatches, previewNodes]);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900/10 px-4 py-3 dark:border-white/10">
        <div>
          <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">장르 맵</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {selectedCountry
              ? `${countryLabel(selectedCountry)} 곡 위주 추천 · 맵은 모든 장르 선택 가능`
              : "여러 장르를 고르면 모두 포함된 곡만 추천합니다"}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenFull}
          className="rounded-xl border border-zinc-900/10 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10"
        >
          전체 맵 열기
        </button>
      </div>

      <div className="border-b border-zinc-900/10 px-3 py-2 dark:border-white/10">
        <CountryPicker compact value={selectedCountry} onChange={onCountryChange} />
      </div>

      <div className="border-b border-zinc-900/10 px-3 py-2 dark:border-white/10">
        <input
          type="search"
          value={genreSearch}
          onChange={(e) => setGenreSearch(e.target.value)}
          placeholder="장르 검색 — pop, rock, jazz, k-pop…"
          className="w-full rounded-xl border border-zinc-900/10 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-accent/40 dark:border-white/10 dark:bg-black/30 dark:text-white dark:placeholder:text-zinc-500"
        />
      </div>

      {!nodes?.length ? (
        <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
          장르 맵 로딩 중...
        </div>
      ) : searchMatches && searchMatches.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
          ‘{genreSearch.trim()}’ 검색 결과 없음
        </div>
      ) : (
        <EveryNoiseMap
          nodes={displayNodes}
          bounds={displayBounds}
          selectedGenres={selection}
          searchQuery={searchQuery}
          focusedId={searchMatches?.[0]?.id}
          height={320}
          showAll
          fitToView
          onSelect={(node) => onToggleGenre(node.name)}
        />
      )}

      {searchMatches && searchMatches.length > 0 && (
        <div className="border-t border-zinc-900/10 px-3 py-2 dark:border-white/10">
          <p className="mb-1.5 text-[11px] text-zinc-500">
            검색 결과 · {searchMatches.length}
          </p>
          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {searchMatches.slice(0, 24).map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onToggleGenre(node.name)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${
                  selection.includes(node.name)
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-zinc-900/10 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
                }`}
              >
                {node.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-zinc-900/10 px-4 py-3 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500">선택</span>
          {selection.length === 0 ? (
            <span className="text-xs text-zinc-400">— 검색하거나 맵에서 장르를 클릭하세요</span>
          ) : (
            selection.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onToggleGenre(g)}
                className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-0.5 text-xs text-accent"
              >
                {g} ×
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={onRecommend}
          disabled={selection.length === 0 || loading}
          className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent"
        >
          {loading ? "불러오는 중…" : "모두 포함한 곡 추천받기"}
        </button>
      </div>
    </div>
  );
}
