"""Cut a run of frames from one episode into a contact sheet, to see how a transition moves.

    .venv-research/bin/python tools/strip.py S01E02 312 322 --fps 4 --name fb_s01e02

Writes research/strips/<name>.jpg (tiles labelled with the episode time) and keeps the full-res frames in
research/strips/<name>/ for close reading.
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import cv2
import numpy as np

IDX = Path("research/index")
OUT = Path("research/strips")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("code")
    ap.add_argument("start", type=float)
    ap.add_argument("end", type=float)
    ap.add_argument("--fps", type=float, default=4)
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--name")
    a = ap.parse_args()
    src = dict(l.split("\t", 1) for l in (IDX / "sources.txt").read_text().splitlines())[a.code]
    name = a.name or f"{a.code}_{int(a.start)}"
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    for f in d.glob("*.jpg"):
        f.unlink()
    subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{a.start}", "-t", f"{a.end - a.start}", "-i", src,
                    "-vf", f"fps={a.fps}", "-q:v", "3", str(d / "%04d.jpg")], check=True, stdin=subprocess.DEVNULL)
    tiles = []
    for i, f in enumerate(sorted(d.glob("*.jpg"))):
        t = a.start + i / a.fps
        im = cv2.resize(cv2.imread(str(f)), (320, 180))
        cv2.rectangle(im, (0, 0), (320, 16), (0, 0, 0), -1)
        cv2.putText(im, f"{a.code} {int(t // 60):02d}:{t % 60:05.2f}", (4, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4,
                    (255, 255, 255), 1)
        f.rename(d / f"{t:08.2f}.jpg")
        tiles.append(im)
    tiles += [np.zeros_like(tiles[0])] * (-len(tiles) % a.cols)
    sheet = np.vstack([np.hstack(tiles[r:r + a.cols]) for r in range(0, len(tiles), a.cols)])
    cv2.imwrite(str(OUT / f"{name}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 82])
    print(OUT / f"{name}.jpg", len(tiles))


if __name__ == "__main__":
    main()
