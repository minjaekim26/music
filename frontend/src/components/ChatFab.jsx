import React from "react";
import { goChat } from "../utils/nav.js";

export default function ChatFab() {
  return (
    <button
      type="button"
      onClick={goChat}
      aria-label="AI DJ 열기"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/35 ring-4 ring-accent/15 transition hover:scale-105 hover:shadow-xl hover:shadow-accent/40 active:scale-95 md:bottom-6 md:right-6"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    </button>
  );
}
