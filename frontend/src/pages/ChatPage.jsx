import React, { useEffect, useRef, useState } from "react";
import { goHome } from "../utils/nav.js";
import MusicNote3D from "../components/MusicNote3D.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "";

const STARTER_PROMPTS = [
  "오늘 기분에 맞는 playlist 추천해줘",
  "1990년대 rock 중에서 숨은 명곡",
  "NewJeans랑 비슷한 분위기의 곡",
  "hyperpop이랑 digicore 차이 설명해줘",
];

function newChatId() {
  return `chat-${Date.now()}`;
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
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    bumpNote();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "채팅 요청에 실패했습니다.");
      }
      setModel(data.model || "");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
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
          <span className="font-display text-sm font-bold">distribution AI</span>
        </div>

        <div className="p-2">
          <button
            type="button"
            onClick={startNewChat}
            className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-700 transition hover:bg-white dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            <span className="text-lg leading-none">+</span>
            새 채팅
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            현재 대화
          </p>
          <p className="truncate px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
            {messages.find((m) => m.role === "user")?.content?.slice(0, 40) || "새 대화"}
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
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-3 dark:border-white/10">
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
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {model || "GPT"}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              OpenAI
            </span>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto">
            {empty ? (
              <div className="flex flex-1 flex-col items-center justify-center px-4 py-8">
                <MusicNote3D pulseKey={pulseKey} isThinking={loading} size="lg" />
                <h1 className="mt-6 text-center text-2xl font-semibold text-zinc-800 dark:text-white">
                  무엇을 도와드릴까요?
                </h1>
                <p className="mt-2 max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
                  음악 검색, 장르, 취향·playlist 추천을 대화로 물어보세요.
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
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-accent text-white"
                          : "bg-zinc-100 text-zinc-800 dark:bg-white/10 dark:text-zinc-100"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <MusicNote3D pulseKey={pulseKey} isThinking size="sm" />
                    <div className="rounded-2xl bg-zinc-100 px-4 py-3 dark:bg-white/10">
                      <span className="inline-flex gap-1">
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

          <div className="shrink-0 border-t border-zinc-200 bg-white/80 px-4 py-4 backdrop-blur dark:border-white/10 dark:bg-ink/80">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white px-3 py-2 shadow-sm focus-within:border-accent/50 dark:border-white/15 dark:bg-[#14141c]">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="메시지를 입력하세요…"
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
                AI는 실수할 수 있습니다. 중요한 정보는 직접 확인하세요.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
