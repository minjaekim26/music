"""Every Noise genre map loaded from everynoise.com/engenremap.html data."""

from __future__ import annotations

import json
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parent / "data" / "everynoise_genres.json"

EXTRA_ALIASES: dict[str, str] = {
    "kpop": "k-pop",
    "k pop": "k-pop",
    "hip-hop": "hip hop",
    "hiphop": "hip hop",
    "rnb": "rhythm and blues",
    "r and b": "rhythm and blues",
    "r&b": "rhythm and blues",
    "electro": "electronic",
    "dance": "dance pop",
    "mainstream": "pop",
    "top 40": "pop",
    "synth pop": "synthpop",
    "electro pop": "electropop",
    "alt rock": "alternative rock",
    "indie": "indie rock",
    "lofi": "lo-fi",
    "lo fi": "lo-fi",
}


@lru_cache(maxsize=1)
def _load_dataset() -> dict[str, Any]:
    if not _DATA_PATH.exists():
        raise FileNotFoundError(
            f"Missing {_DATA_PATH}. Run backend/scripts/build_everynoise_map.py first."
        )
    with _DATA_PATH.open(encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _nodes_index() -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, str]]:
    data = _load_dataset()
    nodes = data["nodes"]
    by_id = {n["id"]: n for n in nodes}
    alias: dict[str, str] = {n["id"]: n["id"] for n in nodes}
    for n in nodes:
        alias[n["name"].lower()] = n["id"]
    for alias_key, target in EXTRA_ALIASES.items():
        if target in by_id:
            alias[alias_key] = target
    return nodes, by_id, alias


def get_map_bounds() -> dict[str, Any]:
    return dict(_load_dataset().get("bounds", {}))


def get_genre_map() -> list[dict[str, Any]]:
    nodes, _, _ = _nodes_index()
    children: dict[str, list[str]] = {}
    for n in nodes:
        parent = n.get("parentId")
        if parent:
            children.setdefault(parent, []).append(n["id"])

    return [
        {
            "id": n["id"],
            "name": n["name"],
            "x": n["x"],
            "y": n["y"],
            "color": n["color"],
            "fontSize": n.get("fontSize", 100),
            "parentId": n.get("parentId"),
            "children": sorted(children.get(n["id"], [])),
        }
        for n in nodes
    ]


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _match_genre_id(tag: str) -> str | None:
    _, by_id, alias = _nodes_index()
    norm = _normalize(tag)
    if norm in alias:
        return alias[norm]
    if norm in by_id:
        return norm
    for key, gid in alias.items():
        if key in norm or norm in key:
            return gid
    for gid in by_id:
        if gid in norm or norm in gid:
            return gid
    return None


def _is_ancestor(ancestor_id: str, child_id: str, by_id: dict[str, dict[str, Any]]) -> bool:
    current = by_id.get(child_id, {}).get("parentId")
    while current:
        if current == ancestor_id:
            return True
        current = by_id.get(current, {}).get("parentId")
    return False


def rollup_to_top_genre_id(genre_id: str) -> str:
    """Walk the parent chain to the topmost ancestor genre."""
    _, by_id, _ = _nodes_index()
    current = genre_id
    while True:
        parent = by_id.get(current, {}).get("parentId")
        if not parent:
            return current
        current = parent


def rollup_genre_scores(scores: dict[str, float]) -> dict[str, float]:
    """Merge scores from subgenres into their top-level ancestors."""
    rolled: dict[str, float] = {}
    for gid, score in scores.items():
        top = rollup_to_top_genre_id(gid)
        rolled[top] = rolled.get(top, 0.0) + float(score)
    return rolled


def rollup_genre_names(names: list[str]) -> list[str]:
    """Map tag names to top-level Every Noise genres, preserving order."""
    _, by_id, _ = _nodes_index()
    out: list[str] = []
    seen: set[str] = set()

    for name in names:
        gid = _match_genre_id(name)
        if gid:
            top = rollup_to_top_genre_id(gid)
            if top not in seen:
                seen.add(top)
                out.append(by_id[top]["name"])
        elif name not in seen:
            seen.add(name)
            out.append(name)
    return out


def filter_leaf_genre_ids(genre_ids: list[str]) -> list[str]:
    """Drop parent genres when a more specific child is also present."""
    _, by_id, _ = _nodes_index()
    unique = list(dict.fromkeys(genre_ids))
    known = [gid for gid in unique if gid in by_id]
    if not known:
        return unique

    leaves = [
        gid
        for gid in known
        if not any(
            other != gid and _is_ancestor(gid, other, by_id)
            for other in known
        )
    ]
    return leaves if leaves else known


def filter_leaf_genre_names(names: list[str]) -> list[str]:
    """Filter display names to leaf genres only, preserving order."""
    _, by_id, _ = _nodes_index()
    id_order: list[str] = []
    for name in names:
        gid = _match_genre_id(name)
        if gid and gid not in id_order:
            id_order.append(gid)

    leaf_ids = set(filter_leaf_genre_ids(id_order))
    out: list[str] = []
    seen: set[str] = set()

    for name in names:
        gid = _match_genre_id(name)
        if gid:
            if gid in leaf_ids and gid not in seen:
                seen.add(gid)
                out.append(by_id[gid]["name"])
        elif name not in seen:
            seen.add(name)
            out.append(name)
    return out


def build_genre_profile(tags: list[str], weights: list[float] | None = None) -> dict[str, Any]:
    _, by_id, _ = _nodes_index()
    scores: dict[str, float] = {}
    raw_weights = weights or [1.0] * len(tags)

    for tag, weight in zip(tags, raw_weights):
        gid = _match_genre_id(tag)
        if not gid:
            continue
        scores[gid] = scores.get(gid, 0.0) + float(weight)

    if not scores:
        return {
            "position": {"x": 500, "y": 500},
            "genres": [],
            "primary_genre": None,
        }

    scores = rollup_genre_scores(scores)

    if not scores:
        return {
            "position": {"x": 500, "y": 500},
            "genres": [],
            "primary_genre": None,
        }

    max_score = max(scores.values())
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)

    genre_results = []
    total_w = 0.0
    cx = 0.0
    cy = 0.0

    for gid, score in ranked[:12]:
        node = by_id[gid]
        similarity = round(min(100.0, (score / max_score) * 100), 1)
        genre_results.append(
            {
                "id": gid,
                "name": node["name"],
                "x": node["x"],
                "y": node["y"],
                "color": node["color"],
                "similarity": similarity,
                "weight": round(score, 3),
            }
        )
        w = score
        total_w += w
        cx += node["x"] * w
        cy += node["y"] * w

    return {
        "position": {
            "x": round(cx / total_w, 1),
            "y": round(cy / total_w, 1),
        },
        "genres": genre_results,
        "primary_genre": genre_results[0]["name"] if genre_results else None,
    }


def genre_similarity_between(tag_sets_a: list[str], tag_sets_b: list[str]) -> float:
    profile_a = build_genre_profile(tag_sets_a)
    profile_b = build_genre_profile(tag_sets_b)
    ids_a = {g["id"]: g["similarity"] for g in profile_a["genres"]}
    ids_b = {g["id"]: g["similarity"] for g in profile_b["genres"]}
    if not ids_a or not ids_b:
        return 0.0

    all_ids = set(ids_a) | set(ids_b)
    va = [ids_a.get(i, 0.0) for i in all_ids]
    vb = [ids_b.get(i, 0.0) for i in all_ids]
    dot = sum(a * b for a, b in zip(va, vb))
    na = math.sqrt(sum(a * a for a in va))
    nb = math.sqrt(sum(b * b for b in vb))
    if na == 0 or nb == 0:
        return 0.0
    return round(min(100.0, (dot / (na * nb)) * 100), 1)


def map_distance_similarity(pos_a: dict, pos_b: dict) -> float:
    dx = pos_a["x"] - pos_b["x"]
    dy = pos_a["y"] - pos_b["y"]
    dist = math.sqrt(dx * dx + dy * dy)
    return round(max(0.0, 100.0 - (dist / 7.0)), 1)
