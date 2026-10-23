"""Threat engine (P3): escalates boxes white -> white/red corners -> red, detects falls, raises incidents.

Rules follow the wiki's box legend (research/raw/The_Machine_MPOV.json):
  white + red corners  "irrelevant threat": armed, but has not acted yet
  red                  "hostile": acted, or threatens the Admin / an asset
Enrolled people (ADMIN, assets, analog interface) are never escalated: in the show Reese carries a gun
and keeps his yellow box. Drills ignore that exemption so the effect can be tried alone.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

ARMED_HITS = 3        # weapon evidence within ARMED_WINDOW before a subject counts as armed:
ARMED_WINDOW = 4.0    # a fast-detector hit weighs 1, a verifier hit 2 (or 3 when it is sure)
ARMED_DECAY = 8.0     # red corners fall back to white after this long without a weapon
HOSTILE_AFTER = 4.0   # armed this long (cumulative) counts as acting
NEAR = 1.5            # armed subject within this many head-widths of someone else counts as acting
DRILL_SECONDS = 6.0
FALL_WINDOW = 1.2     # the head has to drop within this many seconds
FALL_CONFIRM = 1.0    # ...and stay down this long
FRIENDLY = {"ADMIN", "PRIMARY ASSET", "SECONDARY ASSET", "ANALOG INTERFACE"}


@dataclass
class Threat:
    hist: deque = field(default_factory=lambda: deque(maxlen=90))  # (t, cy, side, body_h)
    weapon_hits: deque = field(default_factory=lambda: deque(maxlen=60))  # (t, weight)
    weapon: str = ""
    armed_at: float = 0.0          # 0 = not armed
    armed_total: float = 0.0
    last_tick: float = 0.0
    hostile: bool = False
    down: bool = False
    drop: tuple | None = None      # fall candidate: (t, cy_before, threshold)
    drill_weapon_until: float = 0.0
    drill_fall: bool = False

    @property
    def level(self) -> int:
        return 2 if self.hostile else 1 if self.armed_at else 0


def _owner(weapon_box, alive: list) -> object | None:
    """The person a weapon belongs to: inside their (widened) body box, nearest centre wins."""
    wx, wy = (weapon_box[0] + weapon_box[2]) / 2, (weapon_box[1] + weapon_box[3]) / 2
    best, bd = None, 1e9
    for st in alive:
        x1, y1, x2, y2 = st.body
        bw, bh = x2 - x1, y2 - y1
        if x1 - bw * 0.35 <= wx <= x2 + bw * 0.35 and y1 - bh * 0.1 <= wy <= y2 + bh * 0.15:
            d = abs(wx - (x1 + x2) / 2)
            if d < bd:
                best, bd = st, d
    return best


def _fall_threshold(side: float, body_h: float, H: int) -> float:
    # full body in view: the head must end up below the hips. Close-up: a big fast drop.
    # (a real standing body is 4-7 head boxes tall; close-up boxes made from a face are about 2)
    return 0.45 * body_h if body_h > 0.4 * H and body_h > 3.5 * side else max(1.5 * side, 0.2 * H)


def assess(tracks: dict, alive_ids: set, weapons: list[dict], W: int, H: int, now: float,
           role_of) -> list[dict]:
    """Update every track's Threat and return new incidents."""
    alive = [st for tid, st in tracks.items() if tid in alive_ids]
    incidents: list[dict] = []

    def incident(kind, st, **kw):
        incidents.append({"kind": kind, "tid": st.tid, "pid": st.pid, "role": role_of(st), **kw})

    for w in weapons:
        st = _owner(w["box"], alive)
        if st is not None:
            st.threat.weapon_hits.append((now, w.get("weight", 1)))
            st.threat.weapon = w["kind"]

    friendly_here = [st for st in alive if role_of(st) in FRIENDLY]
    for st in alive:
        t = st.threat
        dt = min(now - t.last_tick, 0.5) if t.last_tick else 0.0
        t.last_tick = now
        cy, side = (st.head[1] + st.head[3]) / 2, st.head[2] - st.head[0]
        t.hist.append((now, cy, side, st.body[3] - st.body[1]))
        drill = now < t.drill_weapon_until
        role = role_of(st)

        # ---- weapons
        hits = sum(wt for h, wt in t.weapon_hits if now - h <= ARMED_WINDOW)
        armed_now = drill or hits >= ARMED_HITS
        exempt = role in FRIENDLY and not drill
        if armed_now and not exempt:
            if not t.armed_at:
                t.armed_at = now
                incident("armed", st, weapon=t.weapon or "WEAPON", drill=drill)
            t.armed_total += dt
        last = max([h for h, _ in t.weapon_hits] + [t.drill_weapon_until])
        if t.armed_at and not t.hostile and not armed_now and now - last > ARMED_DECAY:
            t.armed_at, t.armed_total = 0.0, 0.0
            incident("disarmed", st)
        if t.armed_at and not t.hostile:
            others = [o for o in friendly_here if o is not st]
            why = None
            if others:
                why, target = "THREAT TO " + role_of(others[0]), others[0].pid
            elif t.armed_total >= HOSTILE_AFTER:
                why, target = "PERSISTENT", None
            else:
                for o in alive:
                    if o is st:
                        continue
                    gap = abs((o.head[0] + o.head[2]) / 2 - (st.head[0] + st.head[2]) / 2)
                    if gap < NEAR * max(side, o.head[2] - o.head[0]):
                        why, target = "PROXIMITY", o.pid
                        break
            if why:
                t.hostile = True
                incident("hostile", st, why=why, target=target, drill=drill)

        # ---- falls
        if t.drill_fall:
            t.drill_fall = False
            if not t.down:
                t.down, t.drop = True, (now, cy - side * 3, side * 2)
                incident("down", st, drill=True)
            continue
        recent = [h for h in t.hist if now - h[0] <= FALL_WINDOW]
        top = min(recent, key=lambda h: h[1])
        thr = _fall_threshold(top[2], top[3], H)
        if t.drop is None and not t.down and cy - top[1] >= thr:
            t.drop = (now, top[1], thr)
        if t.drop is not None:
            t0, cy0, thr0 = t.drop
            if cy < cy0 + 0.3 * thr0:          # back up: it was a crouch, or the subject got up
                if t.down:
                    incident("recovered", st)
                t.drop, t.down = None, False
            elif not t.down and now - t0 >= FALL_CONFIRM:
                t.down = True
                incident("down", st, drill=False)

    # fell out of the bottom of the frame: the track vanished mid-drop
    for tid, st in tracks.items():
        t = st.threat
        if tid in alive_ids or t.down or not t.hist or now - st.last_seen < FALL_CONFIRM:
            continue
        t_last, last_cy, last_side, _ = t.hist[-1]
        recent = [h for h in t.hist if t_last - h[0] <= FALL_WINDOW]
        top = min(recent, key=lambda h: h[1])
        if last_cy + last_side * 0.5 > 0.85 * H and last_cy - top[1] >= 0.5 * _fall_threshold(top[2], top[3], H):
            # The head drop alone is not a fall: someone walking out of the bottom of the frame
            # descends just as far. The body box must have changed shape as well — a collapsed
            # person is wide and short — and a box clipped by the frame bottom proves nothing.
            x1, y1, x2, y2 = st.body
            body_h = y2 - y1
            tallest = max(h[3] for h in recent)
            if body_h <= 0.6 * tallest and x2 - x1 >= body_h and y2 < H - 1:
                t.down = True
                incident("down", st, drill=False, offscreen=True)
    return incidents


def public(st, role: str | None, role_style: str) -> dict:
    """Box style and label after the threat engine has had its say."""
    t = st.threat
    if t.hostile:
        return {"style": "red", "label": "THREAT", "threat": 2, "down": t.down}
    if t.armed_at:
        return {"style": "white_red", "label": "POTENTIAL THREAT", "threat": 1, "down": t.down}
    label = role or ("SUBJECT DOWN" if t.down else None)
    return {"style": role_style, "label": label, "threat": 0, "down": t.down}
