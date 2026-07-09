import React, { useEffect, useState } from "react";
import { TrackRecommendList } from "./TrackRecommendList.jsx";
import { PaginationBar, usePagination } from "./Pagination.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function KeywordRecommend({ onSelectTrack }) {
  const [input, setInput] = useState("");
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function addKeyword(raw) {
    const parts = String(raw)
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    setKeywords((prev) => {
      const next = [...prev];
      for (const kw of parts) {
        if (next.length >= 12) break;
        if (next.some((k) => k.toLowerCase() === kw.toLowerCase())) continue;
        next.push(kw);
      }
      return next;
    });
    setInput("");
  }

  function removeKeyword(kw) {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  }

  useEffect(() => {
    if (keywords.length === 0) {
      setResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      keywords.forEach((k) => params.append("keywords", k));
      params.set("limit", "30");

      try {
        const res = await fetch(`${API_BASE}/api/recommend/keywords?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || "키워드 추천에 실패했습니다.");
        }
        setResult(await res.json());
      } catch (err) {
        setError(err.message || "키워드 추천 오류");
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [keywords]);

  const specificity = result?.specificity;
  const precision = specificity?.precision ?? 0;
  const hasActivity = keywords.length > 0 || result?.tracks?.length > 0;
  const showResults = keywords.length > 0 || loading || result?.tracks?.length > 0;
  const tracks = result?.tracks || [];
  const tracksPagination = usePagination(tracks);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-900/10 bg-white shadow-sm dark:border-white/10 dark:bg-white/5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addKeyword(input);
        }}
        className="p-2"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="키워드 추천 — dreamy, indie, 80s"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-white dark:placeholder:text-zinc-500"
          />
          <button
            type="submit"
            className="rounded-xl bg-zinc-900/5 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-900/10 dark:bg-white/10 dark:text-zinc-200"
          >
            추가
          </button>
        </div>
      </form>

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-900/10 px-3 py-2 dark:border-white/10">
          {keywords.map((kw) => (
            <button
              key={kw}
              type="button"
              onClick={() => removeKeyword(kw)}
              className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 text-xs text-accent dark:text-violet-200"
            >
              {kw} ×
            </button>
          ))}
        </div>
      )}

      {keywords.length > 0 && (
        <div className="flex items-center gap-3 border-t border-zinc-900/10 px-3 py-2 dark:border-white/10">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-900/5 dark:bg-white/5">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${precision}%` }}
            />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-zinc-500">
            {specificity?.label || "분석 중"}
          </span>
        </div>
      )}

      {specificity?.suggestions?.length > 0 && keywords.length < 4 && !loading && (
        <div className="flex flex-wrap gap-1.5 border-t border-zinc-900/10 px-3 py-2 dark:border-white/10">
          {specificity.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addKeyword(s)}
              className="rounded-full border border-zinc-900/10 px-2 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/10"
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      {showResults && (
        <div className="border-t border-zinc-900/10 dark:border-white/10">
          {error && <p className="px-3 py-2 text-sm text-red-600 dark:text-red-300">{error}</p>}

          {loading && (
            <p className="px-3 py-3 text-center text-xs text-zinc-400">추천 계산 중…</p>
          )}

          {!loading && tracks.length > 0 && (
            <div className="px-2 py-2">
              <p className="mb-1 px-1 text-[11px] text-zinc-400">유사도순</p>
              <TrackRecommendList tracks={tracksPagination.slice} onSelect={onSelectTrack} />
              <PaginationBar
                page={tracksPagination.page}
                totalPages={tracksPagination.totalPages}
                total={tracksPagination.total}
                onPageChange={tracksPagination.setPage}
              />
            </div>
          )}

          {result && tracks.length === 0 && !loading && hasActivity && (
            <p className="px-3 py-3 text-center text-xs text-zinc-400">결과 없음</p>
          )}
        </div>
      )}
    </div>
  );
}
