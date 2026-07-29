export function TasteProfileCard({ profile }) {
  if (!profile) return null;

  return (
    <div className="border-t border-zinc-900/10 bg-zinc-50/80 px-3 py-2.5 text-xs dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">AI 취향 분석</span>
        <span className="text-[10px] text-zinc-400">
          {profile.source === "llm" ? "LLM" : "규칙 매칭"}
        </span>
      </div>
      <div className="space-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
        {profile.mood?.length > 0 && (
          <p>
            <span className="text-zinc-500">mood:</span> {profile.mood.join(", ")}
          </p>
        )}
        {profile.genre?.length > 0 && (
          <p>
            <span className="text-zinc-500">genre:</span> {profile.genre.join(", ")}
          </p>
        )}
        {profile.tempo && (
          <p>
            <span className="text-zinc-500">tempo:</span> {profile.tempo}
          </p>
        )}
        {profile.keywords?.length > 0 && (
          <p>
            <span className="text-zinc-500">keywords:</span> {profile.keywords.join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
