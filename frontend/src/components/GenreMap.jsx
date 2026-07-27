import React, { useMemo } from "react";
import EveryNoiseMap, { computeLocalBounds } from "./EveryNoiseMap.jsx";

const DEFAULT_BOUNDS = {
  width: 1200,
  height: 12000,
  minLeft: 0,
  minTop: 0,
};

function buildSubgenreNodes(nodes, matched, subgenreNodes) {
  if (subgenreNodes?.length) return subgenreNodes;

  if (!nodes?.length) return [];

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

  return merged.size > 0 ? [...merged.values()] : [];
}

export default function GenreMap({ genreMap }) {
  const trackPosition = genreMap?.track_position || genreMap?.trackPosition;
  const { nodes, matchedGenres, bounds, subgenre_nodes: subgenreNodes } = genreMap || {};
  const matched = matchedGenres || genreMap?.matched_genres || [];
  const sourceBounds = bounds || DEFAULT_BOUNDS;

  const { displayNodes, viewBounds, focusMode } = useMemo(() => {
    const rawNodes = buildSubgenreNodes(nodes, matched, subgenreNodes);

    if (!rawNodes.length) {
      if (!nodes?.length || !trackPosition) {
        return {
          displayNodes: nodes?.filter((n) => (n.fontSize || 0) >= 120).slice(0, 400) || [],
          viewBounds: null,
          focusMode: false,
        };
      }
      const radius = 120;
      const near = nodes.filter((node) => {
        const dx = node.x - trackPosition.x;
        const dy = node.y - trackPosition.y;
        return Math.sqrt(dx * dx + dy * dy) <= radius;
      });
      return {
        displayNodes: near,
        viewBounds: null,
        focusMode: false,
      };
    }

    const localBounds = computeLocalBounds(rawNodes, sourceBounds, 220, 900);

    return {
      displayNodes: rawNodes,
      viewBounds: localBounds,
      focusMode: true,
    };
  }, [nodes, trackPosition, matched, subgenreNodes, sourceBounds]);

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
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {focusMode ? "이 곡 장르 주변의 하위 장르" : "장르 위치"}
        </p>
        {focusMode && (
          <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-violet-700 dark:text-violet-300">
              <span className="text-violet-500">▲</span> 이 곡
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-accent">
              <span className="h-2 w-2 rounded-full bg-accent" />
              매칭 장르
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/10 px-2 py-0.5 text-zinc-600 dark:text-zinc-300">
              <span className="h-2 w-2 rounded-full border border-zinc-400" />
              하위 장르
            </span>
          </div>
        )}
      </div>

      <EveryNoiseMap
        nodes={displayNodes}
        bounds={sourceBounds}
        viewBounds={viewBounds}
        trackPosition={trackPosition}
        matchedGenres={matched}
        height={focusMode ? 440 : 420}
        showAll
        focusMode={focusMode}
        fitToView={focusMode}
      />
    </div>
  );
}
