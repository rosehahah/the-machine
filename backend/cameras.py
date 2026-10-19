"""Frame sources: macOS cameras by device name (via ffmpeg/AVFoundation) and image/video files for testing."""
from __future__ import annotations

import re
import subprocess
import threading
import time
from pathlib import Path

import cv2
import numpy as np

W, H = 1280, 720
SKIP_DEVICES = ("desk view", "桌上视角", "capture screen")


def list_cameras() -> list[str]:
    """AVFoundation video device names, in ffmpeg order, minus Desk View / screen capture."""
    try:
        r = subprocess.run(["ffmpeg", "-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""],
                           capture_output=True, text=True, timeout=10)
    except Exception:
        return []
    names, in_video = [], False
    for line in r.stderr.splitlines():
        if "video devices" in line:
            in_video = True
            continue
        if "audio devices" in line:
            break
        m = re.search(r"\]\s\[(\d+)\]\s(.+)$", line)
        if in_video and m:
            name = m.group(2).strip()
            if not any(s in name.lower() for s in SKIP_DEVICES):
                names.append(name)
    return names


class Source:
    """Background reader that always holds the newest frame."""

    def __init__(self):
        self.frame: np.ndarray | None = None
        self.seq = 0
        self.status = "CONNECTING"
        self.error = ""
        self._stop = threading.Event()
        self._cv = threading.Condition()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        self.thread.start()
        return self

    def stop(self):
        self._stop.set()

    def _publish(self, frame: np.ndarray):
        with self._cv:
            self.frame = frame
            self.seq += 1
            self.status = "LIVE"
            self._cv.notify_all()

    def wait(self, last_seq: int, timeout: float = 1.0) -> tuple[int, np.ndarray | None]:
        with self._cv:
            self._cv.wait_for(lambda: self.seq != last_seq or self._stop.is_set(), timeout)
            return self.seq, self.frame

    def _run(self):
        raise NotImplementedError


class CameraSource(Source):
    INPUT_VARIANTS = (
        ["-framerate", "30", "-video_size", "1280x720"],
        ["-framerate", "30", "-video_size", "1920x1080"],
        ["-framerate", "30"],
        [],
    )
    # scale to a fixed canvas so the rawvideo pipe has a known frame size
    VF = f"scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2"

    def __init__(self, device: str):
        super().__init__()
        self.device = device
        self.proc: subprocess.Popen | None = None

    def stop(self):
        super().stop()
        if self.proc:
            self.proc.kill()

    def _run(self):
        variant = 0
        while not self._stop.is_set():
            args = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "avfoundation",
                    *self.INPUT_VARIANTS[variant], "-i", f"{self.device}:none",
                    "-vf", self.VF, "-pix_fmt", "bgr24", "-f", "rawvideo", "pipe:1"]
            self.proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
            size, got_any = W * H * 3, False
            while not self._stop.is_set():
                buf = self._read_exact(self.proc.stdout, size)
                if buf is None:
                    break
                got_any = True
                self._publish(np.frombuffer(buf, np.uint8).reshape(H, W, 3))
            self.proc.kill()
            err = (self.proc.stderr.read() or b"").decode(errors="ignore").strip()
            if self._stop.is_set():
                return
            self.status = "NO SIGNAL"
            self.error = err.splitlines()[-1] if err else "camera closed"
            if not got_any and variant < len(self.INPUT_VARIANTS) - 1:
                variant += 1  # this mode is unsupported by the device; try the next one
                continue
            time.sleep(2.0)

    @staticmethod
    def _read_exact(f, n: int) -> bytes | None:
        chunks, got = [], 0
        while got < n:
            c = f.read(n - got)
            if not c:
                return None
            chunks.append(c)
            got += len(c)
        return b"".join(chunks)


class FileSource(Source):
    """Loops an image or a video file at ~fps — for testing without a camera."""

    def __init__(self, path: str, fps: float = 15):
        super().__init__()
        self.path, self.fps = path, fps

    def _run(self):
        p = Path(self.path)
        if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
            img = cv2.imread(str(p))
            if img is None:
                self.status, self.error = "NO SIGNAL", f"cannot read {p}"
                return
            img = self._fit(img)
            while not self._stop.is_set():
                self._publish(img.copy())
                time.sleep(1 / self.fps)
            return
        while not self._stop.is_set():
            cap = cv2.VideoCapture(str(p))
            fps = cap.get(cv2.CAP_PROP_FPS) or self.fps
            while not self._stop.is_set():
                ok, img = cap.read()
                if not ok:
                    break
                self._publish(self._fit(img))
                time.sleep(1 / fps)
            cap.release()

    @staticmethod
    def _fit(img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        r = min(W / w, H / h)
        out = np.zeros((H, W, 3), np.uint8)
        nw, nh = int(w * r), int(h * r)
        x, y = (W - nw) // 2, (H - nh) // 2
        out[y:y + nh, x:x + nw] = cv2.resize(img, (nw, nh))
        return out
