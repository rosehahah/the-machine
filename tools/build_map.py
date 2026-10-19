"""Fetch Manhattan from OpenStreetMap (Overpass API) and write a compact line map for the console:
web/data/manhattan.json  {"origin": [lat, lon], "streets": {"major": [...], "minor": [...]},
                           "coast": [...], "land": [[outer, hole, ...], ...], "parks": [...],
                           "names": [[name, x, y, angle], ...], "bbox": [x0, y0, x1, y1]}
Every line is a flat list [x0, y0, x1, y1, ...] in metres east/north of the origin (y up).

Map data © OpenStreetMap contributors, ODbL. Run: .venv/bin/python tools/build_map.py
"""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web" / "data" / "manhattan.json"
CACHE = ROOT / "media" / "osm_manhattan.json"
ENDPOINT = "https://overpass-api.de/api/interpreter"
BBOX = (40.698, -74.022, 40.882, -73.905)  # south, west, north, east
ORIGIN = (40.758, -73.9855)  # Times Square
MAJOR = {"motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link"}
MINOR = {"tertiary", "residential", "unclassified", "living_street", "pedestrian", "secondary_link", "tertiary_link"}

QUERY = f"""[out:json][timeout:180];
(
  way["highway"~"^({'|'.join(sorted(MAJOR | MINOR))})$"]{BBOX};
  way["natural"="coastline"]{BBOX};
  way["leisure"="park"]["name"]{BBOX};
);
out geom;"""


def fetch() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    # curl, not urllib: it uses the macOS keychain, which this Mac's TLS chain needs
    raw = subprocess.run(["curl", "-sf", "-m", "240", "-A", "TheMachineReplica/0.1 (personal project)",
                          "--data-urlencode", f"data={QUERY}", ENDPOINT], capture_output=True, check=True).stdout
    data = json.loads(raw)
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(data))
    return data


KX = 111320 * math.cos(math.radians(ORIGIN[0]))
KY = 110540


def project(lat: float, lon: float) -> tuple[float, float]:
    return (lon - ORIGIN[1]) * KX, (lat - ORIGIN[0]) * KY


def simplify(pts: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Douglas-Peucker."""
    if len(pts) < 3:
        return pts
    (x0, y0), (x1, y1) = pts[0], pts[-1]
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1e-9
    best, idx = -1.0, 0
    for i in range(1, len(pts) - 1):
        d = abs(dy * pts[i][0] - dx * pts[i][1] + x1 * y0 - y1 * x0) / L
        if d > best:
            best, idx = d, i
    if best <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: idx + 1], tol)[:-1] + simplify(pts[idx:], tol)


def land_polygons(coast_lines: list[list[tuple[float, float]]]) -> list[list[list[tuple[float, float]]]]:
    """Close the coastline into land areas inside the map box. OSM draws coastlines with land on the left,
    so every face cut out of the box by the coastline is land when it lies left of its nearest coast."""
    from shapely.geometry import LineString, box
    from shapely.ops import polygonize, unary_union

    (x0, y0), (x1, y1) = project(BBOX[0], BBOX[1]), project(BBOX[2], BBOX[3])
    frame = box(x0, y0, x1, y1)
    lines = [LineString(c) for c in coast_lines if len(c) > 1]
    clipped = [l.intersection(frame) for l in lines]
    faces = list(polygonize(unary_union([g for g in clipped if not g.is_empty] + [frame.exterior])))
    out = []
    for f in faces:
        if f.area < 2000:
            continue
        p = f.representative_point()
        line = min(lines, key=lambda l: l.distance(p))
        d = line.project(p)
        a, b = line.interpolate(max(0, d - 1)), line.interpolate(min(line.length, d + 1))
        q = line.interpolate(d)
        if (b.x - a.x) * (p.y - q.y) - (b.y - a.y) * (p.x - q.x) > 0:  # p is left of the coast -> land
            out.append([simplify_ring(list(f.exterior.coords), 3)] +
                       [simplify_ring(list(r.coords), 3) for r in f.interiors])
    return out


def simplify_ring(pts: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Douglas-Peucker for a closed ring (whose ends coincide), done as two halves."""
    h = len(pts) // 2
    return simplify(pts[: h + 1], tol)[:-1] + simplify(pts[h:], tol)


def flat(pts) -> list[int]:
    return [round(v) for p in pts for v in p]


def main():
    data = fetch()
    major, minor, coast, parks, names, coast_raw = [], [], [], [], {}, []
    for el in data["elements"]:
        if el["type"] != "way" or "geometry" not in el:
            continue
        t = el.get("tags", {})
        pts = [project(g["lat"], g["lon"]) for g in el["geometry"]]
        if t.get("natural") == "coastline":
            coast.append(flat(simplify(pts, 4)))
            coast_raw.append(pts)
        elif t.get("leisure") == "park":
            xs, ys = [p[0] for p in pts], [p[1] for p in pts]
            if (max(xs) - min(xs)) * (max(ys) - min(ys)) > 40000:  # skip pocket parks
                parks.append(flat((simplify_ring if pts[0] == pts[-1] else simplify)(pts, 3)))
        elif t.get("highway") in MAJOR:
            major.append(flat(simplify(pts, 2)))
        elif t.get("highway") in MINOR:
            minor.append(flat(simplify(pts, 2)))
        # one label per named major street: its longest segment
        n = t.get("name")
        if n and t.get("highway") in MAJOR | {"tertiary"} and len(pts) > 1:
            seg = max(zip(pts, pts[1:]), key=lambda s: math.dist(*s))
            ln = math.dist(*seg)
            if ln > names.get(n, (0,))[0]:
                (ax, ay), (bx, by) = seg
                ang = math.degrees(math.atan2(by - ay, bx - ax))
                if ang > 90:
                    ang -= 180
                elif ang < -90:
                    ang += 180
                names[n] = (ln, round((ax + bx) / 2), round((ay + by) / 2), round(ang, 1))
    land = land_polygons(coast_raw)
    out = {"origin": ORIGIN, "attribution": "© OpenStreetMap contributors",
           "streets": {"major": major, "minor": minor}, "coast": coast, "parks": parks,
           "land": [[flat(r) for r in poly] for poly in land],
           "bbox": [round(v) for v in (*project(BBOX[0], BBOX[1]), *project(BBOX[2], BBOX[3]))],
           "names": [[n.upper(), x, y, a] for n, (ln, x, y, a) in names.items() if ln > 120]}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"major {len(major)}  minor {len(minor)}  coast {len(coast)}  parks {len(parks)}  "
          f"land {len(out['land'])}  labels {len(out['names'])}  -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
