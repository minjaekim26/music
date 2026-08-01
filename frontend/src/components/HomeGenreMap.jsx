import React, { useMemo } from "react";
import EveryNoiseMap from "./EveryNoiseMap.jsx";

export default function HomeGenreMap({
  nodes,
  bounds,
  selectedGenres,
  onToggleGenre,
  onOpenFull,
  onRecommend,
  loading,
}) {
  const selection = selectedGenres || [];

  const previewNodes = useMemo(() => {
    if (!nodes?.length) return [];
    // 첫 화면: 상위·인기 장르만 보여 클릭 가능하게 유지
    return nodes.filter((n) => !n.parentId && (n.fontSize || 0) >= 118);
  }, [nodes]);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900/10 px-4 py-3 dark:border-white/10">
        <div>
          <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">장르 맵</h3>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            장르를 클릭해 선택한 뒤 추천받으세요
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

      {!nodes?.length ? (
        <div className="flex h-56 items-center justify-center text-sm text-zinc-500">
          장르 맵 로딩 중...
        </div>
      ) : (
        <EveryNoiseMap
          nodes={previewNodes}
          bounds={bounds}
          selectedGenres={selection}
          height={320}
          showAll
          fitToView
          onSelect={(node) => onToggleGenre(node.name)}
        />
      )}

      <div className="space-y-3 border-t border-zinc-900/10 px-4 py-3 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-500">선택</span>
          {selection.length === 0 ? (
            <span className="text-xs text-zinc-400">— 맵에서 장르를 클릭하세요</span>
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
          {loading ? "불러오는 중…" : "선택 장르로 추천받기"}
        </button>
      </div>
    </div>
  );
}
