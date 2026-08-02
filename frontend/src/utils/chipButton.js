/** 토글 칩 버튼 — active면 accent 채움 + 흰 글자 */
export function chipButtonClass(active, { size = "sm", disabled = false } = {}) {
  const sizes = {
    xs: "px-2 py-0.5 text-[10px]",
    sm: "px-2.5 py-0.5 text-[11px]",
    md: "px-3 py-1 text-xs",
  };
  const pad = sizes[size] || sizes.sm;
  const base = `inline-flex items-center rounded-full border font-semibold transition ${pad}`;
  const idle =
    "border-zinc-300/80 text-zinc-600 hover:border-accent/55 hover:bg-accent/10 hover:text-accent " +
    "dark:border-white/15 dark:text-zinc-300 dark:hover:border-accent/50 dark:hover:bg-accent/15 dark:hover:text-violet-100";
  const on =
    "border-accent bg-accent text-white shadow-md shadow-accent/35 ring-2 ring-accent/25 " +
    "hover:border-accent hover:bg-accent hover:text-white " +
    "dark:border-accent dark:bg-accent dark:text-white dark:ring-accent/35";
  return `${base} ${active ? on : idle}${disabled ? " opacity-50 pointer-events-none" : ""}`;
}
