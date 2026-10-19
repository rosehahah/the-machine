"""Index every episode with CLIP embeddings so Machine POV shots can be found by example or by text.

    .venv-research/bin/python tools/index_clip.py /path/to/episodes --out research/index

Samples --fps frames per second (whole frame squashed to 224x224, so corner overlays survive), embeds them
on the Mac GPU, and writes <out>/<SxxEyy>.npz (t: seconds, e: float16 unit vectors). Episodes already in
<out> are skipped, so it can be stopped and resumed. Nothing is written next to the source files.
"""
from __future__ import annotations

import argparse
import queue
import re
import subprocess
import sys
import threading
import time
from pathlib import Path

import numpy as np
import open_clip
import torch

S = 224
VIDEO = {".mkv", ".mp4", ".avi", ".rmvb"}
MEAN = torch.tensor([0.48145466, 0.4578275, 0.40821073]).view(1, 3, 1, 1)
STD = torch.tensor([0.26862954, 0.26130258, 0.27577711]).view(1, 3, 1, 1)


def code_of(path: Path) -> str | None:
    m = re.search(r"S(\d\d)E(\d\d)", path.name, re.I)
    if m:
        return f"S{m[1]}E{m[2]}"
    m = re.fullmatch(r"(\d)(\d\d)", path.stem)  # 418.mkv
    return f"S0{m[1]}E{m[2]}" if m else None


def episodes(root: Path) -> dict[str, Path]:
    """One file per episode; when there are two (HDTV and BD), keep the larger."""
    best: dict[str, Path] = {}
    for p in root.rglob("*"):
        if p.suffix.lower() in VIDEO and not p.name.startswith("._") and (c := code_of(p)):
            if c not in best or p.stat().st_size > best[c].stat().st_size:
                best[c] = p
    return dict(sorted(best.items()))


def load_model():
    m, _, _ = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
    return m.to("mps").eval().half()


@torch.no_grad()
def embed(model, frames: np.ndarray) -> np.ndarray:
    x = torch.from_numpy(frames).permute(0, 3, 1, 2).float().div(255)
    x = ((x - MEAN) / STD).to("mps").half()
    e = model.encode_image(x).float()
    return torch.nn.functional.normalize(e, dim=-1).cpu().numpy().astype(np.float16)


def decode(code: str, src: Path, fps: float, q: queue.Queue):
    cmd = ["ffmpeg", "-v", "error", "-hwaccel", "videotoolbox", "-i", str(src), "-map", "0:v:0",
           "-vf", f"fps={fps},scale={S}:{S}:flags=area", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stdin=subprocess.DEVNULL)
    size, chunk, i = S * S * 3, [], 0
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        chunk.append(np.frombuffer(buf, np.uint8).reshape(S, S, 3))
        i += 1
        if len(chunk) == 128:
            q.put((code, np.stack(chunk)))
            chunk = []
    if chunk:
        q.put((code, np.stack(chunk)))
    ok = p.wait() == 0 and i > 0
    q.put((code, None if ok else False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=Path)
    ap.add_argument("--out", type=Path, default=Path("research/index"))
    ap.add_argument("--fps", type=float, default=2)
    ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    eps = {c: p for c, p in episodes(a.root).items() if not (a.out / f"{c}.npz").exists()}
    print(f"{len(eps)} episodes to index", flush=True)
    (a.out / "sources.txt").write_text("".join(f"{c}\t{p}\n" for c, p in episodes(a.root).items()))
    model = load_model()
    q: queue.Queue = queue.Queue(maxsize=64)
    todo = list(eps.items())
    lock = threading.Lock()

    def worker():
        while True:
            with lock:
                if not todo:
                    return
                code, src = todo.pop(0)
            decode(code, src, a.fps, q)

    for _ in range(a.jobs):
        threading.Thread(target=worker, daemon=True).start()
    acc: dict[str, list] = {c: [] for c in eps}
    left, t0, n = len(eps), time.time(), 0
    while left:
        code, frames = q.get()
        if frames is False:  # source unreadable or cut short (drive dropped); leave it for the next run
            acc.pop(code, None)
            left -= 1
            print(f"[fail] {code} not saved", flush=True)
            continue
        if frames is None:
            e = np.concatenate(acc.pop(code)) if acc[code] else np.zeros((0, 512), np.float16)
            t = np.arange(len(e), dtype=np.float32) / a.fps
            with open(a.out / f"{code}.tmp", "wb") as f:
                np.savez(f, t=t, e=e)
            (a.out / f"{code}.tmp").rename(a.out / f"{code}.npz")
            left -= 1
            print(f"[{len(eps) - left}/{len(eps)}] {code} {len(e)} frames · {n / (time.time() - t0):.0f} fps",
                  flush=True)
            continue
        if code in acc:
            acc[code].append(embed(model, frames))
        n += len(frames)


if __name__ == "__main__":
    sys.exit(main())
