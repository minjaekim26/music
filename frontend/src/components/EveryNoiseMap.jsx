import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAD = 48;

export function nodePixelPos(node, bounds) {
  const width = bounds?.width || 1000;
  const height = bounds?.height || 1000;
  const minLeft = bounds?.minLeft ?? 0;
  const minTop = bounds?.minTop ?? 0;
  return {
    left: minLeft + (node.x / 1000) * width,
    top: minTop + (node.y / 1000) * height,
  };
}

export function computeLocalBounds(nodes, sourceBounds, padding = 120, minSize = 400) {
  if (!nodes?.length) return sourceBounds;
  let minLeft = Infinity;
  let minTop = Infinity;
  let maxLeft = -Infinity;
  let maxTop = -Infinity;

  for (const node of nodes) {
    const { left, top } = nodePixelPos(node, sourceBounds);
    minLeft = Math.min(minLeft, left);
    minTop = Math.min(minTop, top);
    maxLeft = Math.max(maxLeft, left);
    maxTop = Math.max(maxTop, top);
  }

  const spanW = maxLeft - minLeft + padding * 2;
  const spanH = maxTop - minTop + padding * 2;
  const width = Math.max(spanW, minSize);
  const height = Math.max(spanH, minSize);
  const extraW = Math.max(0, width - spanW);
  const extraH = Math.max(0, height - spanH);

  return {
    minLeft: Math.max(0, minLeft - padding - extraW / 2),
    minTop: Math.max(0, minTop - padding - extraH / 2),
    maxLeft: maxLeft + padding + extraW / 2,
    maxTop: maxTop + padding + extraH / 2,
    width,
    height,
  };
}

export function normalizeNodesInBounds(nodes, sourceBounds, localBounds) {
  if (!localBounds || !sourceBounds) return nodes;
  const w = localBounds.width || 1;
  const h = localBounds.height || 1;
  const ox = localBounds.minLeft ?? 0;
  const oy = localBounds.minTop ?? 0;

  return nodes.map((node) => {
    const { left, top } = nodePixelPos(node, sourceBounds);
    return {
      ...node,
      x: ((left - ox) / w) * 1000,
      y: ((top - oy) / h) * 1000,
    };
  });
}

export default function EveryNoiseMap({
  nodes,
  bounds,
  viewBounds = null,
  selectedGenres = [],
  focusedId = null,
  trackPosition = null,
  matchedGenres = [],
  onSelect,
  onDrillDown,
  height = 520,
  showAll = false,
  searchQuery = "",
  focusMode = false,
  fitToView = false,
}) {
  const containerRef = useRef(null);
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [scale, setScale] = useState(1);

  const renderBounds = viewBounds || bounds;

  const toRenderPos = useCallback(
    (node) => {
      const { left, top } = nodePixelPos(node, bounds);
      const ox = renderBounds?.minLeft ?? 0;
      const oy = renderBounds?.minTop ?? 0;
      return { left: left - ox, top: top - oy };
    },
    [bounds, renderBounds],
  );

  const canvasSize = useMemo(() => {
    const w = (renderBounds?.width || 1200) + PAD * 2;
    const h = (renderBounds?.height || 12000) + PAD * 2;
    return { width: w, height: h };
  }, [renderBounds]);

  const scaledSize = useMemo(
    () => ({
      width: canvasSize.width * scale,
      height: canvasSize.height * scale,
    }),
    [canvasSize, scale],
  );

  const selection = useMemo(() => new Set((selectedGenres || []).map((g) => g.toLowerCase())), [selectedGenres]);
  const matchedIds = useMemo(() => new Set((matchedGenres || []).map((g) => g.id)), [matchedGenres]);
  const searchLower = (searchQuery || "").trim().toLowerCase();

  const updateViewport = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewport({
      left: el.scrollLeft,
      top: el.scrollTop,
      width: el.clientWidth,
      height: el.clientHeight,
    });
  }, []);

  useEffect(() => {
    updateViewport();
    const el = containerRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateViewport, { passive: true });
    const ro = new ResizeObserver(updateViewport);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateViewport);
      ro.disconnect();
    };
  }, [updateViewport, nodes, bounds, scale]);

  const visibleNodes = useMemo(() => {
    if (!nodes?.length) return [];
    if (showAll || nodes.length <= 300 || searchLower) return nodes;

    const margin = 200;
    const vLeft = viewport.left / scale - margin;
    const vTop = viewport.top / scale - margin;
    const vRight = (viewport.left + viewport.width) / scale + margin;
    const vBottom = (viewport.top + viewport.height) / scale + margin;

    return nodes.filter((node) => {
      const { left, top } = toRenderPos(node);
      const px = left + PAD;
      const py = top + PAD;
      const inView = px >= vLeft && px <= vRight && py >= vTop && py <= vBottom;
      const important =
        selection.has(node.id) ||
        selection.has(node.name?.toLowerCase()) ||
        focusedId === node.id ||
        matchedIds.has(node.id) ||
        (node.fontSize || 0) >= 130;
      return inView || important;
    });
  }, [nodes, bounds, viewport, scale, selection, focusedId, matchedIds, showAll, searchLower, toRenderPos]);

  const trackPx = useMemo(() => {
    if (!trackPosition) return null;
    const { left, top } = nodePixelPos({ x: trackPosition.x, y: trackPosition.y }, bounds);
    const ox = renderBounds?.minLeft ?? 0;
    const oy = renderBounds?.minTop ?? 0;
    return {
      left: left - ox + PAD,
      top: top - oy + PAD,
    };
  }, [trackPosition, bounds, renderBounds]);

  useEffect(() => {
    if (!focusedId || !containerRef.current) return;
    const node = nodes?.find((n) => n.id === focusedId);
    if (!node) return;
    const { left, top } = toRenderPos(node);
    const el = containerRef.current;
    el.scrollTo({
      left: Math.max(0, (left + PAD) * scale - el.clientWidth / 2),
      top: Math.max(0, (top + PAD) * scale - el.clientHeight / 2),
      behavior: "smooth",
    });
  }, [focusedId, nodes, scale, toRenderPos]);

  useEffect(() => {
    if (!fitToView || !containerRef.current || !nodes?.length) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const { left, top } = toRenderPos(node);
      const px = left + PAD;
      const py = top + PAD;
      minX = Math.min(minX, px - 60);
      minY = Math.min(minY, py - 12);
      maxX = Math.max(maxX, px + 120);
      maxY = Math.max(maxY, py + 20);
    }

    if (trackPx) {
      minX = Math.min(minX, trackPx.left - 40);
      minY = Math.min(minY, trackPx.top - 28);
      maxX = Math.max(maxX, trackPx.left + 80);
      maxY = Math.max(maxY, trackPx.top + 8);
    }

    const contentW = Math.max(maxX - minX, 1);
    const contentH = Math.max(maxY - minY, 1);
    const margin = 32;
    const el = containerRef.current;
    const fitScale = Math.min(
      (el.clientWidth - margin * 2) / contentW,
      (el.clientHeight - margin * 2) / contentH,
      1,
    );
    const nextScale = Math.max(0.55, +fitScale.toFixed(2));

    setScale(nextScale);

    const id = requestAnimationFrame(() => {
      el.scrollTo({
        left: Math.max(0, ((minX + maxX) / 2) * nextScale - el.clientWidth / 2),
        top: Math.max(0, ((minY + maxY) / 2) * nextScale - el.clientHeight / 2),
        behavior: "auto",
      });
    });
    return () => cancelAnimationFrame(id);
  }, [fitToView, nodes, trackPx, toRenderPos]);

  return (
    <div className="relative min-w-0">
      <div className="absolute right-3 top-3 z-20 flex gap-1">
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(2, +(s + 0.15).toFixed(2)))}
          className="rounded-lg border border-zinc-900/10 bg-white/90 px-2 py-1 text-xs text-zinc-700 shadow-sm dark:border-white/10 dark:bg-black/70 dark:text-zinc-200"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))}
          className="rounded-lg border border-zinc-900/10 bg-white/90 px-2 py-1 text-xs text-zinc-700 shadow-sm dark:border-white/10 dark:bg-black/70 dark:text-zinc-200"
        >
          −
        </button>
      </div>

      <div
        ref={containerRef}
        className="overflow-x-auto overflow-y-auto bg-white dark:bg-[#0a0a0f]"
        style={{ height, maxWidth: "100%" }}
      >
        <div
          style={{
            width: scaledSize.width,
            height: scaledSize.height,
            position: "relative",
          }}
        >
          <div
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            <div
              className="relative"
              style={{ width: canvasSize.width, height: canvasSize.height }}
            >
              {matchedGenres?.length > 0 && trackPx && (
                <svg
                  className="pointer-events-none absolute inset-0 overflow-visible"
                  width={canvasSize.width}
                  height={canvasSize.height}
                >
                  {matchedGenres.map((g) => {
                    const { left, top } = toRenderPos(g);
                    return (
                      <line
                        key={`line-${g.id}`}
                        x1={trackPx.left}
                        y1={trackPx.top}
                        x2={left + PAD}
                        y2={top + PAD}
                        stroke={g.color || "#7c5cff"}
                        strokeOpacity={Math.max(0.12, (g.similarity || 0) / 120)}
                        strokeWidth={1 + (g.similarity || 0) / 40}
                      />
                    );
                  })}
                </svg>
              )}

              {visibleNodes.map((node) => {
                const { left, top } = toRenderPos(node);
                const active = selection.has(node.id) || selection.has(node.name?.toLowerCase());
                const focused = focusedId === node.id;
                const matched = matchedIds.has(node.id);
                const baseSize = focusMode ? 12 : Math.max(11, Math.round((node.fontSize || 100) * 0.13));
                const size = matched && focusMode ? baseSize + 1 : baseSize;
                const hasChildren = (node.children?.length || 0) > 0;

                const searchHit = searchLower && node.name?.toLowerCase().includes(searchLower);
                const dimmed = searchLower && !searchHit;

                const pillClass = focusMode
                  ? matched
                    ? "rounded-md border border-accent/50 bg-accent/20 px-1.5 py-0.5 shadow-sm shadow-accent/20"
                    : "rounded-md border border-zinc-900/10 bg-white/90 px-1.5 py-0.5 shadow-sm dark:border-white/15 dark:bg-black/60"
                  : active || focused || searchHit
                    ? "rounded bg-white/90 px-0.5 dark:bg-black/50"
                    : undefined;

                return (
                  <div
                    key={node.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect?.(node)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelect?.(node);
                    }}
                    className={`group absolute cursor-pointer whitespace-nowrap ${
                      active || focused || matched || searchHit ? "z-30" : "z-10"
                    }`}
                    style={{
                      left: left + PAD,
                      top: top + PAD,
                      color: node.color,
                      fontSize: `${size}px`,
                      fontWeight: matched || active || focused || searchHit ? 700 : focusMode ? 600 : 400,
                      opacity: dimmed ? 0.2 : matched || active || focused ? 1 : focusMode ? 0.92 : 0.85,
                      textShadow: focusMode
                        ? "0 1px 2px rgba(0,0,0,0.35), 0 0 8px rgba(0,0,0,0.2)"
                        : undefined,
                    }}
                    title={hasChildren ? `${node.name} — 클릭해 하위 장르 보기` : node.name}
                  >
                    <span className={pillClass}>{node.name}</span>
                    {hasChildren && !focusMode && (
                      <span className="ml-0.5 text-teal-600 opacity-70 group-hover:opacity-100 dark:text-teal-400">
                        »
                      </span>
                    )}
                  </div>
                );
              })}

              {trackPx && (
                <div
                  className="pointer-events-none absolute z-40"
                  style={{ left: trackPx.left - 8, top: trackPx.top - 22 }}
                  title="현재 곡"
                >
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-violet-400/50 bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 shadow-sm dark:text-violet-300"
                  >
                    ▲ 이 곡
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
