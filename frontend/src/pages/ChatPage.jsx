import React, { useState } from "react";
import { goHome } from "../utils/nav.js";

const PLACEHOLDER_CHATS = [
  "밤에 듣기 좋은 인디 추천",
  "BTS와 비슷한 아티스트",
  "jazz rap이랑 k-pop 교집합",
];

const STARTER_PROMPTS = [
  "오늘 기분에 맞는 playlist 추천해줘",
  "1990년대 rock 중에서 숨은 명곡",
  "NewJeans랑 비슷한 분위기의 곡",
  "장르 맵에서 hyperpop 설명해줘",
];

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white text-zinc-900 dark:bg-ink dark:text-zinc-100">
      {/* Sidebar — ChatGPT-style */}
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
            className="flex w-full items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-700 transition hover:bg-white dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            <span className="text-lg leading-none">+</span>
            새 채팅
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            최근 (미리보기)
          </p>
          <ul className="space-y-0.5">
            {PLACEHOLDER_CHATS.map((title) => (
              <li key={title}>
                <button
                  type="button"
                  className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-zinc-600 hover:bg-white dark:text-zinc-400 dark:hover:bg-white/5"
                >
                  {title}
                </button>
              </li>
            ))}
          </ul>
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

      {/* Main */}
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
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">GPT-4o</span>
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
              OpenAI 연결 예정
            </span>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-8">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
              <img src="/logo.png" alt="" className="h-10 w-10 rounded-full object-contain" />
            </div>
            <h1 className="text-center text-2xl font-semibold text-zinc-800 dark:text-white">
              무엇을 도와드릴까요?
            </h1>
            <p className="mt-2 max-w-md text-center text-sm text-zinc-500 dark:text-zinc-400">
              음악 검색, 장르, 취향 추천을 대화로 물어볼 수 있는 AI 챗봇입니다.
              <br />
              <span className="text-accent">OpenAI API 연결은 다음 단계에서 구현됩니다.</span>
            </p>

            <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setDraft(prompt)}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm text-zinc-700 transition hover:border-accent/40 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:hover:border-accent/35"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-zinc-200 bg-white/80 px-4 py-4 backdrop-blur dark:border-white/10 dark:bg-ink/80">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white px-3 py-2 shadow-sm dark:border-white/15 dark:bg-[#14141c]">
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="메시지를 입력하세요… (챗봇 연결 전 — 미리보기 UI)"
                  className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  disabled
                />
                <button
                  type="button"
                  disabled
                  title="OpenAI 연결 후 사용 가능"
                  className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-200 text-zinc-400 dark:bg-white/10"
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
