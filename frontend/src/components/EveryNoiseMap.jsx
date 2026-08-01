import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAD = 48;
const LOUPE_SIZE = 340;
const LOUPE_ZOOM = 2.0;
const LOUPE_RADIUS = 200;

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

const ZOOM_BTN =
  "rounded-lg border border-zinc-900/10 bg-white/90 px-2 py-1 text-xs text-zinc-700 shadow-sm dark:border-white/10 dark:bg-black/70 dark:text-zinc-200";

export default function EveryNoiseMap({
  nodes,
  bounds,
  viewBounds = null,
  selectedGenres = [],
  focusedId = null,
  trackPosition = null,
  matchedGenres = [],
  onSelect,
  height = 520,
  showAll = false,
  searchQuery = "",
  focusMode = false,
  fitToView = false,
}) {
  const containerRef = useRef(null);
  const loupeRafRef = useRef(0);
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 1, height: 1 });
  const [scale, setScale] = useState(1);
  const [loupe, setLoupe] = useState(null);

  const renderBounds = viewBounds || bounds;

  const toRenderPos = useCallback(
    (node) => {
      const { left, top } = nodePixelPos(node, bounds);
      return {
        left: left - (renderBounds?.minLeft ?? 0),
        top: top - (renderBounds?.minTop ?? 0),
      };
    },
    [bounds, renderBounds],
  );

  const canvasSize = useMemo(
    () => ({
      width: (renderBounds?.width || 1200) + PAD * 2,
      height: (renderBounds?.height || 12000) + PAD * 2,
    }),
    [renderBounds],
  );

  const scaledSize = useMemo(
    () => ({ width: canvasSize.width * scale, height: canvasSize.height * scale }),
    [canvasSize, scale],
  );

  const selection = useMemo(
    () => new Set((selectedGenres || []).map((g) => g.toLowerCase())),
    [selectedGenres],
  );
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

  // 한 패스: 반경 내 nearIds + 돋보기 노드
  const { nearIds, loupeNodes } = useMemo(() => {
    const ids = new Set();
    const scored = [];
    if (!loupe || !nodes?.length) return { nearIds: ids, loupeNodes: scored };

    for (const node of nodes) {
      const { left, top } = toRenderPos(node);
      const nx = left + PAD;
      const ny = top + PAD;
      const dist = Math.hypot(nx - loupe.hx, ny - loupe.hy);
      if (dist <= LOUPE_RADIUS) ids.add(node.id);
      if (dist > LOUPE_RADIUS * 1.9) continue;
      if (dist > LOUPE_RADIUS * 1.45 && (node.fontSize || 0) < 115) continue;
      scored.push({ node, dist });
    }
    scored.sort((a, b) => a.dist - b.dist || (b.node.fontSize || 0) - (a.node.fontSize || 0));
    return { nearIds: ids, loupeNodes: scored.slice(0, 72) };
  }, [loupe, nodes, toRenderPos]);

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
        nearIds.has(node.id) ||
        (node.fontSize || 0) >= 130;
      return inView || important;
    });
  }, [
    nodes,
    viewport,
    scale,
    selection,
    focusedId,
    matchedIds,
    nearIds,
    showAll,
    searchLower,
    toRenderPos,
  ]);

  const trackPx = useMemo(() => {
    if (!trackPosition) return null;
    const { left, top } = nodePixelPos({ x: trackPosition.x, y: trackPosition.y }, bounds);
    return {
      left: left - (renderBounds?.minLeft ?? 0) + PAD,
      top: top - (renderBounds?.minTop ?? 0) + PAD,
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

    const el = containerRef.current;
    const margin = 32;
    const nextScale = Math.max(
      0.55,
      +Math.min(
        (el.clientWidth - margin * 2) / Math.max(maxX - minX, 1),
        (el.clientHeight - margin * 2) / Math.max(maxY - minY, 1),
        1,
      ).toFixed(2),
    );
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

  const handleLoupeMove = useCallback((e) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hx = (cx + el.scrollLeft) / scale;
    const hy = (cy + el.scrollTop) / scale;
    if (loupeRafRef.current) cancelAnimationFrame(loupeRafRef.current);
    loupeRafRef.current = requestAnimationFrame(() => setLoupe({ cx, cy, hx, hy }));
  }, [scale]);

  const clearLoupe = useCallback(() => {
    if (loupeRafRef.current) cancelAnimationFrame(loupeRafRef.current);
    setLoupe(null);
  }, []);

  useEffect(
    () => () => {
      if (loupeRafRef.current) cancelAnimationFrame(loupeRafRef.current);
    },
    [],
  );

  function renderGenreLabel(node, { inLoupe = false, key } = {}) {
    const { left, top } = toRenderPos(node);
    const active = selection.has(node.id) || selection.has(node.name?.toLowerCase());
    const focused = focusedId === node.id;
    const matched = matchedIds.has(node.id);
    const near = nearIds.has(node.id);
    const baseSize = focusMode ? 12 : Math.max(11, Math.round((node.fontSize || 100) * 0.13));
    let size = matched && focusMode ? baseSize + 1 : baseSize;
    if (near && !inLoupe) size = Math.max(size, baseSize + 3);
    if (inLoupe) size = Math.max(14, Math.round((node.fontSize || 100) * 0.16) + 2);

    const hasChildren = (node.children?.length || 0) > 0;
    const searchHit = searchLower && node.name?.toLowerCase().includes(searchLower);
    const dimmed = searchLower && !searchHit && !near;
    const hot = active || focused || matched || searchHit || near;

    const pillClass = focusMode
      ? matched
        ? "rounded-md border border-accent/50 bg-accent/20 px-1.5 py-0.5 shadow-sm shadow-accent/20"
        : "rounded-md border border-zinc-900/10 bg-white/90 px-1.5 py-0.5 shadow-sm dark:border-white/15 dark:bg-black/60"
      : hot
        ? "rounded bg-white/90 px-0.5 dark:bg-black/50"
        : undefined;

    return (
      <div
        key={key || node.id}
        role={inLoupe ? undefined : "button"}
        tabIndex={inLoupe ? undefined : 0}
        onClick={inLoupe ? undefined : () => onSelect?.(node)}
        onKeyDown={
          inLoupe
            ? undefined
            : (e) => {
                if (e.key === "Enter" || e.key === " ") onSelect?.(node);
              }
        }
        className={`absolute whitespace-nowrap ${inLoupe ? "pointer-events-none" : "group cursor-pointer"} ${
          hot ? "z-30" : "z-10"
        }`}
        style={{
          left: left + PAD,
          top: top + PAD,
          color: node.color,
          fontSize: `${size}px`,
          fontWeight: hot ? 700 : focusMode ? 600 : 400,
          opacity: dimmed ? 0.18 : hot ? 1 : focusMode ? 0.92 : 0.85,
          textShadow:
            near || focusMode ? "0 1px 2px rgba(0,0,0,0.4), 0 0 10px rgba(0,0,0,0.25)" : undefined,
          transform: near && !inLoupe ? "scale(1.08)" : undefined,
          transformOrigin: "left center",
          transition: "transform 120ms ease, opacity 120ms ease, font-size 120ms ease",
        }}
        title={hasChildren ? `${node.name} — 클릭해 하위 장르 보기` : node.name}
      >
        <span className={pillClass}>{node.name}</span>
        {hasChildren && !focusMode && !inLoupe && (
          <span className="ml-0.5 text-teal-600 opacity-70 group-hover:opacity-100 dark:text-teal-400">
            »
          </span>
        )}
      </div>
    );
  }

  const loupeLeft = loupe
    ? Math.min(
        Math.max(8, loupe.cx - LOUPE_SIZE / 2),
        Math.max(8, (containerRef.current?.clientWidth || LOUPE_SIZE) - LOUPE_SIZE - 8),
      )
    : 0;
  const loupeTop = loupe
    ? Math.min(
        Math.max(8, loupe.cy - LOUPE_SIZE / 2 - 12),
        Math.max(8, (containerRef.current?.clientHeight || LOUPE_SIZE) - LOUPE_SIZE - 8),
      )
    : 0;

  return (
    <div className="relative min-w-0">
      <div className="absolute right-3 top-3 z-20 flex gap-1">
        <button type="button" onClick={() => setScale((s) => Math.min(2, +(s + 0.15).toFixed(2)))} className={ZOOM_BTN}>
          +
        </button>
        <button type="button" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.15).toFixed(2)))} className={ZOOM_BTN}>
          −
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg border border-zinc-900/10 bg-white/85 px-2 py-1 text-[10px] text-zinc-500 shadow-sm dark:border-white/10 dark:bg-black/70 dark:text-zinc-400">
        커서 위로 유사 장르 확대
      </p>

      <div
        ref={containerRef}
        className="cursor-crosshair overflow-x-auto overflow-y-auto bg-white dark:bg-[#0a0a0f]"
        style={{ height, maxWidth: "100%" }}
        onMouseMove={handleLoupeMove}
        onMouseLeave={clearLoupe}
      >
        <div style={{ width: scaledSize.width, height: scaledSize.height, position: "relative" }}>
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
            <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
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

              {loupe && (
                <div
                  className="pointer-events-none absolute z-[5] rounded-full border border-accent/35 bg-accent/5"
                  style={{
                    left: loupe.hx - LOUPE_RADIUS,
                    top: loupe.hy - LOUPE_RADIUS,
                    width: LOUPE_RADIUS * 2,
                    height: LOUPE_RADIUS * 2,
                  }}
                />
              )}

              {visibleNodes.map((node) => renderGenreLabel(node))}

              {trackPx && (
                <div
                  className="pointer-events-none absolute z-40"
                  style={{ left: trackPx.left - 8, top: trackPx.top - 22 }}
                  title="현재 곡"
                >
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/50 bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 shadow-sm dark:text-violet-300">
                    ▲ 이 곡
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {loupe && loupeNodes.length > 0 && (
        <div
          className="pointer-events-none absolute z-50 overflow-hidden rounded-full border-[3px] border-white bg-white shadow-[0_8px_32px_rgba(0,0,0,0.28)] ring-1 ring-zinc-900/20 dark:border-zinc-200 dark:bg-[#0a0a0f] dark:ring-white/20"
          style={{ width: LOUPE_SIZE, height: LOUPE_SIZE, left: loupeLeft, top: loupeTop }}
        >
          <div
            className="absolute"
            style={{
              width: canvasSize.width,
              height: canvasSize.height,
              transform: `translate(${LOUPE_SIZE / 2 - loupe.hx * LOUPE_ZOOM}px, ${LOUPE_SIZE / 2 - loupe.hy * LOUPE_ZOOM}px) scale(${LOUPE_ZOOM})`,
              transformOrigin: "0 0",
            }}
          >
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(120,120,140,0.25) 1px, transparent 0)",
                backgroundSize: "28px 28px",
              }}
            />
            {loupeNodes.map(({ node }) =>
              renderGenreLabel(node, { inLoupe: true, key: `loupe-${node.id}` }),
            )}
          </div>
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: "radial-gradient(circle at 35% 28%, rgba(255,255,255,0.35), transparent 45%)",
            }}
          />
          <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-medium text-white/90">
            유사 장르 {nearIds.size}개
          </div>
        </div>
      )}
    </div>
  );
}
