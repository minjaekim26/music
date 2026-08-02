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
  if (!countryId) return true;
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
  if (!hints) return true;
  const name = (genreName || "").toLowerCase();
  return hints.some((h) => (h.endsWith(" ") ? name.startsWith(h) : name.includes(h)));
}
