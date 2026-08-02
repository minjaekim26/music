import React from "react";

export default function InfoTooltip({ text, label = "자세히" }) {
  if (!text) return null;

  return (
    <span className="group relative ml-1.5 inline-flex align-middle">
      <button
        type="button"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-accent/45 bg-accent/5 text-[10px] font-bold leading-none text-accent transition hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-label={label}
        title={text.replace(/\n/g, " ")}
      >
        ?
      </button>
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-50 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 whitespace-pre-line rounded-xl border border-zinc-900/10 bg-white px-3 py-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-zinc-600 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-300"
      >
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white dark:border-t-zinc-900" />
      </div>
    </span>
  );
}
