import React from "react";
import { COUNTRIES } from "../utils/countries.js";
import { chipButtonClass } from "../utils/chipButton.js";

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
            className={chipButtonClass(active)}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
