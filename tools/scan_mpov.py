"""Scan episodes for Machine POV frames, so the reference frames can be pulled from the real show.

    .venv/bin/python tools/scan_mpov.py EPISODE.mkv [...] --out research/scan [--fps 2]

Nothing is cut to disk except candidates: ffmpeg pipes small frames straight into the scorer.
Per episode it writes <out>/<code>.csv (one row per sampled frame) and <out>/<code>/<sec>.jpg for frames
whose score passes --keep. Scores:
  yel  long thin yellow strokes (MPOV boxes, labels) - taxis are blobs, so they are opened away
  wht  long thin white strokes (white boxes, panel borders)
  dots small bright specks on a dark frame (the S4/S5 "data space" background)
"""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

import cv2
import numpy as np

W, H = 640, 360


def code_of(path: Path) -> str:
    m = re.search(r"S(\d\d)E(\d\d)", path.name, re.I)
    if m:
        return f"S{m[1]}E{m[2]}"
    m = re.match(r"(\d)(\d\d)\.", path.name)  # 418.mkv
    return f"S0{m[1]}E{m[2]}" if m else path.stem


def strokes(mask: np.ndarray) -> float:
    """Fraction of the frame covered by long thin horizontal/vertical strokes (not blobs)."""
    blobs = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    thin = cv2.subtract(mask, blobs)
    h = cv2.morphologyEx(thin, cv2.MORPH_OPEN, np.ones((1, 25), np.uint8))
    v = cv2.morphologyEx(thin, cv2.MORPH_OPEN, np.ones((18, 1), np.uint8))
    return float(np.count_nonzero(h | v)) / mask.size * 1000


def score(bgr: np.ndarray) -> tuple[float, float, float, float]:
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    hh, ss, vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    yellow = ((hh >= 22) & (hh <= 34) & (ss > 120) & (vv > 170)).astype(np.uint8) * 255
    white = ((ss < 40) & (vv > 215)).astype(np.uint8) * 255
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    luma = float(gray.mean())
    dots = 0.0
    if luma < 45:
        top = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, np.ones((5, 5), np.uint8))
        n, _, st, _ = cv2.connectedComponentsWithStats((top > 60).astype(np.uint8))
        dots = float(np.count_nonzero((st[1:, cv2.CC_STAT_AREA] <= 12)))
    return strokes(yellow), strokes(white), dots, luma


def scan(src: Path, out: Path, fps: float, keep: float) -> None:
    code = code_of(src)
    csv = out / f"{code}.csv"
    if csv.exists():
        print(f"[skip] {code}", flush=True)
        return
    shots = out / code
    shots.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-v", "error", "-hwaccel", "videotoolbox", "-i", str(src), "-map", "0:v:0",
           "-vf", f"fps={fps},scale={W}:{H}", "-pix_fmt", "bgr24", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stdin=subprocess.DEVNULL)
    rows, i, size = [], 0, W * H * 3
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        f = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        t = i / fps
        y, w, d, l = score(f)
        rows.append(f"{t:.1f},{y:.2f},{w:.2f},{d:.0f},{l:.0f}")
        if y >= keep or w >= keep * 2 or d >= 150:
            cv2.imwrite(str(shots / f"{int(t):05d}_{int(t * 10) % 10}.jpg"), f, [cv2.IMWRITE_JPEG_QUALITY, 70])
        i += 1
    p.wait()
    tmp = csv.with_suffix(".tmp")
    tmp.write_text("t,yel,wht,dots,luma\n" + "\n".join(rows) + "\n")
    tmp.rename(csv)
    print(f"[done] {code} {i} frames", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, default=Path("research/scan"))
    ap.add_argument("--fps", type=float, default=2)
    ap.add_argument("--keep", type=float, default=4)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    for f in a.files:
        scan(f, a.out, a.fps, a.keep)


if __name__ == "__main__":
    main()
