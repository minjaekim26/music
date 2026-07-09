import React, { useMemo } from "react";
import EveryNoiseMap from "./EveryNoiseMap.jsx";

const DEFAULT_BOUNDS = {
  width: 1200,
  height: 12000,
  minLeft: 0,
  minTop: 0,
};

export default function GenreMap({ genreMap }) {
  const trackPosition = genreMap?.track_position || genreMap?.trackPosition;
  const { nodes, matchedGenres, bounds } = genreMap || {};

  const displayNodes = useMemo(() => {
    if (!nodes?.length) return [];
    if (!trackPosition) return nodes.filter((n) => (n.fontSize || 0) >= 120).slice(0, 400);

    const radius = 120;
    const near = nodes.filter((node) => {
      const dx = node.x - trackPosition.x;
      const dy = node.y - trackPosition.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });

    const matchedIds = new Set((matchedGenres || []).map((g) => g.id));
    const merged = new Map();
    for (const n of near) merged.set(n.id, n);
    for (const g of matchedGenres || []) {
      const full = nodes.find((n) => n.id === g.id);
      if (full) merged.set(full.id, full);
    }
    for (const n of nodes) {
      if (matchedIds.has(n.id)) merged.set(n.id, n);
    }
    return merged.size > 0 ? [...merged.values()] : nodes.filter((n) => (n.fontSize || 0) >= 125).slice(0, 300);
  }, [nodes, trackPosition, matchedGenres]);

  if (!genreMap) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-zinc-900/10 bg-white text-sm text-zinc-500 shadow-sm dark:border-white/10 dark:bg-white/5">
        장르 맵 데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-[#07070d]">
      <div className="border-b border-zinc-900/10 px-4 py-2.5 dark:border-white/5">
        <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">장르 맵</h3>
      </div>

      <EveryNoiseMap
        nodes={displayNodes}
        bounds={bounds || DEFAULT_BOUNDS}
        trackPosition={trackPosition}
        matchedGenres={matchedGenres}
        height={420}
      />
    </div>
  );
}
