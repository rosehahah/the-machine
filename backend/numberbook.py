"""The two lists, the numbers on them, and how they are delivered.

A number is what the Machine gives out in the show: a nine-digit SSN-style number and a spoken code
("Uncertainty, Romeo, Kilo; Family, Alpha, Mike; Reflections, Juliet, Oscar."). It never says why.
Enrolled subjects keep one stable number. Unknown subjects get a fresh one per incident and an
anonymous designation (UNKNOWN-0427); nothing is looked up anywhere.

Lists, scaled down to a household: RELEVANT = the Machine's own people are in danger (an Admin or
asset is threatened or down). IRRELEVANT = everything else. Numbers live in memory only.
"""
from __future__ import annotations

import json
import random
import subprocess
import threading
import time
from pathlib import Path

NATO = ("Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo Lima Mike November Oscar Papa "
        "Quebec Romeo Sierra Tango Uniform Victor Whiskey X-Ray Yankee Zulu").split()
# key words in the spirit of the show's book-code numbers
WORDS = ("Ambiguity Ballast Cartography Cipher Compass Continuum Corridor Dominion Driftwood Equinox Ferry "
         "Fidelity Filament Harbor Heuristic Inference Inventory Isotope Lantern Ledger Lighthouse Marrow "
         "Meridian Monolith Nocturne Obelisk Orchard Parallax Pilgrim Quarry Recursion Remnant Salvage "
         "Semaphore Signal Solstice Sparrow Tributary Undertow Vantage Vigil Wayfarer Winter").split()
REOPEN_WINDOW = 10 * 60  # a new incident for the same subject within this window updates the old number


def new_ssn(rng: random.Random) -> str:
    return f"{rng.randint(1, 899):03d}-00-{rng.randint(1, 9999):04d}"  # the show's numbers all read ###-00-####


def code_for(number: str) -> str:
    rng = random.Random(number)
    return "; ".join(f"{rng.choice(WORDS)}, {rng.choice(NATO)}, {rng.choice(NATO)}" for _ in range(3)) + "."


class Notifier:
    """macOS notification (on by default) and an optional iMessage to the Admin's phone."""

    def __init__(self, path: Path):
        self.path = path
        self.cfg = {"mac": True, "imessage_to": ""}
        if path.exists():
            self.cfg.update(json.loads(path.read_text()))

    def set(self, **kw):
        self.cfg.update({k: v for k, v in kw.items() if v is not None})
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.cfg))

    def send(self, title: str, body: str, sms: str):
        threading.Thread(target=self._send, args=(title, body, sms), daemon=True).start()

    def _send(self, title: str, body: str, sms: str):
        if self.cfg.get("mac"):
            _osascript(f'display notification {_q(body)} with title "THE MACHINE" subtitle {_q(title)} '
                       f'sound name "Submarine"')
        to = (self.cfg.get("imessage_to") or "").strip()
        if to:
            _osascript(f'tell application "Messages" to send {_q(sms)} to participant {_q(to)} of '
                       f'(1st account whose service type = iMessage)')


def _q(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _osascript(script: str):
    try:
        r = subprocess.run(["osascript", "-e", script], capture_output=True, text=True, timeout=15)
        if r.returncode:
            print(f"[machine] notify failed: {r.stderr.strip()[:200]}", flush=True)
    except Exception as e:  # noqa: BLE001 — delivery must never take the feed down
        print(f"[machine] notify failed: {e}", flush=True)


class NumberBook:
    def __init__(self, notifier: Notifier, ssn_for):
        self.notifier = notifier
        self.ssn_for = ssn_for          # pid -> stable number for an enrolled subject
        self.lock = threading.Lock()
        self.numbers: dict[str, dict] = {}
        self.snaps: dict[str, bytes] = {}
        self.unknown_seq = random.Random().randint(100, 900)
        self.rng = random.Random()

    def record(self, inc: dict, feed_id: str, feed_label: str) -> tuple[dict, bool] | None:
        """Turn a threat-engine incident into a new or updated number. Returns (number, is_new)."""
        kind = inc["kind"]
        if kind not in ("armed", "hostile", "down", "recovered", "disarmed"):
            return None
        key = inc["pid"] or f"{feed_id}:{inc['tid']}"
        now = time.time()
        clock = time.strftime("%H:%M:%S")
        line = {"armed": "STATUS: POTENTIAL THREAT", "hostile": "STATUS: THREAT", "down": "STATUS: SUBJECT DOWN",
                "recovered": "STATUS: SUBJECT MOBILE", "disarmed": "STATUS: STAND DOWN"}[kind]
        if inc.get("drill"):
            line += " (DRILL)"
        relevant = (kind == "down" and inc["role"] in ("ADMIN", "PRIMARY ASSET", "SECONDARY ASSET", "ANALOG INTERFACE")) \
            or (kind == "hostile" and str(inc.get("why", "")).startswith("THREAT TO"))
        with self.lock:
            n = next((n for n in self.numbers.values() if n["key"] == key and n["open"]
                      and now - n["updated"] < REOPEN_WINDOW), None)
            if n is None:
                if kind in ("recovered", "disarmed"):
                    return None
                if inc["pid"]:
                    number, subject = self.ssn_for(inc["pid"]), inc.get("name") or "UNKNOWN"
                else:
                    self.unknown_seq += 1
                    number, subject = new_ssn(self.rng), f"UNKNOWN-{self.unknown_seq:04d}"
                nid = f"n{int(now * 1000) % 10**9}"
                n = self.numbers[nid] = {
                    "id": nid, "key": key, "number": number, "code": code_for(number), "subject": subject,
                    "role": inc["role"], "list": "RELEVANT" if relevant else "IRRELEVANT", "open": True,
                    "drill": bool(inc.get("drill")), "feed": feed_id, "feed_label": feed_label, "track": inc["tid"],
                    "created": now, "updated": now, "status": line.split(": ", 1)[1],
                    "timeline": [{"t": clock, "text": f"ACQUIRED: {feed_label}"}, {"t": clock, "text": line}],
                }
                is_new = True
            else:
                is_new = False
                n["updated"], n["feed"], n["feed_label"], n["track"] = now, feed_id, feed_label, inc["tid"]
                n["status"] = line.split(": ", 1)[1]
                n["timeline"].append({"t": clock, "text": line})
                if relevant and n["list"] != "RELEVANT":
                    n["list"] = "RELEVANT"
                    n["timeline"].append({"t": clock, "text": "RECLASSIFIED: RELEVANT"})
            if inc.get("snap") and kind in ("armed", "hostile", "down"):
                self.snaps[n["id"]] = inc["snap"]
            out = dict(n)
        if is_new:
            self.notifier.send(f"{n['list']} · {n['number']}", n["code"],
                               f"{n['number']}\n{n['code']}")
        return out, is_new

    def close(self, nid: str):
        with self.lock:
            if nid in self.numbers:
                self.numbers[nid]["open"] = False
                self.numbers[nid]["timeline"].append({"t": time.strftime("%H:%M:%S"), "text": "CASE CLOSED"})

    def public(self) -> list[dict]:
        with self.lock:
            return sorted(({k: v for k, v in n.items() if k != "key"} for n in self.numbers.values()),
                          key=lambda n: -n["created"])
