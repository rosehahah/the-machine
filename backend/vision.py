"""Perception: person detection (YOLOX), face detection (YuNet), face recognition (SFace), tracking (ByteTrack)."""
from __future__ import annotations

import json
import os
import threading
import time
import warnings
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
import supervision as sv

import threat as threat_engine

cv2.utils.logging.setLogLevel(cv2.utils.logging.LOG_LEVEL_ERROR)  # silence "Targets are not supported" notices
warnings.filterwarnings("ignore", category=FutureWarning, module="supervision")
warnings.filterwarnings("ignore", message=".*ByteTrack.*deprecated.*")

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "models"
DATA = Path(os.environ.get("MACHINE_DATA", ROOT / "data"))

SFACE_COSINE_MATCH = 0.40  # SFace reference threshold is 0.363; slightly stricter to avoid false ADMIN
WEAPONS = {34: "BAT", 43: "KNIFE", 76: "SCISSORS"}  # COCO classes that read as "weapon" (COCO has no guns)
WEAPON_CONF = 0.30  # small objects in a hand score low; the threat engine requires repeated hits
FIXTURE_AFTER = 4.0  # a weapon that stays on the same spot this long is scenery (knife block, wall rack)
ROLES = {
    "ADMIN": "yellow",
    "PRIMARY ASSET": "yellow",
    "SECONDARY ASSET": "yellow",
    "ANALOG INTERFACE": "black_yellow",
    "IRRELEVANT": "white",
}


# ---------------------------------------------------------------- detectors
class PersonDetector:
    """YOLOX-s (opencv_zoo, COCO). Returns person boxes xyxy + score."""

    def __init__(self, conf: float = 0.45, nms: float = 0.5):
        so = ort.SessionOptions()
        so.log_severity_level = 3
        try:
            self.sess = ort.InferenceSession(
                str(MODELS / "object_detection_yolox_2022nov.onnx"), so,
                providers=["CoreMLExecutionProvider", "CPUExecutionProvider"])
        except Exception:
            self.sess = ort.InferenceSession(
                str(MODELS / "object_detection_yolox_2022nov.onnx"), so, providers=["CPUExecutionProvider"])
        self.conf, self.nms, self.size = conf, nms, 640
        grids, strides = [], []
        for s in (8, 16, 32):
            n = self.size // s
            xv, yv = np.meshgrid(np.arange(n), np.arange(n))
            grids.append(np.stack((xv, yv), 2).reshape(-1, 2))
            strides.append(np.full((n * n, 1), s))
        self.grids = np.concatenate(grids).astype(np.float32)
        self.strides = np.concatenate(strides).astype(np.float32)

    def __call__(self, img: np.ndarray) -> tuple[np.ndarray, np.ndarray, list[dict]]:
        """Returns person boxes, person scores, and weapon-like objects [{box, score, kind}]."""
        h, w = img.shape[:2]
        r = min(self.size / h, self.size / w)
        pad = np.full((self.size, self.size, 3), 114, np.uint8)
        pad[: int(h * r), : int(w * r)] = cv2.resize(img, (int(w * r), int(h * r)))
        blob = pad.transpose(2, 0, 1)[None].astype(np.float32)
        out = self.sess.run(None, {"images": blob})[0][0]
        out[:, :2] = (out[:, :2] + self.grids) * self.strides
        out[:, 2:4] = np.exp(out[:, 2:4]) * self.strides
        persons, pscores = self._pick(out, 0, self.conf, r, w, h)
        weapons = []
        for cls, kind in WEAPONS.items():
            boxes, scores = self._pick(out, cls, WEAPON_CONF, r, w, h)
            weapons += [{"box": b, "score": float(sc), "kind": kind} for b, sc in zip(boxes, scores)]
        return persons, pscores, weapons

    def _pick(self, out: np.ndarray, cls: int, conf: float, r: float, w: int, h: int):
        scores = out[:, 4] * out[:, 5 + cls]  # objectness * class score
        keep = scores > conf
        if not keep.any():
            return np.zeros((0, 4), np.float32), np.zeros(0, np.float32)
        b, s = out[keep, :4], scores[keep]
        xyxy = np.stack([b[:, 0] - b[:, 2] / 2, b[:, 1] - b[:, 3] / 2,
                         b[:, 0] + b[:, 2] / 2, b[:, 1] + b[:, 3] / 2], 1) / r
        idx = cv2.dnn.NMSBoxes(
            [[float(x1), float(y1), float(x2 - x1), float(y2 - y1)] for x1, y1, x2, y2 in xyxy],
            s.tolist(), conf, self.nms)
        idx = np.array(idx).reshape(-1)
        xyxy = xyxy[idx]
        xyxy[:, [0, 2]] = xyxy[:, [0, 2]].clip(0, w)
        xyxy[:, [1, 3]] = xyxy[:, [1, 3]].clip(0, h)
        return xyxy.astype(np.float32), s[idx].astype(np.float32)


class WeaponVerifier:
    """OWLv2 (open-vocabulary) asked for knives, guns, scissors and bats. Far better than COCO detectors at
    weapons held in a hand, but ~1.7 s per frame on the CPU, so the server runs it in the background."""
    MEAN = np.array([0.48145466, 0.4578275, 0.40821073], np.float32)
    STD = np.array([0.26862954, 0.26130258, 0.27577711], np.float32)
    KINDS = {"a knife": "KNIFE", "a gun": "GUN", "a pistol": "GUN", "a rifle": "GUN",
             "scissors": "SCISSORS", "a baseball bat": "BAT"}
    CONF = 0.30   # on our test photos held weapons scored 0.47-0.69, the show stills at most 0.13

    def __init__(self):
        so = ort.SessionOptions()
        so.log_severity_level = 3
        so.intra_op_num_threads = 3  # leave cores for the real-time loop
        self.sess = ort.InferenceSession(str(MODELS / "owlv2_weapons.onnx"), so, providers=["CPUExecutionProvider"])
        self.queries = json.loads((MODELS / "owlv2_weapons.json").read_text())

    def __call__(self, img: np.ndarray) -> list[dict]:
        h, w = img.shape[:2]
        side = max(h, w)
        sq = np.full((side, side, 3), 0.5, np.float32)  # pad bottom/right with grey, as the HF processor does
        sq[:h, :w] = img[:, :, ::-1].astype(np.float32) / 255
        sq = cv2.resize(sq, (960, 960), interpolation=cv2.INTER_AREA)
        px = ((sq - self.MEAN) / self.STD).transpose(2, 0, 1)[None].astype(np.float32)
        logits, boxes = self.sess.run(None, {"pixel_values": px})
        scores = 1 / (1 + np.exp(-logits[0]))
        best, cls = scores.max(1), scores.argmax(1)
        keep = np.where(best > self.CONF)[0]
        if not len(keep):
            return []
        cx, cy, bw, bh = (boxes[0][keep] * side).T
        xyxy = np.stack([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], 1).clip(0, side)
        idx = np.array(cv2.dnn.NMSBoxes([[float(a), float(b), float(c - a), float(d - b)] for a, b, c, d in xyxy],
                                        best[keep].tolist(), self.CONF, 0.4)).reshape(-1)
        return [{"box": xyxy[i].astype(np.float32), "score": float(best[keep[i]]),
                 "kind": self.KINDS.get(self.queries[cls[keep[i]]], "WEAPON"),
                 "weight": 3 if best[keep[i]] >= 0.45 else 2} for i in idx]


class Faces:
    def __init__(self):
        self.det = cv2.FaceDetectorYN.create(
            str(MODELS / "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.75, 0.3, 50)
        self.rec = cv2.FaceRecognizerSF.create(str(MODELS / "face_recognition_sface_2021dec.onnx"), "")
        self.lock = threading.Lock()  # cv2 dnn nets are not re-entrant

    def detect(self, img: np.ndarray) -> np.ndarray:
        """Returns Nx15 YuNet rows: x, y, w, h, 5 landmarks (x,y), score."""
        h, w = img.shape[:2]
        with self.lock:
            self.det.setInputSize((w, h))
            _, faces = self.det.detect(img)
        return faces if faces is not None else np.zeros((0, 15), np.float32)

    def embed(self, img: np.ndarray, face_row: np.ndarray) -> np.ndarray:
        with self.lock:
            crop = self.rec.alignCrop(img, face_row)
            f = self.rec.feature(crop)
        f = f.reshape(-1)
        return f / (np.linalg.norm(f) + 1e-9)


# ---------------------------------------------------------------- identities
class IdentityStore:
    def __init__(self, path: Path = DATA / "identities.json"):
        self.path = path
        self.lock = threading.Lock()
        self.people: dict[str, dict] = {}
        if path.exists():
            self.people = json.loads(path.read_text())
        self._flatten()

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.people))
        tmp.replace(self.path)

    def add(self, name: str, role: str, embeddings: list[np.ndarray], alias: str = "") -> str:
        with self.lock:
            pid = f"p{int(time.time() * 1000) % 10**9}"
            # keep several samples; matching takes the max cosine over them
            self.people[pid] = {"name": name.upper(), "role": role, "alias": alias.upper(),
                                "embeddings": [e.tolist() for e in embeddings[:24]], "created": time.time()}
            self._flatten()
            self.save()
            return pid

    def _flatten(self):
        self.ids, rows = [], []
        for pid, p in self.people.items():
            for e in p["embeddings"]:
                self.ids.append(pid)
                rows.append(e)
        self.mat = np.array(rows, np.float32) if rows else None

    def update(self, pid: str, **kw):
        with self.lock:
            if pid in self.people:
                for k in ("name", "role", "alias"):
                    if kw.get(k) is not None:
                        self.people[pid][k] = kw[k].upper() if k != "role" else kw[k]
                self.save()

    def delete(self, pid: str):
        with self.lock:
            self.people.pop(pid, None)
            self._flatten()
            self.save()

    def match(self, emb: np.ndarray) -> tuple[str | None, float]:
        with self.lock:
            if self.mat is None:
                return None, 0.0
            sims = self.mat @ emb
            i = int(np.argmax(sims))
            return (self.ids[i], float(sims[i])) if sims[i] >= SFACE_COSINE_MATCH else (None, float(sims[i]))

    def ssn(self, pid: str) -> str:
        """Stable SSN-style number for an enrolled subject, made up on first use (the show's ###-00-####)."""
        with self.lock:
            p = self.people.get(pid)
            if p is None:
                return "000-00-0000"
            if not p.get("ssn"):
                rng = np.random.default_rng()
                p["ssn"] = f"{rng.integers(1, 900):03d}-00-{rng.integers(1, 10000):04d}"
                self.save()
            return p["ssn"]

    def public(self) -> list[dict]:
        with self.lock:
            return [{"id": pid, "name": p["name"], "role": p["role"], "alias": p.get("alias", ""),
                     "samples": len(p["embeddings"])} for pid, p in self.people.items()]

    def get(self, pid: str) -> dict | None:
        return self.people.get(pid)


# ---------------------------------------------------------------- per-camera tracking
@dataclass
class TrackState:
    tid: int
    first_seen: float
    last_seen: float
    head: np.ndarray                    # smoothed square head box xyxy
    pid: str | None = None              # matched identity
    votes: dict = field(default_factory=dict)
    tries: int = 0
    last_embed_frame: int = -999
    face_seen: bool = False
    sim: float = 0.0
    body: np.ndarray | None = None      # person box xyxy (synthetic for close-ups)
    threat: threat_engine.Threat = field(default_factory=threat_engine.Threat)
    snap: bytes = b""                   # small JPEG of the head, refreshed about once a second
    snap_at: float = 0.0


def head_from_face(f: np.ndarray) -> np.ndarray:
    x, y, w, h = f[:4]
    # matches the show: face fills ~60% of the box, box runs from above the hair to the collar
    side = max(w, h) * 1.6
    cx, cy = x + w / 2, y + h * 0.5
    return np.array([cx - side / 2, cy - side * 0.53, cx + side / 2, cy + side * 0.47], np.float32)


def head_from_person(b: np.ndarray) -> np.ndarray:
    x1, y1, x2, y2 = b
    w = x2 - x1
    side = min(w * 0.62, (y2 - y1) * 0.5)
    cx = (x1 + x2) / 2
    top = y1 - side * 0.08
    return np.array([cx - side / 2, top, cx + side / 2, top + side], np.float32)


class CameraTracker:
    """Tracks people in one camera feed and resolves identities."""

    def __init__(self, faces: Faces, store: IdentityStore, fps: float = 15):
        self.faces, self.store = faces, store
        self.tracker = sv.ByteTrack(track_activation_threshold=0.4, lost_track_buffer=int(fps * 1.5),
                                    minimum_matching_threshold=0.8, frame_rate=int(fps))
        self.tracks: dict[int, TrackState] = {}
        self.frame_no = 0
        self.incidents: list[dict] = []  # threat-engine output, drained by the server
        self.fixtures: list[dict] = []   # weapon-like objects seen at a fixed spot: {box, first, last}
        self.started = time.time()
        self.verified: list[dict] = []   # weapons from the background verifier, consumed by the next step
        self.verify_passes = 0
        self.vlock = threading.Lock()

    def add_verified(self, weapons: list[dict]):
        with self.vlock:
            for w in weapons:
                w["learn"] = self.verify_passes == 0
            self.verified += weapons
            self.verify_passes += 1

    def step(self, img: np.ndarray, persons: np.ndarray, pscores: np.ndarray, faces: np.ndarray,
             weapons: list[dict] = ()) -> list[dict]:
        self.frame_no += 1
        now = time.time()
        # faces not inside any person box become synthetic person boxes (close-up at a laptop)
        boxes, scores = list(persons), list(pscores)
        for f in faces:
            fx, fy, fw, fh = f[:4]
            cx, cy = fx + fw / 2, fy + fh / 2
            inside = any(b[0] <= cx <= b[2] and b[1] <= cy <= b[1] + (b[3] - b[1]) * 0.6 for b in persons)
            if not inside:
                boxes.append(np.array([fx - fw * 0.9, fy - fh * 0.45, fx + fw * 1.9, fy + fh * 3.2], np.float32))
                scores.append(float(f[14]))
        H, W = img.shape[:2]
        if boxes:
            xyxy = np.array(boxes, np.float32)
            xyxy[:, [0, 2]] = xyxy[:, [0, 2]].clip(0, W)
            xyxy[:, [1, 3]] = xyxy[:, [1, 3]].clip(0, H)
            det = sv.Detections(xyxy=xyxy, confidence=np.array(scores, np.float32),
                                class_id=np.zeros(len(boxes), int))
        else:
            det = sv.Detections.empty()
        det = self.tracker.update_with_detections(det)

        alive = set()
        for i in range(len(det)):
            tid = int(det.tracker_id[i])
            pb = det.xyxy[i]
            alive.add(tid)
            # face belonging to this person: inside the upper 60% of the box, pick the largest
            face = None
            for f in faces:
                cx, cy = f[0] + f[2] / 2, f[1] + f[3] / 2
                if pb[0] <= cx <= pb[2] and pb[1] - f[3] * 0.5 <= cy <= pb[1] + (pb[3] - pb[1]) * 0.6:
                    if face is None or f[2] > face[2]:
                        face = f
            target = head_from_face(face) if face is not None else head_from_person(pb)
            st = self.tracks.get(tid)
            if st is None:
                st = self.tracks[tid] = TrackState(tid, now, now, target)
            else:
                # light smoothing; follow faster when the target jumps
                d = np.abs(target - st.head).mean() / max(1.0, (st.head[2] - st.head[0]))
                a = 0.75 if d > 0.15 else 0.5
                st.head = st.head * (1 - a) + target * a
            st.last_seen = now
            st.body = pb
            if face is not None:
                st.face_seen = True
                self._identify(st, img, face)
            if now - st.snap_at > 1.0:
                st.snap, st.snap_at = snapshot(img, st.head), now
        with self.vlock:
            weapons, self.verified = list(weapons) + self.verified, []
        weapons = self._held(weapons, now)
        for inc in threat_engine.assess(self.tracks, alive, weapons, W, H, now, self._role):
            st = self.tracks[inc["tid"]]
            p = self.store.get(st.pid) if st.pid else None
            inc["snap"], inc["name"] = st.snap, p["name"] if p else None
            self.incidents.append(inc)
        out = [self._public(self.tracks[tid]) for tid in alive]
        for tid in [t for t in self.tracks if t not in alive and now - self.tracks[t].last_seen > 2.0]:
            del self.tracks[tid]
        return out

    def _held(self, weapons: list[dict], now: float) -> list[dict]:
        """Drop weapons that sit still: each is compared with where it was first seen, so one carried
        around keeps counting while a knife on the wall becomes scenery after FIXTURE_AFTER seconds.
        Nothing counts during the first FIXTURE_AFTER seconds, so scenery present at start-up is learnt."""
        held = []
        for w in weapons:
            fx = max(self.fixtures, key=lambda f: iou(f["box"], w["box"]), default=None)
            if fx is None or iou(fx["box"], w["box"]) < 0.5:
                # the verifier's first pass on a feed only learns the scenery
                first = now - FIXTURE_AFTER if w.get("learn") else now
                fx = {"box": w["box"], "first": first, "last": now}
                self.fixtures.append(fx)
            fx["last"] = now
            if now - fx["first"] < FIXTURE_AFTER and now - self.started >= FIXTURE_AFTER:
                held.append(w)
        self.fixtures = [f for f in self.fixtures if now - f["last"] < 30.0]
        return held

    def _identify(self, st: TrackState, img: np.ndarray, face: np.ndarray):
        if face[2] < 48:  # too small to recognize reliably
            return
        gap = 3 if st.pid is None else 30  # keep re-verifying identified tracks occasionally
        if self.frame_no - st.last_embed_frame < gap:
            return
        st.last_embed_frame = self.frame_no
        if self.store.mat is None:
            return
        pid, sim = self.store.match(self.faces.embed(img, face))
        st.sim = sim
        key = pid or "_none"
        st.votes[key] = st.votes.get(key, 0) + 1
        st.tries += 1
        if st.pid is None and pid and st.votes[pid] >= 2:
            st.pid = pid
        elif st.pid and st.votes.get("_none", 0) >= 4 and st.votes["_none"] > 2 * st.votes.get(st.pid, 0):
            st.pid = None  # repeatedly fails to match: drop identity
        if st.tries > 12:  # decay old votes
            st.votes = {k: v // 2 for k, v in st.votes.items()}
            st.tries = 6

    def _role(self, st: TrackState) -> str | None:
        p = self.store.get(st.pid) if st.pid else None
        return p["role"] if p else None

    def track(self, tid: int) -> TrackState | None:
        return self.tracks.get(tid)

    def _public(self, st: TrackState) -> dict:
        p = self.store.get(st.pid) if st.pid else None
        role = p["role"] if p else None
        return {"id": st.tid, "box": [round(float(v), 1) for v in st.head],
                "age": round(time.time() - st.first_seen, 2),
                "pid": st.pid if p else None, "role": role,
                "name": p["name"] if p else None, "alias": p.get("alias") if p else None,
                "face": st.face_seen,
                **threat_engine.public(st, role, ROLES.get(role, "white") if role else "white")}


def iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    return inter / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter + 1e-9)


def snapshot(img: np.ndarray, head: np.ndarray, size: int = 160) -> bytes:
    """Head-and-shoulders crop for the number's file."""
    H, W = img.shape[:2]
    x1, y1, x2, y2 = head
    pad = (x2 - x1) * 0.25
    x1, y1 = int(max(0, x1 - pad)), int(max(0, y1 - pad))
    x2, y2 = int(min(W, x2 + pad)), int(min(H, y2 + pad))
    if x2 - x1 < 4 or y2 - y1 < 4:
        return b""
    crop = cv2.resize(img[y1:y2, x1:x2], (size, int(size * (y2 - y1) / (x2 - x1))))
    ok, buf = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return buf.tobytes() if ok else b""
