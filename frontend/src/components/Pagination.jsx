import React, { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE = 10;

export function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(0);

  const total = items?.length || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  useEffect(() => {
    setPage(0);
  }, [items, pageSize]);

  useEffect(() => {
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const slice = useMemo(() => {
    if (!items?.length) return [];
    const start = safePage * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    setPage,
    totalPages,
    total,
    slice,
    pageSize,
  };
}

export function PaginationBar({ page, totalPages, total, onPageChange }) {
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="px-2 py-1.5 text-center text-[11px] text-zinc-400">{total}개</p>
    ) : null;
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t border-zinc-900/10 px-2 py-2 dark:border-white/10">
      <button
        type="button"
        disabled={page <= 0}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-white/10"
      >
        이전
      </button>
      <span className="text-[11px] tabular-nums text-zinc-500">
        {page + 1} / {totalPages} · {total}개
      </span>
      <button
        type="button"
        disabled={page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
        className="rounded-lg px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-white/10"
      >
        다음
      </button>
    </div>
  );
}
