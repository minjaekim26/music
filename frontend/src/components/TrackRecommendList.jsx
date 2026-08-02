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
    <span className="inline-flex items-center rounded-full border border-zinc-200/80 bg-zinc-50 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-500">
      {label}
    </span>
  );
}

function StreamingButton({ href, label, variant }) {
  const styles =
    variant === "spotify"
      ? "border-[#1DB954]/40 bg-[#1DB954]/15 text-[#12803a] hover:bg-[#1DB954]/25 hover:shadow-md hover:shadow-[#1DB954]/20 dark:border-[#1DB954]/50 dark:bg-[#1DB954]/20 dark:text-[#1ed760]"
      : "border-red-500/35 bg-red-500/12 text-red-700 hover:bg-red-500/20 hover:shadow-md hover:shadow-red-500/15 dark:border-red-400/40 dark:bg-red-500/15 dark:text-red-300";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex min-w-[5.5rem] items-center justify-center rounded-xl border px-3.5 py-2 text-sm font-semibold transition hover:scale-[1.02] active:scale-[0.98] ${styles}`}
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
      className="group cursor-pointer rounded-2xl border border-zinc-900/10 bg-white p-3.5 transition hover:border-accent/35 hover:shadow-md hover:shadow-accent/5 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-accent/40 dark:hover:bg-white/[0.06]"
    >
      <div className="flex gap-3.5">
        <Cover src={track.cover} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base font-bold leading-snug text-zinc-900 group-hover:text-accent dark:text-white dark:group-hover:text-accent">
                {track.title}
              </h3>
              <p className="mt-0.5 truncate text-sm font-medium text-zinc-600 dark:text-zinc-300">{track.artist}</p>
            </div>
            <div className="shrink-0 rounded-xl bg-accent/10 px-2.5 py-1 text-right dark:bg-accent/15">
              <p className="text-lg font-bold tabular-nums leading-none text-accent">{similarity}%</p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                유사도
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StreamingButton href={links.spotify} label="Spotify" variant="spotify" />
            <StreamingButton href={links.youtube} label="YouTube" variant="youtube" />
            {track.duration && (
              <span className="ml-auto text-[10px] tabular-nums text-zinc-400">{track.duration}</span>
            )}
          </div>

          {(genreTags.length > 0 || (showReason && reasons.length > 0)) && (
            <div className="mt-2.5 space-y-1.5 border-t border-zinc-900/5 pt-2.5 dark:border-white/5">
              {genreTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {genreTags.slice(0, 5).map((tag) => (
                    <GenreTag key={tag} label={tag} />
                  ))}
                </div>
              )}
              {showReason && reasons.length > 0 && (
                <ul className="space-y-0.5">
                  {reasons.slice(0, 3).map((reason) => (
                    <li key={reason} className="text-[10px] leading-snug text-zinc-500 dark:text-zinc-500">
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
