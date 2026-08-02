export const COUNTRIES = [
  { id: "", label: "전체" },
  { id: "kr", label: "한국" },
  { id: "jp", label: "일본" },
  { id: "us", label: "미국" },
  { id: "uk", label: "영국" },
  { id: "fr", label: "프랑스" },
  { id: "br", label: "브라질" },
  { id: "mx", label: "멕시코" },
  { id: "latin", label: "라틴" },
];

export function countryLabel(id) {
  return COUNTRIES.find((c) => c.id === id)?.label || "전체";
}

export function genreMatchesCountry(genreName, countryId) {
  if (!countryId) return false;
  const hints = {
    kr: ["korean", "k-pop", "korea"],
    jp: ["japanese", "j-pop", "japan", "anison", "anime"],
    us: ["american"],
    uk: ["uk ", "british", "english"],
    fr: ["french", "francophone", "chanson"],
    br: ["brazilian", "brazil", "brasil", "sertanejo"],
    mx: ["mexican", "mexico", "musica mexicana", "norteno", "corrido"],
    latin: ["latin", "latino", "latina", "reggaeton", "urbano latino", "sierreno"],
  }[countryId];
  if (!hints) return false;
  const name = (genreName || "").toLowerCase();
  return hints.some((h) => (h.endsWith(" ") ? name.startsWith(h) : name.includes(h)));
}

/** 국가 선택 시 맵 미리보기: 해당 국가 장르를 앞에 두되, pop·jazz rap 등 공통 장르는 유지 */
export function sortNodesForCountryPreview(nodes, countryId) {
  if (!nodes?.length) return [];
  const globalTop = nodes.filter((n) => !n.parentId && (n.fontSize || 0) >= 118);
  if (!countryId) return globalTop;

  const countryTop = [...nodes]
    .filter((n) => genreMatchesCountry(n.name, countryId))
    .sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0))
    .slice(0, 40);

  const seen = new Set(countryTop.map((n) => n.id));
  const merged = [...countryTop];
  for (const n of globalTop) {
    if (!seen.has(n.id)) {
      merged.push(n);
      seen.add(n.id);
    }
  }
  return merged.slice(0, 80);
}
