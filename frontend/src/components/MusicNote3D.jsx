import React, { useId } from "react";

/** 2D 음표 아바타 — pulseKey마다 살짝 흔들림, thinking 중 부드러운 bob */
export default function MusicNote3D({ pulseKey = 0, isThinking = false, size = "md" }) {
  const gradId = useId().replace(/:/g, "");
  const dims = size === "sm" ? "h-10 w-10" : size === "lg" ? "h-28 w-28" : "h-16 w-16";
  const twist = ((pulseKey || 0) * 11) % 20 - 10;

  return (
    <div className={`${dims} flex shrink-0 items-center justify-center`} aria-hidden>
      <div
        key={pulseKey}
        className={`note-2d h-full w-full ${isThinking ? "note-2d-thinking" : ""} note-2d-nudge`}
        style={{ "--twist": `${twist}deg` }}
      >
        <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-md">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="50%" stopColor="#7c5cff" />
              <stop offset="100%" stopColor="#5b21b6" />
            </linearGradient>
          </defs>
          <ellipse cx="22" cy="50" rx="14" ry="11" fill={`url(#${gradId})`} />
          <rect x="30" y="8" width="5" height="44" rx="2" fill={`url(#${gradId})`} />
          <path
            d="M35 10 Q52 12 52 28 Q52 38 35 36"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
