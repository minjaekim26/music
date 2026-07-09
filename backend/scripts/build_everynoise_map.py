"""Build everynoise_genres.json from everynoise.com/engenremap.html."""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "everynoise_genres.json"
MAP_URL = "https://everynoise.com/engenremap.html"
UA = "Mozilla/5.0 (compatible; distribution-music/1.0)"


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_style(style: str) -> dict:
    out: dict[str, str | int | float] = {}
    for part in style.split(";"):
        part = part.strip()
        if not part or ":" not in part:
            continue
        key, val = part.split(":", 1)
        key, val = key.strip(), val.strip()
        if key == "color":
            out["color"] = val
        elif key == "left":
            out["left"] = int(re.sub(r"[^\d]", "", val) or 0)
        elif key == "top":
            out["top"] = int(re.sub(r"[^\d]", "", val) or 0)
        elif key == "font-size":
            out["fontSize"] = int(re.sub(r"[^\d]", "", val) or 100)
    return out


def infer_parent(child_id: str, all_ids: set[str]) -> str | None:
    child = child_id.lower()
    best: str | None = None
    best_len = 0
    padded = f" {child} "
    for candidate in all_ids:
        if candidate == child:
            continue
        token = f" {candidate} "
        if token in padded or child.startswith(candidate + " ") or child.endswith(" " + candidate):
            if len(candidate) > best_len:
                best = candidate
                best_len = len(candidate)
    return best


def main() -> None:
    print(f"Fetching {MAP_URL} ...")
    html = fetch(MAP_URL)

    pat = re.compile(
        r'<div id=item\d+[^>]*style="([^"]+)"[^>]*onclick="playx\([^,]+,\s*&quot;([^&]+)&quot;',
        re.I,
    )

    raw: list[dict] = []
    for style, name in pat.findall(html):
        meta = parse_style(style)
        if "left" not in meta or "top" not in meta:
            continue
        gid = name.strip().lower()
        raw.append(
            {
                "id": gid,
                "name": name.strip(),
                "left": meta["left"],
                "top": meta["top"],
                "color": meta.get("color", "#888888"),
                "fontSize": meta.get("fontSize", 100),
            }
        )

    # dedupe by id (keep first / largest font)
    by_id: dict[str, dict] = {}
    for node in raw:
        gid = node["id"]
        prev = by_id.get(gid)
        if not prev or node["fontSize"] > prev["fontSize"]:
            by_id[gid] = node

    nodes = list(by_id.values())
    all_ids = set(by_id.keys())

    min_left = min(n["left"] for n in nodes)
    max_left = max(n["left"] for n in nodes)
    min_top = min(n["top"] for n in nodes)
    max_top = max(n["top"] for n in nodes)
    width = max(max_left - min_left, 1)
    height = max(max_top - min_top, 1)

    parent_of: dict[str, str] = {}
    for node in nodes:
        gid = node["id"]
        parent = infer_parent(gid, all_ids)
        if parent:
            parent_of[gid] = parent
        node["x"] = round((node["left"] - min_left) / width * 1000, 1)
        node["y"] = round((node["top"] - min_top) / height * 1000, 1)
        node["parentId"] = parent
        del node["left"]
        del node["top"]

    children: dict[str, list[str]] = {}
    for gid, parent in parent_of.items():
        children.setdefault(parent, []).append(gid)
    for node in nodes:
        node["children"] = sorted(children.get(node["id"], []))

    payload = {
        "source": MAP_URL,
        "count": len(nodes),
        "bounds": {
            "width": width,
            "height": height,
            "minLeft": min_left,
            "maxLeft": max_left,
            "minTop": min_top,
            "maxTop": max_top,
        },
        "parentOf": parent_of,
        "nodes": sorted(nodes, key=lambda n: (-n["fontSize"], n["name"])),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT}: {len(nodes)} genres, {len(parent_of)} parent links")


if __name__ == "__main__":
    main()
