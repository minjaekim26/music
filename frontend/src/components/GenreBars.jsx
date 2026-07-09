export default function GenreBars({ genres, title = "장르 유사도", onGenreClick, selectedGenre }) {
  if (!genres?.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-zinc-300">{title}</h4>
        {onGenreClick && (
          <span className="text-[11px] text-zinc-500">클릭하면 해당 장르 추천</span>
        )}
      </div>
      <div className="space-y-2">
        {genres.map((g) => {
          const active = selectedGenre === g.name;
          const Wrapper = onGenreClick ? "button" : "div";
          return (
            <Wrapper
              key={g.id}
              type={onGenreClick ? "button" : undefined}
              onClick={onGenreClick ? () => onGenreClick(g.name) : undefined}
              className={`w-full space-y-1 rounded-xl p-2 text-left transition ${
                onGenreClick ? "hover:bg-white/5" : ""
              } ${active ? "bg-accent/15 ring-1 ring-accent/40" : ""}`}
            >
              <div className="flex items-center justify-between text-xs">
                <span className={`font-medium ${active ? "text-accent" : "text-zinc-200"}`}>
                  {g.name}
                </span>
                <span className="tabular-nums text-zinc-400">{g.similarity}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${g.similarity}%`,
                    background: `linear-gradient(90deg, ${g.color}88, ${g.color})`,
                  }}
                />
              </div>
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}

export function SimilarityBadge({ value, label = "유사도" }) {
  const pct = Number(value) || 0;
  const color = pct >= 75 ? "#4ade80" : pct >= 50 ? "#facc15" : "#fb923c";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
