"""The Machine — local server. Run: ./run.sh  (or: .venv/bin/python backend/server.py)"""
from __future__ import annotations

import argparse
import asyncio
import atexit
import datetime
import json
import signal
import struct
import subprocess
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cameras import CameraSource, FileSource, Source, list_cameras  # noqa: E402
from numberbook import Notifier, NumberBook  # noqa: E402
from threat import DRILL_SECONDS  # noqa: E402
from vision import DATA, MODELS, ROLES, CameraTracker, Faces, IdentityStore, PersonDetector, WeaponVerifier  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"

ENROLL_SAMPLES = 12
ENROLL_TIMEOUT = 10.0
IDLE_FPS = 4  # feeds nobody is watching are still analysed, slower, so the system can follow people
VERIFY_EMPTY_EVERY = 10.0  # re-check feeds with nobody in them now and then, to learn the scenery
VERIFY_MIN_GAP = 1.5       # the verifier is CPU-heavy: at most one pass per feed this often, with a breather


class Enrollment:
    def __init__(self, name: str, role: str, alias: str):
        self.name, self.role, self.alias = name.upper(), role, alias.upper()
        self.samples: list[np.ndarray] = []
        self.started = time.time()
        self.state = "ACTIVE"   # ACTIVE | DONE | FAILED
        self.message = "HOLD STILL"
        self.pid: str | None = None
        self.last_frame = -99
        self.ended = 0.0


class Feed:
    def __init__(self, fid: str, label: str, source: Source, device: str, sys_: "System"):
        self.id, self.label, self.source, self.device, self.sys = fid, label, source, device, sys_
        self.tracker = CameraTracker(sys_.faces, sys_.store)
        self.packet: bytes | None = None
        self.packet_seq = 0
        self.tracks: list[dict] = []
        self.watchers = 0
        self.fps = 0.0
        self.enroll: Enrollment | None = None
        self.known_pids: set[str] = set()
        self.frame: np.ndarray | None = None  # last analysed frame, for the weapon verifier
        self.verify_at = 0.0
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.source.start()
        self.thread.start()

    def _run(self):
        seq, last_t, frames, t0 = 0, 0.0, 0, time.time()
        while True:
            seq, frame = self.source.wait(seq)
            if frame is None:
                continue
            now = time.time()
            if self.watchers == 0 and self.enroll is None and now - last_t < 1 / IDLE_FPS:
                continue
            last_t = now
            persons, pscores, weapons = self.sys.detector(frame)
            faces = self.sys.faces.detect(frame)
            self.tracks = self.tracker.step(frame, persons, pscores, faces, weapons)
            self.frame = frame
            self._emit_incidents()
            if self.enroll and self.enroll.state == "ACTIVE":
                self._enroll_step(frame, faces)
            self._emit_identity_events()
            frames += 1
            if now - t0 >= 1.0:
                self.fps, frames, t0 = frames / (now - t0), 0, now
            header = {"type": "frame", "feed": self.id, "ts": now, "w": frame.shape[1], "h": frame.shape[0],
                      "tracks": self.tracks, "fps": round(self.fps, 1), "enroll": self._enroll_public()}
            jpeg = b""
            if self.watchers:
                ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 78])
                jpeg = buf.tobytes() if ok else b""
            hb = json.dumps(header).encode()
            self.packet = struct.pack(">I", len(hb)) + hb + jpeg
            self.packet_seq += 1

    def _emit_incidents(self):
        while self.tracker.incidents:
            inc = self.tracker.incidents.pop(0)
            got = self.sys.book.record(inc, self.id, self.label)
            if got is None:
                continue
            n, is_new = got
            print(f"[machine] {inc['kind']} on {self.label} track {inc['tid']} -> {n['number']} "
                  f"({n['list']}{', new' if is_new else ''})", flush=True)
            self.sys.event({"type": "incident", "kind": inc["kind"], "feed": self.id, "track": inc["tid"],
                            "why": inc.get("why"), "weapon": inc.get("weapon"), "new": is_new, "number": n})

    def drill(self, kind: str) -> bool:
        """Pretend the biggest subject in view picked up a weapon / fell."""
        if not self.tracks:
            return False
        tid = max(self.tracks, key=lambda t: t["box"][2] - t["box"][0])["id"]
        st = self.tracker.track(tid)
        if st is None:
            return False
        if kind == "weapon":
            st.threat.weapon = "WEAPON"
            st.threat.drill_weapon_until = time.time() + DRILL_SECONDS
        else:
            st.threat.drill_fall = True
        return True

    def _emit_identity_events(self):
        present = {t["pid"] for t in self.tracks if t["pid"]}
        for pid in present - self.known_pids:
            t = next(t for t in self.tracks if t["pid"] == pid)
            self.sys.event({"type": "identified", "feed": self.id, "pid": pid, "role": t["role"],
                            "name": t["name"], "alias": t["alias"], "track": t["id"]})
        for pid in self.known_pids - present:
            self.sys.event({"type": "lost", "feed": self.id, "pid": pid})
        self.known_pids = present

    def _enroll_step(self, frame: np.ndarray, faces: np.ndarray):
        e = self.enroll
        if time.time() - e.started > ENROLL_TIMEOUT:
            if len(e.samples) >= 4:
                self._enroll_finish()
            else:
                e.state, e.message, e.ended = "FAILED", "NO CLEAR FACE. TRY AGAIN", time.time()
            return
        if len(faces) == 0:
            e.message = "NO FACE DETECTED"
            return
        f = max(faces, key=lambda r: r[2] * r[3])
        if f[2] < 90:
            e.message = "MOVE CLOSER"
            return
        if len(faces) > 1 and sorted(faces[:, 2])[-2] > f[2] * 0.7:
            e.message = "ONE SUBJECT ONLY"
            return
        e.last_frame += 1
        if e.last_frame % 2:
            return
        e.samples.append(self.sys.faces.embed(frame, f))
        e.message = "HOLD STILL"
        e.box = [float(v) for v in f[:4]]
        if len(e.samples) >= ENROLL_SAMPLES:
            self._enroll_finish()

    def _enroll_finish(self):
        e = self.enroll
        e.pid = self.sys.store.add(e.name, e.role, e.samples, e.alias)
        e.state, e.message, e.ended = "DONE", "PROFILE COMPILED", time.time()
        # force re-identification on all feeds
        for feed in self.sys.feeds.values():
            for st in feed.tracker.tracks.values():
                st.last_embed_frame = -999
        self.sys.event({"type": "enrolled", "pid": e.pid, "name": e.name, "role": e.role})

    def _enroll_public(self):
        e = self.enroll
        if not e:
            return None
        if e.state != "ACTIVE" and time.time() - e.ended > 2.5:
            self.enroll = None
            return None
        return {"state": e.state, "progress": len(e.samples) / ENROLL_SAMPLES, "message": e.message,
                "name": e.name, "role": e.role, "box": getattr(e, "box", None)}

    def public(self) -> dict:
        return {"id": self.id, "label": self.label, "device": self.device, "status": self.source.status,
                "error": self.source.error, "fps": round(self.fps, 1),
                "people": [{"pid": t["pid"], "role": t["role"], "name": t["name"], "threat": t["threat"]}
                           for t in self.tracks]}


class System:
    def __init__(self):
        print("[machine] loading models…", flush=True)
        self.detector = PersonDetector()
        self.faces = Faces()
        self.store = IdentityStore()
        self.notifier = Notifier(DATA / "config.json")
        self.book = NumberBook(self.notifier, self.store.ssn)
        self.feeds: dict[str, Feed] = {}
        self.events: list[dict] = []
        self.event_seq = 0
        self.lock = threading.Lock()
        self.verifier = None
        if (MODELS / "owlv2_weapons.onnx").exists():
            self.verifier = WeaponVerifier()
            threading.Thread(target=self._verify_loop, daemon=True).start()
        else:
            print("[machine] models/owlv2_weapons.onnx missing: weapon detection uses the fast detector only", flush=True)

    def _verify_loop(self):
        """Weapon verifier: one feed at a time, the least recently checked feed with people in it first."""
        while True:
            now = time.time()
            due = [f for f in self.feeds.values() if f.frame is not None and
                   now - f.verify_at > VERIFY_MIN_GAP and
                   (f.tracks or f.tracker.verify_passes == 0 or now - f.verify_at > VERIFY_EMPTY_EVERY)]
            if not due:
                time.sleep(0.3)
                continue
            feed = min(due, key=lambda f: f.verify_at)
            try:
                found = self.verifier(feed.frame)
            except Exception as e:  # noqa: BLE001
                print(f"[machine] weapon verifier failed: {e}", flush=True)
                time.sleep(2)
                continue
            feed.tracker.add_verified(found)
            feed.verify_at = time.time()
            time.sleep(0.25)

    def event(self, e: dict):
        with self.lock:
            self.event_seq += 1
            e["seq"], e["ts"] = self.event_seq, time.time()
            self.events = (self.events + [e])[-100:]

    def add_feed(self, label: str, source: Source, device: str):
        fid = f"f{len(self.feeds)}"
        feed = Feed(fid, label, source, device, self)
        self.feeds[fid] = feed
        feed.start()
        print(f"[machine] feed {fid}: {label} <- {device}", flush=True)

    def add_cameras(self):
        have = {f.device for f in self.feeds.values()}
        n = 0
        for name in list_cameras():
            if name in have:
                continue
            prefix = "FAC ALPH" if "macbook" in name.lower() or "facetime" in name.lower() else "MOB BRAV"
            self.add_feed(f"{prefix} {len(self.feeds) + 1:02d}", CameraSource(name), name)
            n += 1
        return n


SYS: System
app = FastAPI()


class EnrollReq(BaseModel):
    feed: str
    name: str
    role: str = "ADMIN"
    alias: str = ""


class DrillReq(BaseModel):
    feed: str
    kind: str  # weapon | fall


class NotifyReq(BaseModel):
    mac: bool | None = None
    imessage_to: str | None = None


class PatchReq(BaseModel):
    name: str | None = None
    role: str | None = None
    alias: str | None = None


@app.get("/api/state")
def state():
    return {"feeds": [f.public() for f in SYS.feeds.values()], "identities": SYS.store.public(),
            "roles": list(ROLES), "numbers": SYS.book.public(), "notify": SYS.notifier.cfg}


@app.post("/api/drill")
def drill(r: DrillReq):
    feed = SYS.feeds.get(r.feed)
    if not feed:
        raise HTTPException(404, "feed not found")
    if r.kind not in ("weapon", "fall"):
        raise HTTPException(400, "unknown drill")
    if not feed.drill(r.kind):
        raise HTTPException(409, "no subject in view")
    return {"ok": True}


@app.get("/api/numbers/{nid}.jpg")
def number_snap(nid: str):
    img = SYS.book.snaps.get(nid)
    if not img:
        raise HTTPException(404)
    return Response(img, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.post("/api/numbers/{nid}/close")
def number_close(nid: str):
    SYS.book.close(nid)
    return {"ok": True}


@app.post("/api/notify")
def notify_cfg(r: NotifyReq):
    SYS.notifier.set(mac=r.mac, imessage_to=r.imessage_to.strip() if r.imessage_to is not None else None)
    return SYS.notifier.cfg


@app.post("/api/notify/test")
def notify_test():
    SYS.notifier.send("TEST", "DISSEMINATION PROTOCOLS ONLINE.", "THE MACHINE: DISSEMINATION PROTOCOLS ONLINE.")
    return {"ok": True}


@app.post("/api/cameras/rescan")
def rescan():
    return {"added": SYS.add_cameras()}


@app.post("/api/enroll")
def enroll(r: EnrollReq):
    feed = SYS.feeds.get(r.feed)
    if not feed:
        raise HTTPException(404, "feed not found")
    if r.role not in ROLES:
        raise HTTPException(400, "unknown role")
    if not r.name.strip():
        raise HTTPException(400, "name required")
    feed.enroll = Enrollment(r.name.strip(), r.role, r.alias.strip())
    return {"ok": True}


@app.patch("/api/identities/{pid}")
def patch_identity(pid: str, r: PatchReq):
    if r.role and r.role not in ROLES:
        raise HTTPException(400, "unknown role")
    SYS.store.update(pid, name=r.name, role=r.role, alias=r.alias)
    return {"ok": True}


@app.delete("/api/identities/{pid}")
def delete_identity(pid: str):
    SYS.store.delete(pid)
    for feed in SYS.feeds.values():
        for st in feed.tracker.tracks.values():
            if st.pid == pid:
                st.pid, st.votes = None, {}
    return {"ok": True}


@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    watching: Feed | None = None
    sent_seq, sent_event = 0, SYS.event_seq
    last_state = 0.0

    async def reader():
        nonlocal watching, sent_seq
        while True:
            msg = json.loads(await sock.receive_text())
            if msg.get("type") == "watch":
                if watching:
                    watching.watchers -= 1
                watching = SYS.feeds.get(msg.get("feed"))
                if watching:
                    watching.watchers += 1
                sent_seq = 0

    rt = asyncio.create_task(reader())
    try:
        while not rt.done():
            now = time.time()
            if watching and watching.packet_seq != sent_seq and watching.packet:
                sent_seq = watching.packet_seq
                await sock.send_bytes(watching.packet)
            if SYS.event_seq != sent_event:
                with SYS.lock:
                    new = [e for e in SYS.events if e["seq"] > sent_event]
                sent_event = SYS.event_seq
                for e in new:
                    await sock.send_text(json.dumps(e))
            if now - last_state > 0.5:
                last_state = now
                await sock.send_text(json.dumps({"type": "state", **state()}))
            await asyncio.sleep(0.006)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        rt.cancel()
        if watching:
            watching.watchers -= 1


@app.get("/")
def index():
    return FileResponse(WEB / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/console")
def console():
    return FileResponse(WEB / "console.html", headers={"Cache-Control": "no-store"})


app.mount("/", StaticFiles(directory=WEB), name="web")


def refresh_world():
    """The console's mock city covers the 7 days up to today; rebuild it when the window has moved on."""
    world = WEB / "data" / "world.json"
    start = (datetime.date.today() - datetime.timedelta(days=6)).isoformat()
    try:
        with world.open() as f:
            if json.loads(f.read(200).split(',"days"')[0] + "}").get("start") == start:
                return
    except (OSError, ValueError):
        pass
    print("[machine] building the console archive for the last 7 days…", flush=True)
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "gen_world.py"), "--start", start])
    if r.returncode:
        print("[machine] console archive failed; the console will show the old one", flush=True)


def main():
    global SYS
    ap = argparse.ArgumentParser(description="The Machine")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--source", action="append", default=[],
                    help="extra feed from an image/video file (repeatable), e.g. --source test.mp4")
    ap.add_argument("--no-cameras", action="store_true", help="do not open the Mac/iPhone cameras")
    a = ap.parse_args()
    refresh_world()
    SYS = System()
    if not a.no_cameras:
        if SYS.add_cameras() == 0:
            print("[machine] no cameras found", flush=True)
    for i, s in enumerate(a.source):
        SYS.add_feed(f"SEC CAM {len(SYS.feeds) + 1:02d}", FileSource(s), Path(s).name)
    atexit.register(shutdown)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))  # runs atexit -> releases cameras
    print(f"[machine] online -> http://localhost:{a.port}", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="warning")


def shutdown():
    for feed in SYS.feeds.values():
        feed.source.stop()  # kills the ffmpeg camera process


if __name__ == "__main__":
    main()
