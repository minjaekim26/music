import React from "react";
import { SimilarityBadge } from "./GenreBars.jsx";

const BREAKDOWN_LABELS = {
  genre: "Genre",
  mood: "Mood",
  tempo: "Tempo",
  artist: "Artist",
  era: "Era",
};

function Cover({ src, size = "md" }) {
  const sizes = {
    sm: "h-12 w-12 rounded-lg",
    md: "h-14 w-14 rounded-xl",
    lg: "h-16 w-16 rounded-xl",
  };
  const cls = sizes[size] || sizes.md;

  if (src) {
    return <img src={src} alt="" className={`${cls} shrink-0 object-cover`} />;
  }
  return <div className={`${cls} shrink-0 bg-zinc-200 dark:bg-zinc-800`} />;
}

function SimilarityBreakdown({ breakdown }) {
  if (!breakdown) return null;

  const rows = Object.entries(BREAKDOWN_LABELS)
    .map(([key, label]) => ({ key, label, value: breakdown[key] }))
    .filter((row) => typeof row.value === "number" && row.value > 0);

  if (!rows.length) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">유사도 기준</p>
      {rows.map(({ key, label, value }) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">{label}</span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-accent/80"
              style={{ width: `${Math.min(100, value)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-500">{Math.round(value)}%</span>
        </div>
      ))}
    </div>
  );
}

export function TrackRecommendRow({ track, onSelect, showReason = false }) {
  const similarity = track.similarity ?? track.genre_similarity ?? 0;
  const reasons = track.reasons?.length
    ? track.reasons
    : track.reason
      ? [track.reason]
      : [];

  return (
    <button
      type="button"
      onClick={() => onSelect?.(track)}
      className="flex w-full items-start gap-3 rounded-xl border border-zinc-900/10 bg-white px-3 py-2.5 text-left transition hover:border-accent/30 hover:bg-zinc-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-accent/40 dark:hover:bg-white/[0.07]"
    >
      <Cover src={track.cover} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{track.title}</p>
        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{track.artist}</p>

        {showReason && track.similarity_breakdown && (
          <SimilarityBreakdown breakdown={track.similarity_breakdown} />
        )}

        {showReason && reasons.length > 0 && (
          <div className="mt-2">
            <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">추천 이유</p>
            <ul className="mt-1 space-y-0.5">
              {reasons.slice(0, 4).map((reason) => (
                <li key={reason} className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
                  <span className="text-accent">✓</span> {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {track.lastfm_match > 0 && (
          <div className="mt-1.5">
            <SimilarityBadge value={track.lastfm_match} label="청취 유사도" />
          </div>
        )}
      </div>
      <div className="shrink-0 pt-0.5 text-right">
        <p className="text-sm font-bold tabular-nums text-accent">{similarity}%</p>
        <p className="text-[10px] text-zinc-400">유사도</p>
      </div>
    </button>
  );
}

export function TrackRecommendList({ tracks, onSelect, showReason = false, className = "" }) {
  if (!tracks?.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      {tracks.map((track) => (
        <TrackRecommendRow
          key={`${track.deezer_id || track.mbid || track.title}-${track.artist}`}
          track={track}
          onSelect={onSelect}
          showReason={showReason}
        />
      ))}
    </div>
  );
}
