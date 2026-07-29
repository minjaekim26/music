const TASTE_SIGNALS =
  /추천|좋은|느낌|분위기|듣기\s*좋|같은\s*노래|몽환|차분|신나|슬픈|밤에|혼자|잔잔|감성|편안|recommend|mood|vibe|feeling|for\s+(night|sleep|workout|studying)/i;

const TAG_WORDS = new Set([
  "dreamy",
  "indie",
  "ambient",
  "chill",
  "sad",
  "happy",
  "rock",
  "pop",
  "jazz",
  "electronic",
  "rnb",
  "soul",
  "folk",
  "metal",
  "punk",
  "house",
  "techno",
  "lofi",
  "lo-fi",
  "80s",
  "90s",
  "2000s",
  "slow",
  "fast",
  "calm",
  "emotional",
  "energetic",
  "alternative",
  "classical",
  "hip-hop",
  "hiphop",
]);

/**
 * 검색어 의도 분류
 * @returns {{ primary: 'catalog'|'taste'|'keywords', keywords: string[], label: string }}
 */
export function classifySearchQuery(query) {
  const q = query.trim();
  if (!q) {
    return { primary: "catalog", keywords: [], label: "곡 · 아티스트" };
  }

  const parts = q
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      primary: "keywords",
      keywords: parts,
      label: "키워드 추천",
    };
  }

  if (TASTE_SIGNALS.test(q)) {
    return { primary: "taste", keywords: [], label: "AI 취향 추천" };
  }

  const wordCount = q.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 4 && /[\uac00-\ud7a3]/.test(q)) {
    return { primary: "taste", keywords: [], label: "AI 취향 추천" };
  }

  const lower = q.toLowerCase();
  if (TAG_WORDS.has(lower)) {
    return {
      primary: "keywords",
      keywords: [lower],
      label: "키워드 추천",
    };
  }

  return { primary: "catalog", keywords: [], label: "곡 · 아티스트" };
}
