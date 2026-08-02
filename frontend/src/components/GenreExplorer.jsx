import React, { useEffect, useMemo, useState } from "react";
import EveryNoiseMap, { computeLocalBounds, normalizeNodesInBounds } from "./EveryNoiseMap.jsx";
import { PaginationBar, usePagination } from "./Pagination.jsx";
import CountryPicker from "./CountryPicker.jsx";
import { countryLabel } from "../utils/countries.js";

function scoreGenreSearchMatch(node, query, contextNode) {
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

  let spatialScore = 0;
  if (contextNode && contextNode.id !== node.id) {
    const dx = (node.x || 0) - (contextNode.x || 0);
    const dy = (node.y || 0) - (contextNode.y || 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    spatialScore = Math.max(0, 100 - dist / 4);
  }

  return textScore * 0.75 + popScore * 0.15 + spatialScore * 0.1;
}

export default function GenreExplorer({
  open,
  nodes,
  bounds,
  selectedGenres,
  selectedCountry,
  onCountryChange,
  onToggleGenre,
  onClose,
  onRecommend,
  loading,
}) {
  const [focusedId, setFocusedId] = useState(null);
  const [drillStack, setDrillStack] = useState([]);
  const [genreSearch, setGenreSearch] = useState("");
  const selection = selectedGenres || [];

  const byId = useMemo(() => new Map((nodes || []).map((n) => [n.id, n])), [nodes]);

  const drillRootId = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;
  const drillRoot = drillRootId ? byId.get(drillRootId) : null;
  const searchQuery = genreSearch.trim().toLowerCase();

  useEffect(() => {
    if (!open) {
      setFocusedId(null);
      setDrillStack([]);
      setGenreSearch("");
    }
  }, [open]);

  const basePool = useMemo(() => {
    if (!nodes?.length) return [];
    if (!drillRoot) return nodes;
    const childIds = drillRoot.children || [];
    const childNodes = childIds.map((id) => byId.get(id)).filter(Boolean);
    return childNodes.length > 0 ? [drillRoot, ...childNodes] : [drillRoot];
  }, [nodes, drillRoot, byId]);

  const searchMatches = useMemo(() => {
    if (!searchQuery) return null;
    return basePool
      .filter((n) => n.name.toLowerCase().includes(searchQuery))
      .map((n) => ({
        ...n,
        searchScore: Math.round(scoreGenreSearchMatch(n, searchQuery, drillRoot)),
      }))
      .sort(
        (a, b) =>
          b.searchScore - a.searchScore ||
          (b.fontSize || 0) - (a.fontSize || 0) ||
          a.name.localeCompare(b.name),
      );
  }, [searchQuery, basePool, drillRoot]);

  const activeSubset = useMemo(() => {
    if (searchMatches) return searchMatches;
    if (drillRoot) return basePool;
    return nodes || [];
  }, [searchMatches, drillRoot, basePool, nodes]);

  const displayNodes = useMemo(() => {
    if (!nodes?.length || !bounds) return nodes || [];
    if (!searchMatches && !drillRoot) return nodes;
    if (activeSubset.length === 0) return [];
    const local = computeLocalBounds(activeSubset, bounds);
    return normalizeNodesInBounds(activeSubset, bounds, local);
  }, [nodes, bounds, searchMatches, drillRoot, activeSubset]);

  const displayBounds = useMemo(() => {
    if (!bounds) return bounds;
    if (!searchMatches && !drillRoot) return bounds;
    if (activeSubset.length === 0) return bounds;
    const local = computeLocalBounds(activeSubset, bounds);
    return { ...local, minLeft: 0, minTop: 0 };
  }, [bounds, searchMatches, drillRoot, activeSubset]);

  const focusedNode = focusedId ? byId.get(focusedId) : drillRoot;

  const genreSearchPagination = usePagination(searchMatches || []);

  const subgenres = useMemo(() => {
    if (!focusedNode) return [];
    return (focusedNode.children || []).map((id) => byId.get(id)).filter(Boolean);
  }, [focusedNode, byId]);

  useEffect(() => {
    if (!searchQuery || !searchMatches?.length) return;
    setFocusedId(searchMatches[0].id);
  }, [searchQuery, searchMatches]);

  function drillInto(node) {
    if (!node?.children?.length) return;
    setGenreSearch("");
    setDrillStack((prev) => [...prev, node.id]);
    setFocusedId(node.id);
  }

  function drillToIndex(index) {
    if (index < 0) {
      setDrillStack([]);
      setFocusedId(null);
      return;
    }
    setDrillStack((prev) => {
      const next = prev.slice(0, index + 1);
      setFocusedId(next[index] ?? null);
      return next;
    });
  }

  function handleGenreClick(node) {
    const original = byId.get(node.id) || node;
    setFocusedId(original.id);
    onToggleGenre(original.name);
    if (original.children?.length > 0) {
      drillInto(original);
    }
  }

  function focusGenre(node) {
    const original = byId.get(node.id) || node;
    setFocusedId(original.id);
  }

  if (!open) return null;

  const mapHeight = Math.min(window.innerHeight * 0.58, 560);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      />

      <div className="absolute left-1/2 top-1/2 flex max-h-[92vh] w-[min(1200px,96vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-zinc-900/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0a0a12]">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-900/10 px-5 py-3 dark:border-white/5">
          <h3 className="shrink-0 font-display text-base font-semibold text-zinc-900 dark:text-white">
            {drillRoot ? drillRoot.name : "장르 맵"}
          </h3>
          <input
            type="search"
            value={genreSearch}
            onChange={(e) => setGenreSearch(e.target.value)}
            placeholder="장르 검색 — pop, rock, jazz…"
            className="min-w-0 flex-1 rounded-xl border border-zinc-900/10 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-accent/40 dark:border-white/10 dark:bg-black/30 dark:text-white"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-zinc-900/10 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/10"
          >
            닫기
          </button>
        </div>

        <div className="shrink-0 border-b border-zinc-900/10 px-4 py-2 dark:border-white/5">
          <CountryPicker compact value={selectedCountry} onChange={onCountryChange} />
          {selectedCountry && (
            <p className="mt-1 text-[10px] text-zinc-500">
              {countryLabel(selectedCountry)} 곡 위주 추천 · 맵은 모든 장르 선택 가능
            </p>
          )}
        </div>

        {drillStack.length > 0 && !searchQuery && (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-zinc-900/10 px-4 py-2 text-xs dark:border-white/5">
            <button
              type="button"
              onClick={() => drillToIndex(-1)}
              className="text-teal-600 hover:text-red-700 dark:text-teal-400"
            >
              전체 맵
            </button>
            {drillStack.map((id, i) => {
              const node = byId.get(id);
              if (!node) return null;
              return (
                <React.Fragment key={id}>
                  <span className="text-zinc-400">/</span>
                  <button
                    type="button"
                    onClick={() => drillToIndex(i)}
                    className={`hover:text-red-700 dark:hover:text-red-400 ${
                      i === drillStack.length - 1
                        ? "font-semibold text-zinc-800 dark:text-white"
                        : "text-teal-600 dark:text-teal-400"
                    }`}
                  >
                    {node.name}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1fr_280px]">
          <div className="relative min-h-0 min-w-0 border-b border-zinc-900/10 lg:border-b-0 lg:border-r dark:border-white/5">
            {!nodes?.length ? (
              <div className="flex items-center justify-center text-sm text-zinc-500" style={{ height: mapHeight }}>
                장르 맵 로딩 중...
              </div>
            ) : searchMatches && searchMatches.length === 0 ? (
              <div className="flex items-center justify-center text-sm text-zinc-500" style={{ height: mapHeight }}>
                검색 결과 없음
              </div>
            ) : (
              <EveryNoiseMap
                nodes={displayNodes}
                bounds={displayBounds}
                selectedGenres={selection}
                focusedId={focusedId}
                searchQuery={searchQuery}
                height={mapHeight}
                showAll={Boolean(drillRoot || searchMatches)}
                onSelect={handleGenreClick}
              />
            )}
          </div>

          <aside className="max-h-[min(60vh,600px)] space-y-3 overflow-y-auto px-4 py-4">
            {searchMatches && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500">
                  검색 결과 · {searchMatches.length} (유사도순)
                </h4>
                <div className="mt-2 space-y-1">
                  {genreSearchPagination.slice.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => focusGenre(node)}
                      onDoubleClick={() => handleGenreClick(node)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                        focusedId === node.id
                          ? "bg-accent/15 font-medium text-accent"
                          : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/10"
                      }`}
                    >
                      <span className="truncate" style={{ color: focusedId === node.id ? undefined : node.color }}>
                        {node.name}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
                        {node.searchScore}%
                      </span>
                    </button>
                  ))}
                </div>
                <PaginationBar
                  page={genreSearchPagination.page}
                  totalPages={genreSearchPagination.totalPages}
                  total={genreSearchPagination.total}
                  onPageChange={genreSearchPagination.setPage}
                />
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-200">선택</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selection.length === 0 ? (
                  <span className="text-sm text-zinc-400">—</span>
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
            </div>

            <button
              type="button"
              onClick={onRecommend}
              disabled={selection.length === 0 || loading}
              className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent"
            >
              {loading ? "불러오는 중…" : "모두 포함한 곡 추천받기"}
            </button>

            {!searchQuery && focusedNode && subgenres.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-zinc-500">
                  {focusedNode.name} 하위 · {subgenres.length}
                </h4>
                <div className="mt-2 flex max-h-36 flex-wrap gap-1 overflow-y-auto">
                  {subgenres.slice(0, 60).map((sg) => (
                    <button
                      key={sg.id}
                      type="button"
                      onClick={() => handleGenreClick(sg)}
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        selection.includes(sg.name)
                          ? "border-accent/50 bg-accent/15 text-accent"
                          : "border-zinc-900/10 text-zinc-600 dark:border-white/10 dark:text-zinc-300"
                      }`}
                    >
                      {sg.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
