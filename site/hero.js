// Landing page hero: a live MPOV replay of a stock clip. The boxes follow the real person tracks detected in
// the footage (tools/build_clips.py); the grade is the MPOV's WebGL pass.
// Demo only (自创 sequence): nobody is enrolled here, so who gets identified as what is scripted (ROLES).
// Only labels the MPOV uses in the show (SPEC §3). No one in the footage is marked as a threat.
import { drawBox, drawLabel, headBox } from "./hud.js";
import { FX } from "./fx.js";

const CLIP = "4332";                 // TIMES SQ, RAIN
const CAM = ["TIMES SQ / 7 AVE & W 45 ST", "CAM DAS-7451"];
// who gets "identified" and when (seconds into the clip). The ADMIN is a man crossing the middle of the frame,
// in view from 8.4 s to 14 s; he also gets the status bar and the greeting.
const TARGET = { tid: 11, at: 8.5 };
const ROLES = new Map([
  [11, { at: 8.5, style: "yellow", label: "ADMIN" }],
  [34, { at: 11.0, style: "yellow", label: "PRIMARY ASSET" }],
  [44, { at: 13.0, style: "black_yellow", label: "ANALOG INTERFACE" }],
  [4, { at: 1.0, style: "white", label: "IRRELEVANT" }],
  [13, { at: 4.6, style: "white", label: "IRRELEVANT" }],
  [22, { at: 7.2, style: "white", label: "IRRELEVANT" }],
  [30, { at: 9.8, style: "white", label: "IRRELEVANT" }],
  [53, { at: 15.0, style: "white", label: "IRRELEVANT" }],
]);
const BLINK = 400;                   // a change of colour flashes old/new 3–4 times over ~0.4 s (SPEC 2.3)
const START_AT = 3;                  // first load: start into the clip so the identification comes soon after boot
const BOOT = ["THE MACHINE · MPOV", "", "ESTABLISHING FEED…", `${CAM[1]} · ${CAM[0]}`, "SIGNAL ACQUIRED."];

const $ = (s, el = document) => el.querySelector(s);
const hero = $("#hero"), cv = $("#hero-fx"), hud = $("#hero-hud"), ctx = hud.getContext("2d");
const video = $("#hero-video");
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

let fx = null;
try { fx = new FX(cv); } catch { cv.style.display = "none"; }  // no WebGL: draw the video on the HUD canvas
let focus = 0.5;                     // narrow screens: which part of the 16:9 frame is in view (0..1)
let meta = null, rect = { x: 0, y: 0, w: 1, h: 1 }, seen = new Map(), since = new Map(), target = null, loopStart = -1, glitchUntil = 0;

fetch(`media/clips/${CLIP}.json`).then((r) => r.json()).then((m) => (meta = m));
video.src = `media/clips/${CLIP}.mp4`;
video.play().catch(() => {});

const pad = (n) => String(n).padStart(2, "0");
const clock = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

/* ------------------------------------------------------------------ boot text, status bar, typewriter */
async function type(el, text, ms = 38) {
  for (let i = 1; i <= text.length; i++) { el.textContent = text.slice(0, i); await sleep(ms); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  const pre = $("#hero-boot pre");
  if (still) { $("#hero-boot").remove(); return; }
  for (const line of BOOT) {
    const span = document.createElement("div"); pre.append(span);
    await type(span, line, 22);
    await sleep(line ? 160 : 60);
  }
  await sleep(350);
  glitchUntil = performance.now() + 450;
  $("#hero-boot").classList.add("out");
  setTimeout(() => $("#hero-boot").remove(), 600);
}

function status(top, bottom, ms) {
  const el = $("#hero-status");
  $(".top", el).textContent = top; $(".bottom", el).textContent = bottom;
  el.classList.remove("hidden"); el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
  clearTimeout(status.t); status.t = setTimeout(() => el.classList.add("hidden"), ms);
}

async function say(text) {
  const el = $("#hero-say span");
  await type(el, text, 55);
  await sleep(2600);
  el.textContent = "";
}

/* ------------------------------------------------------------------ the scripted identification */
function identify() {
  target = { tid: TARGET.tid, at: performance.now() };
  glitchUntil = performance.now() + 380;
  status("ADMIN IDENTIFIED", "COMPILING PERSONAL PROFILE…", 2600);
  const hr = new Date().getHours();
  const part = hr < 5 ? "EVENING" : hr < 12 ? "MORNING" : hr < 18 ? "AFTERNOON" : "EVENING";
  setTimeout(() => say(`GOOD ${part}, ADMIN.`), 2300);
}

/* ------------------------------------------------------------------ frame loop */

function layout() {
  const dpr = devicePixelRatio || 1, w = hero.clientWidth, h = hero.clientHeight;
  for (const c of [cv, hud]) if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  }
  // cover: the 16:9 frame fills the hero, cropped at the sides on narrow screens
  let vw = w, vh = w * 9 / 16, y;
  if (vh >= h) y = (h - vh) / 2;
  else {
    // portrait (phone): zoom in and sit the frame on the bottom edge, so the people (lower part of the shot)
    // land above the title instead of under it; only a strip is visible, panned toward `focus`
    const zoom = w < h ? 1.4 : 1;
    vh = h * zoom; vw = vh * 16 / 9; y = h - vh;
  }
  const x = Math.min(0, Math.max(w - vw, w / 2 - focus * vw));
  rect = { x, y, w: vw, h: vh };
  return { w, h, dpr };
}

function frame(ms) {
  requestAnimationFrame(frame);
  const { w, h, dpr } = layout();
  const glitch = ms < glitchUntil ? 1 : 0;
  if (video.readyState >= 2) {
    if (fx) {
      fx.upload(video);
      fx.render({ x: Math.round(rect.x * dpr), y: Math.round(rect.y * dpr), w: Math.round(rect.w * dpr), h: Math.round(rect.h * dpr) }, ms / 1000, glitch);
    }
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!fx && video.readyState >= 2) ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h);
  $("#hero-time").textContent = clock();
  if (!meta || !video.duration) return;

  // a new loop of the clip: forget who was seen, identify again
  const t = video.currentTime;
  if (t < loopStart || loopStart < 0) { seen.clear(); since.clear(); target = null; loopStart = t; identify.done = false; }
  loopStart = t;

  const fpos = (t / video.duration) * meta.n, f0 = Math.floor(fpos) % meta.n, f1 = (f0 + 1) % meta.n, k = fpos - Math.floor(fpos);
  const next = new Map(meta.frames[f1].map((b) => [b[0], b]));
  const boxes = meta.frames[f0].map((b) => { const n = next.get(b[0]); return n ? [b[0], ...b.slice(1).map((v, i) => v + (n[i + 1] - v) * k)] : b; });
  if (!identify.done && t >= TARGET.at && t < TARGET.at + 2 && !$("#hero-boot")) { identify.done = true; identify(); }

  const tb = target && boxes.find((b) => b[0] === target.tid);
  focus += ((tb ? (tb[1] + tb[3]) / 2000 : 0.5) - focus) * 0.02;

  let shown = 0;
  for (const [tid, x1, y1, x2, y2] of boxes) {
    if (!seen.has(tid)) seen.set(tid, ms);
    const fade = Math.min(1, (ms - seen.get(tid)) / 250);      // boxes snap in as they lock on
    const bx = rect.x + (x1 / 1000) * rect.w, by = rect.y + (y1 / 1000) * rect.h;
    const bw = ((x2 - x1) / 1000) * rect.w, bh = ((y2 - y1) / 1000) * rect.h;
    if (bx + bw < 0 || bx > w) continue;
    shown++;
    const [hx, hy, hs] = headBox(bx, by, bw, bh);
    const role = ROLES.get(tid);
    if (role && t >= role.at && !$("#hero-boot")) {
      if (!since.has(tid)) since.set(tid, ms);
      const age = ms - since.get(tid), blink = age < BLINK && Math.floor(age / 100) % 2 === 0;
      drawBox(ctx, hx, hy, hs, hs, blink ? "white" : role.style, (role.style === "white" ? 0.85 : 0.95) * fade);
      if (!blink) drawLabel(ctx, role.label, hx, hy, hs, hs, role.style, 0.95, w, 13);
    } else {
      drawBox(ctx, hx, hy, hs, hs, "white", 0.6 * fade);
    }
  }
  $("#hero-meta").innerHTML = `OBJECT ID: <b>[TRACKING]</b><br>SUBJECTS: <b>${shown}</b> &nbsp; IDENTIFIED: <b>${[...since.keys()].filter((tid) => ROLES.get(tid).style !== "white").length}</b>`;
}

const [place, street] = CAM[0].split(" / ");
$("#hero-cam").innerHTML = `${place}<span class="hide-sm"> / ${street}</span>`;
video.addEventListener("loadedmetadata", () => {
  video.currentTime = still ? TARGET.at + 1 : START_AT;
  if (still) video.pause();
}, { once: true });
boot();
requestAnimationFrame(frame);
