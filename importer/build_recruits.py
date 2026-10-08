"""What the game needs to generate high school classes (M3 recruiting).

    python3 importer/build_recruits.py [--season 2026]

Writes data/seed/<season>wk1/recruiting.json:
  curve:  the national composite by rank (rank 1 first), averaged over the three complete classes before
          the seed season's signing class, so a generated class gets the real number of five- and four-stars.
  pool:   every prospect in those classes with a hometown: CFBD position, composite (null when unrated),
          hometown and size. Generated prospects are drawn from it, which keeps real geography by talent
          (where five-stars come from), the real position mix and real sizes.
  class_size: the average number of prospects in a complete class.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "importer/.cache"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, default=2026)
    args = ap.parse_args()
    # The seed season's next signing class (2027 for the 2026 seed) is still being rated; use the three before it.
    years = [args.season - 2, args.season - 1, args.season]
    classes = [json.loads((CACHE / f"recruiting_players__year-{y}_classification-HighSchool.json").read_text()) for y in years]
    ratings = [sorted((r["rating"] for r in c if r.get("rating")), reverse=True) for c in classes]
    n = min(len(r) for r in ratings)
    curve = [round(sum(r[i] for r in ratings) / len(ratings), 4) for i in range(n)]
    fields = ["pos", "rating", "lat", "lon", "state", "city", "height", "weight"]
    rows = []
    for c in classes:
        for r in c:
            h = r.get("hometownInfo") or {}
            if h.get("latitude") is None or not r.get("position"):
                continue
            rows.append([r["position"], r.get("rating"), round(float(h["latitude"]), 3), round(float(h["longitude"]), 3),
                         r.get("stateProvince"), r.get("city"), r.get("height"), r.get("weight")])
    out = {"years": years, "curve": curve, "class_size": round(sum(len(c) for c in classes) / len(classes)),
           "pool": {"fields": fields, "rows": rows}}
    path = ROOT / f"data/seed/{args.season}wk1/recruiting.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {path}: curve {len(curve)} ranks, pool {len(rows)} prospects, class size {out['class_size']}")


if __name__ == "__main__":
    main()
