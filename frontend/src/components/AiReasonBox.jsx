import React from "react";
import InfoTooltip from "./InfoTooltip.jsx";
import { SIMILARITY_TOOLTIPS } from "../utils/similarityHelp.js";

const MODE_META = {
  taste: { emoji: "🎧", label: "AI 취향 큐레이션" },
  keywords: { emoji: "✨", label: "AI 키워드 추천" },
  track: { emoji: "🎵", label: "AI 추천 설명" },
  genre: { emoji: "🗺️", label: "AI 장르 추천" },
};

/** 긴 문장을 읽기 쉽게 2~3줄로 나눔 */
function splitSentences(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];

  const parts = trimmed
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [trimmed];
  return parts;
}

/** 「쿼리」로 시작하는 첫 문장은 살짝 강조 */
function ReasonLine({ text, lead }) {
  if (!lead || !text.startsWith("「")) {
    return (
      <p className="text-[15px] leading-[1.65] text-zinc-700 dark:text-zinc-100">{text}</p>
    );
  }

  const close = text.indexOf("」");
  if (close === -1) {
    return (
      <p className="text-[15px] leading-[1.65] text-zinc-700 dark:text-zinc-100">{text}</p>
    );
  }

  const quoted = text.slice(0, close + 1);
  const rest = text.slice(close + 1).trim();

  return (
    <p className="text-[15px] leading-[1.65] text-zinc-700 dark:text-zinc-100">
      <span className="font-semibold text-zinc-900 dark:text-white">{quoted}</span>
      {rest ? ` ${rest}` : null}
    </p>
  );
}

export default function AiReasonBox({ text, className = "", similarityMode = "track" }) {
  if (!text) return null;

  const meta = MODE_META[similarityMode] || MODE_META.track;
  const tooltip = SIMILARITY_TOOLTIPS[similarityMode] || SIMILARITY_TOOLTIPS.track;
  const lines = splitSentences(text);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/[0.08] via-white to-violet-500/[0.05] shadow-sm shadow-accent/5 dark:border-accent/30 dark:from-accent/12 dark:via-white/[0.03] dark:to-violet-500/[0.06] ${className}`}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-accent to-violet-500/80" aria-hidden />

      <div className="flex gap-3 px-4 py-3.5 pl-5">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-lg shadow-sm ring-1 ring-accent/15 dark:bg-white/10 dark:ring-accent/25"
          aria-hidden
        >
          {meta.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <p className="text-xs font-bold tracking-wide text-accent dark:text-violet-200">{meta.label}</p>
            <InfoTooltip text={tooltip} label="유사도 계산 방식" />
          </div>

          <div className="mt-2.5 space-y-2">
            {lines.map((line, i) => (
              <ReasonLine key={`${i}-${line.slice(0, 24)}`} text={line} lead={i === 0} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
