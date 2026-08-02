import React from "react";
import { chipButtonClass } from "../utils/chipButton.js";

/** 장르 맵 하단 — 선택 칩 + 추천 CTA + 고정 안내 */
export default function GenreRecommendFooter({ selection = [], loading, onRecommend, onToggleGenre }) {
  const disabled = selection.length === 0 || loading;

  return (
    <div className="space-y-2.5">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          선택
        </h4>
        <div className="mt-1.5 flex min-h-[2.25rem] flex-wrap items-center gap-1.5">
          {selection.length === 0 ? (
            <span className="text-sm text-zinc-400">아직 없음</span>
          ) : (
            selection.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onToggleGenre(g)}
                className={chipButtonClass(true, { size: "md", variant: "genre" })}
              >
                {g} ×
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onRecommend}
          disabled={disabled}
          className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 disabled:opacity-100 dark:bg-accent dark:hover:bg-accent/90 dark:disabled:bg-accent/35"
        >
          {loading ? "불러오는 중…" : "모두 포함한 곡 추천받기"}
        </button>
        <p className="min-h-[2.5rem] text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          {disabled && !loading ? (
            <>검색하거나 맵에서 장르를 클릭하세요</>
          ) : selection.length > 0 ? (
            <>{selection.length}개 장르를 <strong className="font-semibold text-zinc-700 dark:text-zinc-200">모두 포함</strong>한 곡만 추천합니다</>
          ) : (
            "\u00a0"
          )}
        </p>
      </div>
    </div>
  );
}
