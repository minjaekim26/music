import React from "react";

const SECTIONS = [
  {
    title: "distribution이란?",
    body: "장르 맵과 키워드로 음악을 탐색하고, 유사한 곡을 추천받을 수 있는 음악 탐색 앱입니다.",
  },
  {
    title: "곡 검색",
    body: "곡 제목이나 아티스트를 입력해 검색하세요. 결과를 클릭하면 장르 맵, 유사도, 추천곡을 볼 수 있습니다.",
  },
  {
    title: "Every Noise 장르 맵",
    body: "everynoise.com과 같은 스크롤형 장르 지도입니다. 장르를 클릭해 선택하고, »로 하위 장르를 탐색한 뒤 추천을 받을 수 있습니다. 최대 10개까지 선택 가능합니다.",
  },
  {
    title: "키워드 추천",
    body: "장르·무드·스타일 키워드를 추가하면 추천이 구체화됩니다. 쉼표로 여러 개를 한 번에 넣을 수 있습니다.",
    tips: [
      "키워드 1개 → 넓은 추천",
      "2~3개 → 점점 구체화",
      "4개 이상 → 맞춤 추천",
      "예시: dreamy, indie, chill, 80s, night",
    ],
  },
  {
    title: "곡 상세 화면",
    body: "장르 맵에서 ▲는 현재 곡 위치입니다. 장르 칩을 클릭하면 해당 스타일의 추천곡을 받을 수 있습니다.",
  },
  {
    title: "데이터 출처",
    body: "Last.fm · MusicBrainz · TheAudioDB · Deezer 데이터를 사용합니다. Last.fm API 키가 없으면 일부 기능이 제한될 수 있습니다.",
  },
];

export default function HelpPanel({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} role="presentation" />

      <div className="absolute left-1/2 top-1/2 max-h-[min(85vh,720px)] w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-zinc-900/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0a0a12]">
        <div className="flex items-center justify-between border-b border-zinc-900/10 px-5 py-4 dark:border-white/5">
          <h2 className="font-display text-lg font-semibold text-zinc-900 dark:text-white">도움말</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-900/10 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[calc(min(85vh,720px)-64px)] space-y-5 overflow-y-auto px-5 py-5">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{section.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{section.body}</p>
              {section.tips && (
                <ul className="mt-2 space-y-1 text-sm text-zinc-500 dark:text-zinc-500">
                  {section.tips.map((tip) => (
                    <li key={tip}>· {tip}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
