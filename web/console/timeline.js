// The timeline under every page: 7-day overview, zoomable window, a lane of cases and one lane per camera.
// Drag to scrub, wheel to zoom, shift+wheel (or a sideways swipe) to pan, click the overview to jump.
import { clamp } from "../hud.js";
import { S, goLive, on, seek, select, go, setSpeed, togglePlay } from "./state.js";
import { DAY, W, camCount, fmtClock, fmtDay, fmtHM, nowT, upperBound } from "./world.js";

const $ = (s, el = document) => el.querySelector(s);
const GUTTER = 118, OV_H = 22, AX_H = 18, CASE_H = 20, LANE = 4;
const SPEEDS = [1, 10, 60, 600, 3600];
const ZOOMS = { "1H": 3600, "6H": 6 * 3600, "24H": DAY, "7D": 7 * DAY };

let cv, ctx, wrap, lanesCache = null, cacheKey = "", hover = null, dragging = null;

export function initTimeline(root) {
  root.innerHTML = `
    <div class="tl-bar">
      <button data-act="back" title="Back 1 hour">−1H</button>
      <button data-act="play" class="play" title="Play / pause (space)"></button>
      <button data-act="fwd" title="Forward 1 hour">+1H</button>
      <span class="grp speeds">${SPEEDS.map((v) => `<button data-speed="${v}">${v}×</button>`).join("")}</span>
      <button data-act="live" class="live">● LIVE</button>
      <span class="readout"></span>
      <span class="grp zooms">${Object.keys(ZOOMS).map((k) => `<button data-zoom="${k}">${k}</button>`).join("")}</span>
    </div>
    <div class="tl-canvas"><canvas></canvas><div class="tl-tip hidden"></div></div>`;
  wrap = $(".tl-canvas", root);
  cv = $("canvas", root);
  ctx = cv.getContext("2d");
  $(".tl-bar", root).addEventListener("click", onBar);
  cv.addEventListener("pointerdown", onDown);
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", () => (dragging = null));
  cv.addEventListener("pointerleave", () => { hover = null; $(".tl-tip").classList.add("hidden"); });
  cv.addEventListener("wheel", onWheel, { passive: false });
  cv.addEventListener("dblclick", onDbl);
  addEventListener("resize", size);
  on("sel", () => (cacheKey = ""));
  size();
  zoom(DAY, nowT() - DAY * 0.8);
}

const height = () => OV_H + AX_H + CASE_H + W.cameras.length * LANE + 10;
function size() {
  const dpr = devicePixelRatio || 1, w = wrap.clientWidth, h = height();
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = `${h}px`;
  cacheKey = "";
}

function zoom(span, t0) {
  span = clamp(span, 600, W.end);
  if (t0 === undefined) t0 = S.t - span * 0.8;
  S.view.t0 = clamp(t0, 0, W.end - span);
  S.view.t1 = S.view.t0 + span;
  cacheKey = "";
}

const plotW = () => wrap.clientWidth - GUTTER - 8;
const xOf = (t) => GUTTER + ((t - S.view.t0) / (S.view.t1 - S.view.t0)) * plotW();
const tOf = (x) => S.view.t0 + ((x - GUTTER) / plotW()) * (S.view.t1 - S.view.t0);
const ovX = (t) => GUTTER + (t / W.end) * plotW();

function onBar(e) {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.speed) setSpeed(+b.dataset.speed);
  else if (b.dataset.zoom) zoom(ZOOMS[b.dataset.zoom]);
  else if (b.dataset.act === "play") togglePlay();
  else if (b.dataset.act === "live") { goLive(); zoom(S.view.t1 - S.view.t0); }
  else if (b.dataset.act === "back") seek(S.t - 3600);
  else if (b.dataset.act === "fwd") seek(S.t + 3600);
}

function onDown(e) {
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (x < GUTTER) return;
  if (y < OV_H) {
    const t = ((x - GUTTER) / plotW()) * W.end, span = S.view.t1 - S.view.t0;
    zoom(span, t - span / 2);
    dragging = "ov";
    return;
  }
  dragging = "scrub";
  seek(tOf(x));
}

function onMove(e) {
  if (!cv) return;
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (dragging === "scrub") seek(clamp(tOf(x), S.view.t0, S.view.t1));
  else if (dragging === "ov") { const span = S.view.t1 - S.view.t0; zoom(span, ((x - GUTTER) / plotW()) * W.end - span / 2); }
  if (e.target !== cv) return;
  hover = { x, y };
  tip(x, y, e.clientX, e.clientY);
}

function onWheel(e) {
  e.preventDefault();
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
  const span = S.view.t1 - S.view.t0;
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    zoom(span, S.view.t0 + ((e.deltaX || e.deltaY) / plotW()) * span);
  } else {
    const at = tOf(Math.max(GUTTER, x)), k = Math.exp(e.deltaY * 0.002), ns = clamp(span * k, 600, W.end);
    zoom(ns, at - ((at - S.view.t0) / span) * ns);
  }
}

function hit(x, y) {
  const y0 = OV_H + AX_H;
  if (y >= y0 && y < y0 + CASE_H) {
    const t = tOf(x), now = nowT();
    let best = null;
    W.cases.forEach((c, i) => {
      if (c.issued > now) return;
      if (t >= c.issued - 600 && t <= Math.min(c.closed, now) + 600) best = i;
    });
    return best === null ? null : { case: best };
  }
  const lane = Math.floor((y - y0 - CASE_H) / LANE);
  if (lane >= 0 && lane < W.cameras.length) return { cam: lane };
  return null;
}

function tip(x, y, cx, cy) {
  const el = $(".tl-tip");
  const h = x > GUTTER ? hit(x, y) : null;
  if (!h) { el.classList.add("hidden"); return; }
  const t = tOf(x);
  if (h.case !== undefined) {
    const c = W.cases[h.case];
    el.innerHTML = `<b>NUMBER ${c.id}</b> · ${c.number}<br>${c.list} · ISSUED ${fmtDay(c.issued)} ${fmtHM(c.issued)}`;
  } else {
    const cam = W.cameras[h.cam], span = (S.view.t1 - S.view.t0) / plotW() * 6;
    el.innerHTML = `<b>${cam.id}</b> ${cam.name}<br>${fmtDay(t)} ${fmtHM(t)} · ${camCount(h.cam, t - span, t + span)} SIGHTINGS`;
  }
  el.classList.remove("hidden");
  const wr = wrap.getBoundingClientRect();
  el.style.left = `${clamp(cx - wr.left + 12, 0, wr.width - 260)}px`;
  el.style.top = `${Math.max(0, cy - wr.top - 46)}px`;
}

function onDbl(e) {
  const r = cv.getBoundingClientRect(), h = hit(e.clientX - r.left, e.clientY - r.top);
  if (!h) return;
  if (h.case !== undefined) { select("case", h.case); go("cases", W.cases[h.case].id); }
  else { select("cam", h.cam); go("feeds", h.cam); }
}

/* ------------------------------------------------------------------ drawing */
function lanes(now) {
  const w = plotW(), key = `${S.view.t0}|${S.view.t1}|${w}|${Math.floor(now / 30)}|${S.sel.person}|${cv.width}`;
  if (key === cacheKey && lanesCache) return lanesCache;
  cacheKey = key;
  const dpr = devicePixelRatio || 1;
  const off = (lanesCache ||= document.createElement("canvas"));
  off.width = cv.width; off.height = cv.height;
  const c = off.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, off.width, off.height);
  const y0 = OV_H + AX_H + CASE_H, bucket = 2, span = S.view.t1 - S.view.t0;
  const dt = (span / w) * bucket;
  // density per camera lane
  for (let cam = 0; cam < W.cameras.length; cam++) {
    const ts = W.camT[cam], y = y0 + cam * LANE;
    for (let px = 0; px < w; px += bucket) {
      const a = S.view.t0 + (px / w) * span;
      if (a > now) break;
      const n = upperBound(ts, Math.min(a + dt, now)) - upperBound(ts, a);
      if (!n) continue;
      const v = Math.min(1, Math.log1p(n) / Math.log1p(Math.max(4, dt / 120)));
      c.fillStyle = `rgba(220,226,232,${0.12 + v * 0.75})`;
      c.fillRect(GUTTER + px, y, bucket, LANE - 1);
    }
  }
  // the selected person's path across cameras
  if (S.sel.person !== null) {
    const s = W.sightings, ix = W.personIdx[S.sel.person];
    c.strokeStyle = "rgba(242,224,42,.55)"; c.lineWidth = 1;
    c.beginPath();
    let first = true;
    for (const i of ix) {
      if (s.t[i] > now) break;
      const x = xOf(s.t[i]), y = y0 + s.c[i] * LANE + LANE / 2;
      if (x < GUTTER - 50 || x > GUTTER + w + 50) { first = true; continue; }
      first ? c.moveTo(x, y) : c.lineTo(x, y);
      first = false;
    }
    c.stroke();
    c.fillStyle = "#f2e02a";
    for (const i of ix) {
      if (s.t[i] > now) break;
      const x = xOf(s.t[i]);
      if (x >= GUTTER && x <= GUTTER + w) c.fillRect(x - 1.5, y0 + s.c[i] * LANE - 1, Math.max(3, xOf(s.t[i] + s.d[i]) - x), LANE + 1);
    }
  }
  return off;
}

export function drawTimeline() {
  if (!cv) return;
  const now = nowT(), dpr = devicePixelRatio || 1, w = plotW(), Wd = wrap.clientWidth;
  if (S.live || S.playing) {
    const span = S.view.t1 - S.view.t0;  // keep the cursor in view
    if (S.t > S.view.t1 - span * 0.05 || S.t < S.view.t0) zoom(span, S.t - span * 0.8);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, Wd, height());
  ctx.font = "500 10px Futura, 'Futura PT', Jost, sans-serif";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "1px";

  // gutter labels
  ctx.fillStyle = "#7d858c";
  ctx.fillText("7 DAYS", 10, OV_H / 2);
  ctx.fillText("CASES", 10, OV_H + AX_H + CASE_H / 2);
  ctx.fillText(`CAMERAS · ${W.cameras.length}`, 10, OV_H + AX_H + CASE_H + 10);
  if (S.sel.person !== null) { ctx.fillStyle = "#f2e02a"; ctx.fillText("▬ SUBJECT PATH", 10, OV_H + AX_H + CASE_H + 26); }

  // overview: days, activity of cases, the window
  for (let d = 0; d < W.days; d++) {
    const x0 = ovX(d * DAY), x1 = ovX((d + 1) * DAY);
    ctx.fillStyle = d % 2 ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.065)";
    ctx.fillRect(x0, 3, x1 - x0, OV_H - 6);
    ctx.fillStyle = "#8c949b";
    ctx.fillText(fmtDay(d * DAY + 1), x0 + 6, OV_H / 2);
  }
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(ovX(now), 3, ovX(W.end) - ovX(now), OV_H - 6);
  for (const c of W.cases) if (c.issued <= now) {
    ctx.fillStyle = c.list === "RELEVANT" ? "#e8212b" : "#f2f2f2";
    ctx.fillRect(ovX(c.issued), OV_H - 6, 1.5, 3);
  }
  ctx.strokeStyle = "#f2e02a"; ctx.lineWidth = 1;
  ctx.strokeRect(ovX(S.view.t0) + 0.5, 2.5, Math.max(3, ovX(S.view.t1) - ovX(S.view.t0)), OV_H - 5);

  // axis
  const span = S.view.t1 - S.view.t0;
  const step = [300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, DAY].find((s) => (s / span) * w > 70) || DAY;
  const ay = OV_H;
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  for (let t = Math.ceil(S.view.t0 / step) * step; t <= S.view.t1; t += step) {
    const x = xOf(t);
    ctx.beginPath(); ctx.moveTo(x + 0.5, ay + AX_H - 4); ctx.lineTo(x + 0.5, height()); ctx.stroke();
    ctx.fillStyle = t % DAY === 0 ? "#d6dadd" : "#7d858c";
    ctx.fillText(t % DAY === 0 ? fmtDay(t) : fmtHM(t), x + 4, ay + AX_H / 2);
  }

  // lanes (cached) and the unobserved future
  ctx.drawImage(lanes(now), 0, 0, cv.width / dpr, cv.height / dpr);
  const fx = clamp(xOf(now), GUTTER, GUTTER + w);
  if (fx < GUTTER + w) {
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(fx, OV_H + AX_H, GUTTER + w - fx, height());
    ctx.fillStyle = "#4b5258";
    if (GUTTER + w - fx > 140) ctx.fillText("NOT YET OBSERVED", fx + 10, OV_H + AX_H + CASE_H + 60);
  }

  // cases lane
  const cy = OV_H + AX_H + 4;
  W.cases.forEach((c, i) => {
    if (c.issued > now) return;
    const x0 = xOf(c.issued), x1 = xOf(Math.min(c.closed, now));
    if (x1 < GUTTER || x0 > GUTTER + w) return;
    const sel = S.sel.case === i;
    const red = c.list === "RELEVANT";
    ctx.fillStyle = red ? (sel ? "#ff3b3b" : "rgba(232,33,43,.55)") : (sel ? "#f2f2f2" : "rgba(242,242,242,.35)");
    const a = Math.max(GUTTER, x0), b = Math.min(GUTTER + w, Math.max(x1, x0 + 2));
    ctx.fillRect(a, cy + (i % 3) * 4, b - a, 3);
    for (const e of c.events) {
      if (e.t > now || e.t < S.view.t0 || e.t > S.view.t1) continue;
      if (e.kind === "ARMED" || e.kind === "HOSTILE" || e.kind === "DOWN") {
        ctx.fillStyle = "#e8212b"; ctx.fillRect(xOf(e.t) - 1, cy - 2, 2, 14);
      }
    }
  });

  // live feeds marker, now, cursor
  ctx.fillStyle = "#f2f2f2";
  ctx.fillRect(fx - 0.5, OV_H, 1, height() - OV_H);
  const cx = xOf(S.t);
  if (cx >= GUTTER && cx <= GUTTER + w) {
    ctx.fillStyle = "#f2e02a";
    ctx.fillRect(cx - 1, OV_H, 2, height() - OV_H);
    const label = fmtClock(S.t);
    ctx.font = "600 11px Futura, 'Futura PT', Jost, sans-serif";
    const lw = ctx.measureText(label).width + 12;
    const lx = clamp(cx - lw / 2, GUTTER, GUTTER + w - lw);
    ctx.fillRect(lx, OV_H + 1, lw, AX_H - 2);
    ctx.fillStyle = "#111"; ctx.fillText(label, lx + 6, OV_H + AX_H / 2);
  }
  // hover crosshair
  if (hover && hover.x > GUTTER && !dragging) {
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.fillRect(hover.x, OV_H + AX_H, 1, height());
    const lane = Math.floor((hover.y - OV_H - AX_H - CASE_H) / LANE);
    if (lane >= 0 && lane < W.cameras.length) ctx.fillRect(GUTTER, OV_H + AX_H + CASE_H + lane * LANE - 0.5, w, 0.5);
  }
  renderBar(now);
}

let barKey = "";
function renderBar(now) {
  const lag = now - S.t;
  const key = `${S.live}|${S.playing}|${S.speed}|${Math.round(lag / 10)}|${S.view.t1 - S.view.t0}`;
  if (key === barKey) return;
  barKey = key;
  const bar = $(".tl-bar");
  $(".play", bar).textContent = S.playing ? "❚❚" : "▶";
  $(".live", bar).classList.toggle("on", S.live);
  for (const b of bar.querySelectorAll("[data-speed]")) b.classList.toggle("on", S.playing && +b.dataset.speed === S.speed);
  const span = S.view.t1 - S.view.t0;
  for (const b of bar.querySelectorAll("[data-zoom]")) b.classList.toggle("on", Math.abs(ZOOMS[b.dataset.zoom] - span) < 1);
  $(".readout", bar).innerHTML = S.live ? `<b class="g">LIVE</b> REAL TIME`
    : `<b>REPLAY</b> −${lag < 3600 ? `${Math.round(lag / 60)} MIN` : `${(lag / 3600).toFixed(1)} H`}${S.playing ? ` · ${S.speed}×` : " · PAUSED"}`;
}

export function timelineKeys(e) {
  if (e.key === " ") { togglePlay(); e.preventDefault(); return true; }
  if (e.key === "ArrowLeft") { seek(S.t - (e.shiftKey ? 3600 : 60)); return true; }
  if (e.key === "ArrowRight") { seek(S.t + (e.shiftKey ? 3600 : 60)); return true; }
  if (e.key.toLowerCase() === "l") { goLive(); return true; }
  return false;
}
