"""Prepare the stock footage for the console's mock camera wall.

For every clip in CLIPS: transcode media/raw/<id>.mp4 to web/media/clips/<id>.mp4 (960x540, no audio,
fast start), save a poster frame, and run the person detector + ByteTrack over it so the console can draw
real boxes on the footage. Tracks go to web/media/clips/<id>.json:
    {"fps": 10, "n": frames, "dur": seconds, "frames": [[[tid, x1, y1, x2, y2], ...], ...]}
with coordinates in thousandths of the frame size.

Footage: Mixkit (mixkit.co), Mixkit Stock Video Free License. Missing raw clips are downloaded from Mixkit.
Run: .venv/bin/python tools/build_clips.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
import supervision as sv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from vision import PersonDetector  # noqa: E402

RAW = ROOT / "media" / "raw"
OUT = ROOT / "web" / "media" / "clips"
SAMPLE_FPS = 10

# id: (kind, short description) — kind decides which mock cameras may use the clip
CLIPS = {
    "4000": ("street", "INTERSECTION, HIGH ANGLE"),
    "4401": ("street", "CROSSWALK, HIGH ANGLE"),
    "4194": ("street", "AVENUE TRAFFIC"),
    "3428": ("street", "SIDEWALK AT DUSK"),
    "4348": ("street", "RESIDENTIAL BLOCK"),
    "4169": ("plaza", "OFFICE PLAZA"),
    "4855": ("plaza", "OPEN PLAZA"),
    "4832": ("street", "CROSSWALK, CLOSE"),
    "4332": ("square", "TIMES SQ, RAIN"),
    "4442": ("square", "TIMES SQ, DAY"),
    "4443": ("square", "TIMES SQ, CENTER"),
    "4180": ("station", "GRAND CENTRAL, INFO BOOTH"),
    "4181": ("station", "GRAND CENTRAL, MAIN CONCOURSE"),
    "4390": ("station", "STATION CONCOURSE"),
    "4449": ("subway", "PLATFORM, FISHEYE"),
    "1623": ("subway", "PLATFORM DOORS"),
    "1622": ("subway", "PLATFORM, EMPTY"),
    "4154": ("subway", "SUBWAY ENTRANCE"),
    "23696": ("facility", "SERVICE CORRIDOR"),
    "32614": ("park", "PARK PATH"),
    "32617": ("park", "PARK PATH, NORTH"),
    "4338": ("traffic", "JUNCTION, NIGHT"),
}


def download(cid: str, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading mixkit {cid}", flush=True)
    subprocess.run(["curl", "-fsSL", "-o", str(dst), f"https://assets.mixkit.co/videos/{cid}/{cid}-720.mp4"], check=True)


def transcode(src: Path, dst: Path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-an", "-vf", "scale=960:540,fps=25",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", str(dst)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", str(dst), "-frames:v", "1",
                    "-q:v", "5", str(dst.with_suffix(".jpg"))], check=True)


def annotate(path: Path, det: PersonDetector) -> dict:
    cap = cv2.VideoCapture(str(path))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    step = max(1, round(fps / SAMPLE_FPS))
    tracker = sv.ByteTrack(track_activation_threshold=0.35, lost_track_buffer=SAMPLE_FPS * 2,
                           minimum_matching_threshold=0.8, frame_rate=SAMPLE_FPS)
    frames, i = [], 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
        if i % step == 0:
            h, w = img.shape[:2]
            boxes, scores, _ = det(img)
            keep = [(b, s) for b, s in zip(boxes, scores) if (b[3] - b[1]) > h * 0.06]  # skip specks
            if keep:
                d = sv.Detections(xyxy=np.array([b for b, _ in keep], np.float32),
                                  confidence=np.array([s for _, s in keep], np.float32),
                                  class_id=np.zeros(len(keep), int))
            else:
                d = sv.Detections.empty()
            d = tracker.update_with_detections(d)
            frames.append([[int(t), *(int(v) for v in np.round(b / [w, h, w, h] * 1000))]
                           for t, b in zip(d.tracker_id, d.xyxy)])
        i += 1
    return {"fps": SAMPLE_FPS, "n": len(frames), "dur": round(i / fps, 2), "frames": frames}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    det = PersonDetector(conf=0.4)
    index = []
    for cid, (kind, desc) in CLIPS.items():
        dst = OUT / f"{cid}.mp4"
        if not dst.exists():
            if not (RAW / f"{cid}.mp4").exists():
                download(cid, RAW / f"{cid}.mp4")
            transcode(RAW / f"{cid}.mp4", dst)
        meta = OUT / f"{cid}.json"
        if not meta.exists():
            meta.write_text(json.dumps(annotate(dst, det), separators=(",", ":")))
        m = json.loads(meta.read_text())
        people = max((len(f) for f in m["frames"]), default=0)
        index.append({"id": cid, "kind": kind, "desc": desc, "dur": m["dur"], "maxPeople": people})
        print(f"{cid:>6} {kind:9} {m['dur']:5.1f}s  up to {people} people  {dst.stat().st_size // 1024} KB", flush=True)
    (OUT / "index.json").write_text(json.dumps(index, indent=1))


if __name__ == "__main__":
    main()
