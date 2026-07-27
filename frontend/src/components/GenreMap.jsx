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
  const { nodes, matchedGenres, bounds, subgenre_nodes: subgenreNodes } = genreMap || {};
  const matched = matchedGenres || genreMap?.matched_genres || [];

  const displayNodes = useMemo(() => {
    // 곡 장르의 하위 장르 포커스 맵 (백엔드에서 계산)
    if (subgenreNodes?.length) {
      return subgenreNodes;
    }

    if (!nodes?.length) return [];
    if (!trackPosition) return nodes.filter((n) => (n.fontSize || 0) >= 120).slice(0, 400);

    // fallback: 매칭 장르 + 자식 장르
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const merged = new Map();

    for (const g of matched) {
      const full = byId.get(g.id);
      if (!full) continue;
      merged.set(full.id, full);
      const children = full.children || [];
      if (children.length) {
        for (const cid of children) {
          const child = byId.get(cid);
          if (child) merged.set(child.id, child);
        }
      } else if (full.parentId) {
        const parent = byId.get(full.parentId);
        if (parent) {
          merged.set(parent.id, parent);
          for (const cid of parent.children || []) {
            const sib = byId.get(cid);
            if (sib) merged.set(sib.id, sib);
          }
        }
      }
    }

    if (merged.size > 0) {
      return [...merged.values()].slice(0, 120);
    }

    const radius = 120;
    return nodes.filter((node) => {
      const dx = node.x - trackPosition.x;
      const dy = node.y - trackPosition.y;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });
  }, [nodes, trackPosition, matched, subgenreNodes]);

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
        <p className="mt-0.5 text-[11px] text-zinc-500">이 곡 장르의 하위 장르를 표시합니다</p>
      </div>

      <EveryNoiseMap
        nodes={displayNodes}
        bounds={bounds || DEFAULT_BOUNDS}
        trackPosition={trackPosition}
        matchedGenres={matched}
        height={420}
        showAll
      />
    </div>
  );
}
