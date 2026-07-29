import React from "react";

export default function Hero() {
  return (
    <section className="animate-slide-up px-2 pb-8 pt-2 text-center md:pb-10 md:pt-4">
      <h1 className="font-display text-[1.75rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-white sm:text-4xl md:text-5xl md:leading-[1.15]">
        <span className="mr-2 inline-block" aria-hidden="true">
          🎧
        </span>
        Discover your next{" "}
        <span className="bg-gradient-to-r from-accent to-glow bg-clip-text text-transparent">
          favorite song
        </span>
      </h1>
    </section>
  );
}
