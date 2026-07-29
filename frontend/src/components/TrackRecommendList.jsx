import React from "react";

function Cover({ src }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-zinc-900/5 dark:ring-white/10"
      />
    );
  }
  return (
    <div className="h-[72px] w-[72px] shrink-0 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
  );
}

function GenreTag({ label }) {
  return (
    <span className="inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent dark:text-violet-200">
      {label}
    </span>
  );
}

function ExternalLink({ href, label, variant }) {
  const styles =
    variant === "spotify"
      ? "border-[#1DB954]/30 bg-[#1DB954]/10 text-[#1a8f42] hover:bg-[#1DB954]/15 dark:text-[#1ed760]"
      : "border-red-500/25 bg-red-500/10 text-red-600 hover:bg-red-500/15 dark:text-red-400";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${styles}`}
    >
      {label}
    </a>
  );
}

function getGenreTags(track) {
  if (track.genre_tags?.length) return track.genre_tags;
  return [];
}

function getStreamingLinks(track) {
  const q = encodeURIComponent(`${track.artist || ""} ${track.title || ""}`.trim());
  const spotify =
    track.spotify_url ||
    (track.spotify_id ? `https://open.spotify.com/track/${track.spotify_id}` : `https://open.spotify.com/search/${q}`);
  const youtube =
    track.youtube_url ||
    (track.yt_video_id
      ? `https://www.youtube.com/watch?v=${track.yt_video_id}`
      : `https://www.youtube.com/results?search_query=${q}`);
  return { spotify, youtube };
}

export function TrackRecommendRow({ track, onSelect, showReason = false }) {
  const similarity = track.similarity ?? track.genre_similarity ?? 0;
  const reasons = track.reasons?.length
    ? track.reasons
    : track.reason
      ? [track.reason]
      : [];
  const genreTags = getGenreTags(track);
  const links = getStreamingLinks(track);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(track)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(track);
        }
      }}
      className="group cursor-pointer rounded-2xl border border-zinc-900/10 bg-white p-3 transition hover:border-accent/30 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-accent/35 dark:hover:bg-white/[0.06]"
    >
      <div className="flex gap-3">
        <Cover src={track.cover} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-zinc-900 group-hover:text-accent dark:text-white dark:group-hover:text-accent">
                {track.title}
              </h3>
              <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{track.artist}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold tabular-nums text-accent">{similarity}%</p>
              <p className="text-[10px] text-zinc-400">유사도</p>
            </div>
          </div>

          {genreTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {genreTags.slice(0, 5).map((tag) => (
                <GenreTag key={tag} label={tag} />
              ))}
            </div>
          )}

          {showReason && reasons.length > 0 && (
            <div className="mt-2.5">
              <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">추천 이유</p>
              <ul className="mt-1 space-y-0.5">
                {reasons.slice(0, 3).map((reason) => (
                  <li key={reason} className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-300">
                    <span className="text-accent">✓</span> {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <ExternalLink href={links.spotify} label="Spotify" variant="spotify" />
            <ExternalLink href={links.youtube} label="YouTube" variant="youtube" />
            {track.duration && (
              <span className="ml-auto text-[10px] text-zinc-400">{track.duration}</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function TrackRecommendList({ tracks, onSelect, showReason = false, className = "" }) {
  if (!tracks?.length) return null;

  return (
    <div className={`space-y-2.5 ${className}`}>
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
