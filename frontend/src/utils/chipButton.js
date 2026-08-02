/** 토글 칩 — active는 variant별 색, hover·scale 피드백 */
export function chipButtonClass(active, { size = "sm", disabled = false, variant = "default" } = {}) {
  const sizes = {
    xs: "px-2 py-0.5 text-[10px]",
    sm: "px-2.5 py-1 text-[11px]",
    md: "px-3 py-1.5 text-xs",
  };
  const pad = sizes[size] || sizes.sm;
  const base =
    "inline-flex items-center rounded-full border font-semibold transition " +
    "hover:scale-[1.03] active:scale-[0.98] " +
    `${pad}`;

  const idleByVariant = {
    default:
      "border-zinc-300/90 bg-white text-zinc-600 shadow-sm " +
      "hover:border-accent/60 hover:bg-accent/10 hover:text-accent hover:shadow-md hover:shadow-accent/10 " +
      "dark:border-white/20 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:border-accent/55 dark:hover:bg-accent/15 dark:hover:text-violet-100",
    country:
      "border-zinc-300/90 bg-zinc-50 text-zinc-600 shadow-sm " +
      "hover:border-teal-500/50 hover:bg-teal-500/10 hover:text-teal-700 " +
      "dark:border-white/20 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:border-teal-400/50 dark:hover:bg-teal-500/10 dark:hover:text-teal-200",
    genre:
      "border-zinc-300/90 bg-white text-zinc-600 shadow-sm " +
      "hover:border-accent/60 hover:bg-accent/10 hover:text-accent " +
      "dark:border-white/20 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:border-accent/55 dark:hover:bg-accent/15",
    search:
      "border-zinc-300/80 bg-zinc-50/80 text-zinc-600 " +
      "hover:border-accent/55 hover:bg-accent/10 hover:text-accent " +
      "dark:border-white/15 dark:bg-white/[0.03] dark:text-zinc-400 dark:hover:border-accent/50 dark:hover:bg-accent/12",
  };

  const onByVariant = {
    default:
      "border-accent bg-accent text-white shadow-lg shadow-accent/40 ring-2 ring-accent/30 ring-offset-1 ring-offset-white " +
      "hover:border-accent hover:bg-accent hover:text-white hover:scale-[1.03] " +
      "dark:ring-offset-[#0a0a12] dark:ring-accent/40",
    country:
      "border-teal-600 bg-teal-600 text-white shadow-lg shadow-teal-600/35 ring-2 ring-teal-500/30 ring-offset-1 ring-offset-white " +
      "hover:border-teal-600 hover:bg-teal-600 hover:text-white " +
      "dark:border-teal-500 dark:bg-teal-500 dark:ring-teal-400/35 dark:ring-offset-[#0a0a12]",
    genre:
      "border-accent bg-accent text-white shadow-lg shadow-accent/40 ring-2 ring-accent/30 ring-offset-1 ring-offset-white " +
      "hover:border-accent hover:bg-accent " +
      "dark:ring-offset-[#0a0a12]",
    search:
      "border-accent bg-accent text-white shadow-md shadow-accent/35 ring-2 ring-accent/25 " +
      "hover:border-accent hover:bg-accent",
  };

  const idle = idleByVariant[variant] || idleByVariant.default;
  const on = onByVariant[variant] || onByVariant.default;

  return `${base} ${active ? on : idle}${disabled ? " opacity-45 pointer-events-none grayscale-[0.2]" : ""}`;
}
