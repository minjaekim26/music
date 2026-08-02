import React, { useEffect, useRef, useState } from "react";
import { goHome } from "../utils/nav.js";
import MusicNote3D from "../components/MusicNote3D.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "";

const STARTER_PROMPTS = [
  "비 오는 밤 혼자 듣기 좋은 잔잔한 노래",
  "hyperpop이 뭐야? 쉽게 설명해줘",
  "헤어진 직후 슬프지만 너무 발라드는 싫어",
  "친구들이랑 드라이브할 때 신나는 playlist",
];

const QUICK_SHORTCUTS = [
  { emoji: "🌧️", label: "비 오는 날 플레이리스트", query: "비 오는 날 창밖 보며 듣기 좋은 잔잔한 playlist" },
  { emoji: "🔥", label: "요즘 핫한 트랩", query: "요즘 가장 핫한 trap 장르 곡 추천해줘" },
  { emoji: "📚", label: "공부할 때 집중", query: "공부할 때 집중되는 lo-fi instrumental 느낌" },
  { emoji: "🌙", label: "밤 드라이브", query: "밤에 혼자 드라이브할 때 synthwave rnb 분위기" },
  { emoji: "💔", label: "이별 후 위로", query: "이별 직후 위로되는데 너무 발라드는 아닌 indie" },
  { emoji: "🎸", label: "k-indie 발견", query: "k-indie 중에서 요즘 숨은 명곡 큐레이션" },
  { emoji: "🗺️", label: "jazz rap 설명", query: "jazz rap 장르가 뭐야? 맵 기준으로 설명해줘" },
  { emoji: "⚡", label: "운동용 고에너지", query: "운동할 때 터지는 high energy hip hop" },
];

function newChatId() {
  return `chat-${Date.now()}`;
}

function ChatTrackCard({ track }) {
  const q = encodeURIComponent(`${track.artist || ""} ${track.title || ""}`.trim());
  const spotify = track.spotify_id
    ? `https://open.spotify.com/track/${track.spotify_id}`
    : `https://open.spotify.com/search/${q}`;

  return (
    <a
      href={spotify}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex gap-2.5 rounded-xl border border-zinc-200/80 bg-white p-2 transition hover:border-accent/40 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-accent/35"
    >
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
        {track.cover ? (
          <img src={track.cover} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">{track.title}</p>
        <p className="truncate text-[11px] text-zinc-500">{track.artist}</p>
        {track.genre_tags?.length > 0 && (
          <p className="mt-0.5 truncate text-[10px] text-accent">{track.genre_tags.slice(0, 2).join(" · ")}</p>
        )}
      </div>
      <span className="shrink-0 self-center text-xs font-bold tabular-nums text-accent">
        {Math.round(track.similarity ?? 0)}%
      </span>
    </a>
  );
}

function GenreBriefCard({ genre, onAsk }) {
  if (!genre?.name) return null;
  const rows = [
    genre.parent_name && { label: "상위", items: [genre.parent_name] },
    genre.children?.length && { label: "하위", items: genre.children.slice(0, 5) },
    genre.nearby?.length && { label: "인근", items: genre.nearby.slice(0, 4) },
  ].filter(Boolean);

  return (
    <div className="mt-2 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">장르 맵</p>
      <p className="mt-0.5 text-sm font-semibold" style={{ color: genre.color || undefined }}>
        {genre.name}
      </p>
      {rows.map((row) => (
        <div key={row.label} className="mt-2">
          <p className="text-[10px] text-zinc-500">{row.label}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {row.items.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onAsk?.(`${g} 장르 설명해줘`)}
                className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] text-zinc-600 hover:border-accent/40 hover:text-accent dark:border-white/10 dark:text-zinc-300"
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const COUNTRY_CHIP: Record<string, string> = {
  kr: "🇰🇷 한국",
  jp: "🇯🇵 일본",
  us: "🇺🇸 미국",
  uk: "🇬🇧 영국",
  fr: "🇫🇷 프랑스",
  br: "🇧🇷 브라질",
  mx: "🇲🇽 멕시코",
  latin: "🌎 라틴",
};

function TasteChips({ profile, keywords, country }) {
  const chips = [];
  const cid = country || profile?.country;
  if (cid && COUNTRY_CHIP[cid]) {
    chips.push({ label: COUNTRY_CHIP[cid], kind: "country" });
  }
  if (keywords?.length) {
    keywords.slice(0, 5).forEach((k) => chips.push({ label: k, kind: "kw" }));
  } else {
    chips.push(
      ...(profile?.mood || []).map((m) => ({ label: m, kind: "mood" })),
      ...(profile?.genre || []).map((g) => ({ label: g, kind: "genre" })),
      ...(profile?.tempo ? [{ label: profile.tempo, kind: "tempo" }] : []),
    );
  }
  if (!chips.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={`${c.kind}-${c.label}`}
          className={`rounded-full border px-2 py-0.5 text-[10px] ${
            c.kind === "country"
              ? "border-teal-500/40 bg-teal-500/10 font-semibold text-teal-700 dark:text-teal-300"
              : "border-accent/25 bg-accent/10 text-accent dark:text-violet-200"
          }`}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState("");
  const [pulseKey, setPulseKey] = useState(0);
  const [chatId, setChatId] = useState(newChatId);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function bumpNote() {
    setPulseKey((k) => k + 1);
  }

  function startNewChat() {
    setMessages([]);
    setDraft("");
    setError("");
    setChatId(newChatId());
    setPulseKey(0);
  }

  async function sendMessage(text) {
    const content = (text ?? draft).trim();
    if (!content || loading) return;

    setError("");
    setDraft("");
    const userMsg = { role: "user", content };
    const apiMessages = [...messages, userMsg].map(({ role, content: c }) => ({ role, content: c }));
    setMessages((prev) => [...prev, userMsg]);
    bumpNote();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "AI DJ 요청에 실패했습니다.");
      }
      setModel(data.model || "");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          mode: data.mode || "taste",
          genre: data.genre,
          tracks: data.tracks || [],
          tasteProfile: data.taste_profile,
          keywords: data.keywords_used,
          country: data.country,
          matchedGenres: data.matched_genres,
        },
      ]);
      bumpNote();
    } catch (err) {
      setError(err.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const empty = messages.length === 0 && !loading;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white text-zinc-900 dark:bg-ink dark:text-zinc-100">
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 flex w-[min(16rem,85vw)] flex-col border-r border-zinc-200 bg-zinc-50 transition-transform md:static md:translate-x-0 dark:border-white/10 dark:bg-[#0d0d12]`}
      >
        <div className="flex items-center gap-2 border-b border-zinc-200 p-3 dark:border-white/10">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-full object-contain" />
          <div>
            <span className="font-display text-sm font-bold">AI DJ</span>
            <p className="text-[10px] text-zinc-500">distribution</p>
          </div>
        </div>

        <div className="p-2">
          <button
            type="button"
            onClick={startNewChat}
            className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-700 transition hover:bg-white dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            <span className="text-lg leading-none">+</span>
            새 대화
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            이번 대화
          </p>
          <p className="truncate px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            {messages.find((m) => m.role === "user")?.content?.slice(0, 48) || "상황이나 기분을 말해 주세요"}
          </p>
        </div>

        <div className="border-t border-zinc-200 p-2 dark:border-white/10">
          <button
            type="button"
            onClick={goHome}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-white/5"
          >
            ← 탐색으로 돌아가기
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="사이드바 닫기"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b border-zinc-200 px-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 md:hidden dark:hover:bg-white/10"
              aria-label="메뉴"
            >
              ☰
            </button>
            <button
              type="button"
              onClick={goHome}
              className="hidden rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-accent md:inline"
            >
              ← distribution
            </button>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">AI DJ</span>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
              큐레이션 · 장르 · 바로가기
            </span>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto">
            {empty ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
                <MusicNote3D pulseKey={pulseKey} isThinking={loading} size="lg" />
                <h1 className="mt-6 text-center text-2xl font-semibold text-zinc-800 dark:text-white">
                  오늘 어떤 음악이 필요하세요?
                </h1>
                <p className="mt-2 max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
                  상황·기분·키워드를 모호하게 말해도 괜찮아요.
                  <br />
                  AI가 해석해서 곡과 장르를 바로 큐레이션해 드립니다.
                  <br />
                  장르 맵 질문(예: «hyperpop이 뭐야?»)도 OK.
                </p>
                <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                  {STARTER_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => sendMessage(prompt)}
                      disabled={loading}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm text-zinc-700 transition hover:border-accent/40 hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-accent/35"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
                {messages.map((msg, i) => (
                  <div
                    key={`${chatId}-${i}`}
                    className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    {msg.role === "assistant" ? (
                      <MusicNote3D pulseKey={pulseKey + i} isThinking={false} size="sm" />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        나
                      </div>
                    )}
                    <div className={`min-w-0 max-w-[90%] ${msg.role === "user" ? "text-right" : ""}`}>
                      <div
                        className={`inline-block rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-accent text-white"
                            : "bg-zinc-100 text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {msg.role === "assistant" && (
                        <>
                          {msg.mode === "genre" && msg.genre && (
                            <GenreBriefCard genre={msg.genre} onAsk={sendMessage} />
                          )}
                          {msg.mode !== "genre" && (
                            <TasteChips profile={msg.tasteProfile} keywords={msg.keywords} country={msg.country} />
                          )}
                          {msg.tracks?.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                                큐레이션 · {msg.tracks.length}곡
                              </p>
                              <div className="grid gap-1.5 sm:grid-cols-2">
                                {msg.tracks.map((t) => (
                                  <ChatTrackCard
                                    key={`${t.title}-${t.artist}`}
                                    track={t}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <MusicNote3D pulseKey={pulseKey} isThinking size="sm" />
                    <div className="rounded-2xl bg-zinc-100 px-4 py-3 dark:bg-white/10">
                      <p className="text-xs text-zinc-500">
                        {loading && messages.length === 0 ? "분석 중…" : "취향 분석 · 큐레이션 중…"}
                      </p>
                      <span className="mt-2 inline-flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:0ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:150ms]" />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-accent [animation-delay:300ms]" />
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {error && (
            <p className="shrink-0 px-4 py-2 text-center text-sm text-red-500">{error}</p>
          )}

          <div className="shrink-0 border-t border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-white/10 dark:bg-ink/80">
            <div className="mx-auto max-w-3xl">
              <div className="mb-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {QUICK_SHORTCUTS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    disabled={loading}
                    onClick={() => sendMessage(s.query)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-accent/45 hover:bg-white disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:border-accent/40"
                  >
                    <span aria-hidden>{s.emoji}</span>
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white px-3 py-2 shadow-sm focus-within:border-accent/50 dark:border-white/15 dark:bg-[#14141c]">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="상황·기분·장르를 편하게 말해 보세요…"
                  disabled={loading}
                  className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-400 disabled:opacity-60 dark:placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => sendMessage()}
                  disabled={loading || !draft.trim()}
                  className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition hover:opacity-90 disabled:bg-zinc-200 disabled:text-zinc-400 dark:disabled:bg-white/10"
                >
                  ↑
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-zinc-400">
                위 칩은 빠른 큐레이션 · 장르 설명은 «○○ 장르 설명해줘»로 물어보세요
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
