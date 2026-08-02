import React from "react";
import { COUNTRIES } from "../utils/countries.js";

export default function CountryPicker({ value, onChange, compact = false }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "py-1"}`}>
      {!compact && <span className="shrink-0 text-[11px] text-zinc-500">국가</span>}
      {COUNTRIES.map((c) => {
        const active = (value || "") === c.id;
        return (
          <button
            key={c.id || "all"}
            type="button"
            onClick={() => onChange(c.id)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
              active
                ? "border-accent/50 bg-accent/15 text-accent"
                : "border-zinc-900/10 text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
