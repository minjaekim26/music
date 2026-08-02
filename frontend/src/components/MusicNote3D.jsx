import React, { useMemo } from "react";

/**
 * CSS 3D 음표 — pulseKey가 바뀔 때마다 회전·기울기가 조금씩 변함.
 * isThinking: API 대기 중 부드러운 회전.
 */
export default function MusicNote3D({ pulseKey = 0, isThinking = false, size = "md" }) {
  const dims = size === "sm" ? "h-10 w-10" : size === "lg" ? "h-28 w-28" : "h-16 w-16";

  const pose = useMemo(() => {
    const k = pulseKey || 0;
    return {
      rx: 18 + (k % 5) * 7,
      ry: (k * 47) % 360,
      rz: -12 + (k % 6) * 5,
    };
  }, [pulseKey]);

  return (
    <div
      className={`note-scene ${dims} shrink-0`}
      aria-hidden
    >
      <div
        key={pulseKey}
        className={`note-body ${isThinking ? "note-thinking" : ""} note-nudge`}
        style={{
          "--rx": `${pose.rx}deg`,
          "--ry": `${pose.ry}deg`,
          "--rz": `${pose.rz}deg`,
        }}
      >
        <div className="note-face note-front">
          <svg viewBox="0 0 64 64" className="h-full w-full drop-shadow-lg">
            <defs>
              <linearGradient id="noteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="50%" stopColor="#7c5cff" />
                <stop offset="100%" stopColor="#5b21b6" />
              </linearGradient>
            </defs>
            <ellipse cx="22" cy="50" rx="14" ry="11" fill="url(#noteGrad)" />
            <rect x="30" y="8" width="5" height="44" rx="2" fill="url(#noteGrad)" />
            <path
              d="M35 10 Q52 12 52 28 Q52 38 35 36"
              fill="none"
              stroke="url(#noteGrad)"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="note-face note-back" />
        <div className="note-face note-side note-side-left" />
        <div className="note-face note-side note-side-right" />
      </div>
    </div>
  );
}
