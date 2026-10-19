"""Search the CLIP index (tools/index_clip.py) for shots that look like given stills or match a text.

    .venv-research/bin/python tools/find_shots.py --img research/img/POI_0502_*.png --text "..." \
        --top 120 --name archive

Frames scoring in the top --top are merged into segments (gap <= --gap s). For each segment one full-res
frame is pulled from the source (its best-scoring moment) into research/hits/<name>/, plus a contact sheet
research/hits/<name>.jpg, and a list research/hits/<name>.tsv (code, start, end, best, score).
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import cv2
import numpy as np
import open_clip
import torch

from index_clip import MEAN, S, STD, load_model

IDX = Path("research/index")
OUT = Path("research/hits")


def sources() -> dict[str, str]:
    return dict(l.split("\t", 1) for l in (IDX / "sources.txt").read_text().splitlines())


@torch.no_grad()
def query_vec(model, imgs: list[Path], texts: list[str]) -> np.ndarray:
    vs = []
    for p in imgs:
        im = cv2.cvtColor(cv2.resize(cv2.imread(str(p)), (S, S), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
        x = torch.from_numpy(im).permute(2, 0, 1)[None].float().div(255)
        vs.append(model.encode_image(((x - MEAN) / STD).to("mps").half()).float())
    if texts:
        tok = open_clip.get_tokenizer("ViT-B-32")
        vs.append(model.encode_text(tok(texts).to("mps")).float())
    v = torch.nn.functional.normalize(torch.cat(vs), dim=-1)
    return v.cpu().numpy().astype(np.float32)


def grab(src: str, t: float, dst: Path):
    subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-q:v", "3", "-y",
                    str(dst)], stdin=subprocess.DEVNULL)


def fmt(t: float) -> str:
    return f"{int(t // 60):02d}m{int(t % 60):02d}s"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--img", nargs="*", type=Path, default=[])
    ap.add_argument("--text", nargs="*", default=[])
    ap.add_argument("--neg", nargs="*", type=Path, default=[], help="stills to push away from")
    ap.add_argument("--top", type=int, default=100, help="segments to keep")
    ap.add_argument("--gap", type=float, default=3)
    ap.add_argument("--name", required=True)
    ap.add_argument("--seasons", default="", help="e.g. S04,S05")
    a = ap.parse_args()
    model = load_model()
    q = query_vec(model, a.img, a.text)
    neg = query_vec(model, a.neg, []) if a.neg else None
    segs = []
    for f in sorted(IDX.glob("S*.npz")):
        code = f.stem
        if a.seasons and code[:3] not in a.seasons.split(","):
            continue
        d = np.load(f)
        e = d["e"].astype(np.float32)
        s = (e @ q.T).max(1)
        if neg is not None:
            s -= 0.5 * (e @ neg.T).max(1)
        thr = np.quantile(s, 0.995)
        idx = np.flatnonzero(s >= thr)
        if not len(idx):
            continue
        start = prev = idx[0]
        for i in list(idx[1:]) + [None]:
            if i is not None and d["t"][i] - d["t"][prev] <= a.gap:
                prev = i
                continue
            seg = slice(start, prev + 1)
            b = start + int(np.argmax(s[seg]))
            segs.append((float(s[b]), code, float(d["t"][start]), float(d["t"][prev]), float(d["t"][b])))
            if i is not None:
                start = prev = i
    segs.sort(reverse=True)
    segs = segs[: a.top]
    src = sources()
    out = OUT / a.name
    out.mkdir(parents=True, exist_ok=True)
    tiles = []
    rows = []
    for k, (sc, code, t0, t1, tb) in enumerate(segs):
        dst = out / f"{k:03d}_{code}_{fmt(tb)}.jpg"
        if not dst.exists():
            grab(src[code], tb, dst)
        rows.append(f"{k}\t{code}\t{fmt(t0)}\t{fmt(t1)}\t{tb:.1f}\t{sc:.3f}")
        im = cv2.imread(str(dst))
        if im is None:
            continue
        im = cv2.resize(im, (320, 180))
        cv2.rectangle(im, (0, 0), (320, 18), (0, 0, 0), -1)
        cv2.putText(im, f"{k} {code} {fmt(tb)}", (4, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1)
        tiles.append(im)
    (OUT / f"{a.name}.tsv").write_text("k\tcode\tstart\tend\tbest_s\tscore\n" + "\n".join(rows) + "\n")
    cols = 6
    for p in range(0, len(tiles), 36):
        page = tiles[p:p + 36]
        page += [np.zeros_like(tiles[0])] * (-len(page) % cols)
        sheet = np.vstack([np.hstack(page[r:r + cols]) for r in range(0, len(page), cols)])
        cv2.imwrite(str(OUT / f"{a.name}_{p // 36}.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 80])
    print(f"{len(segs)} segments -> {OUT}/{a.name}_*.jpg")


if __name__ == "__main__":
    main()
