import React, { useEffect, useState } from "react";

const STEPS = [
  { emoji: "🎵", label: "음악 데이터를 찾는 중..." },
  { emoji: "🎧", label: "장르 분석 중..." },
  { emoji: "✨", label: "추천 생성 중..." },
];

const STEP_INTERVAL_MS = 2200;
const SHOW_DELAY_MS = 450;

export default function LoadingSteps({ active, compact = false, className = "" }) {
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      setStepIndex(0);
      return undefined;
    }

    const showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    const stepTimer = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);

    return () => {
      clearTimeout(showTimer);
      clearInterval(stepTimer);
    };
  }, [active]);

  if (!active) return null;

  if (!visible) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (compact) {
    const current = STEPS[stepIndex];
    return (
      <div className={`px-4 py-5 ${className}`}>
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">
            {current.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{current.label}</p>
            <div className="mt-2 flex gap-1">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                    i <= stepIndex ? "bg-accent" : "bg-zinc-200 dark:bg-zinc-800"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-5 px-6 py-10 ${className}`}>
      <ul className="w-full max-w-xs space-y-3">
        {STEPS.map((step, i) => {
          const done = i < stepIndex;
          const current = i === stepIndex;

          return (
            <li
              key={step.label}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-500 ${
                current
                  ? "bg-accent/10 ring-1 ring-accent/25"
                  : done
                    ? "opacity-60"
                    : "opacity-35"
              }`}
            >
              <span className="text-lg" aria-hidden="true">
                {step.emoji}
              </span>
              <span
                className={`flex-1 text-sm ${
                  current
                    ? "font-medium text-zinc-800 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {step.label}
              </span>
              {done && (
                <span className="text-xs text-accent" aria-label="완료">
                  ✓
                </span>
              )}
              {current && (
                <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
