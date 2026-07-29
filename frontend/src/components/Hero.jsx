import React from "react";

export default function Hero() {
  return (
    <section className="animate-slide-up px-4 pb-8 pt-4 text-center md:pb-12 md:pt-8">
      <h1 className="font-display mx-auto max-w-xl break-words text-3xl font-bold tracking-tight text-zinc-900 dark:text-white sm:text-4xl md:text-5xl" style={{ lineHeight: 1.3 }}>
        <span className="mr-2 inline-block align-middle" aria-hidden="true">
          🎧
        </span>
        <span className="inline">Discover your next </span>
        <span
          className="inline-block bg-gradient-to-r from-accent to-glow bg-clip-text text-transparent"
          style={{ paddingBottom: "0.2em", lineHeight: 1.4 }}
        >
          favorite song
        </span>
      </h1>
    </section>
  );
}
