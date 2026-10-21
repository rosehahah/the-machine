// FEEDS: the camera wall. Mock cameras play stock footage with the real person tracks detected in it;
// who those people are comes from the world at the cursor time. Live cameras come from the server.
import { drawBox, drawLabel, headBox } from "../../hud.js";
import { S, go, on, select } from "../state.js";
import { $, $$, cropStyle, esc, personRow, roleTag } from "../ui.js";
import { DAY, W, camCount, caseStatus, fmtAgo, fmtClock, fmtDay, fmtHM, presentAt, styleOf, toDate } from "../world.js";

const LAYOUTS = { "2×2": 2, "3×3": 3, "4×4": 4 };
const clipCache = new Map();
const loadClip = (id) => {
  if (!clipCache.has(id)) clipCache.set(id, fetch(`media/clips/${id}.json`).then((r) => r.json()));
  return clipCache.get(id);
};

let root, tiles = [], cols = 4, bank = 0, lastSlow = 0, shownLive = 0;

/* ------------------------------------------------------------------ tiles */
class MockTile {
  constructor(cam, el, big = false) {
    this.cam = cam; this.el = el; this.big = big;
    const C = W.cameras[cam];
    el.innerHTML = `<video muted loop playsinline preload="auto" src="media/clips/${C.clip}.mp4"></video><canvas></canvas>
      <div class="osd"><span>${esc(C.name)}</span><span>CAM ${esc(C.id)}</span><span class="clk"></span></div>
      <div class="osd b"><span class="cnt"></span></div><div class="alert hidden"></div>`;
    this.video = $("video", el); this.cv = $("canvas", el); this.ctx = this.cv.getContext("2d");
    if (C.mirror) this.video.style.transform = "scaleX(-1)";
    this.video.addEventListener("loadedmetadata", () => { this.video.currentTime = C.offset % (this.video.duration || 1); });
    this.video.play().catch(() => {});
    this.meta = null; loadClip(C.clip).then((m) => (this.meta = m));
    this.assign = new Map(); // track id -> person
    this.present = []; this.night = null;
  }
  slow(t) {  // once a second: who is here, alerts, night mode
    this.present = presentAt(this.cam, t);
    const ids = new Set(this.present.map((x) => x.p));
    for (const [tid, p] of this.assign) if (!ids.has(p)) this.assign.delete(tid);
    const hr = toDate(t).getHours(), night = hr < 6 || hr >= 20;
    if (night !== this.night) { this.night = night; this.el.classList.toggle("night", night); }
    $(".cnt", this.el).textContent = `SUBJECTS ${this.present.length}` +
      (this.present.some((x) => W.people[x.p].role !== "IRRELEVANT") ? ` · FLAGGED ${this.present.filter((x) => W.people[x.p].role !== "IRRELEVANT").length}` : "");
    let alert = "";
    for (const c of W.cases) {
      if (c.issued > t || t > c.closed + 300) continue;
      for (const e of c.events) if (e.cam === this.cam && e.t <= t && t - e.t < 600 && ["ARMED", "HOSTILE", "DOWN", "PATTERN", "INTERCEPT"].includes(e.kind)) alert = e.text;
    }
    const al = $(".alert", this.el);
    al.textContent = alert; al.classList.toggle("hidden", !alert);
    this.el.classList.toggle("hot", !!alert);
  }
  frame(t) {
    const el = this.el, cv = this.cv, dpr = devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    $(".clk", el).textContent = fmtClock(t);
    const m = this.meta, v = this.video;
    if (!m || !m.n || !v.duration) return;
    // video is letterboxed to 16:9 inside the tile
    let vw = w, vh = w * 9 / 16; if (vh > h) { vh = h; vw = h * 16 / 9; }
    const ox = (w - vw) / 2, oy = (h - vh) / 2;
    const fpos = (v.currentTime / v.duration) * m.n, f0 = Math.floor(fpos) % m.n, f1 = (f0 + 1) % m.n, k = fpos - Math.floor(fpos);
    const next = new Map(m.frames[f1].map((b) => [b[0], b]));
    const boxes = m.frames[f0].map((b) => {
      const n = next.get(b[0]);
      return n ? [b[0], ...b.slice(1).map((v, i) => v + (n[i + 1] - v) * k)] : b;
    });
    this.place(boxes);
    const mirror = W.cameras[this.cam].mirror;
    for (const [tid, x1, y1, x2, y2] of boxes) {
      let bx = ox + (x1 / 1000) * vw, bw = ((x2 - x1) / 1000) * vw;
      if (mirror) bx = ox + vw - (bx - ox) - bw;
      const by = oy + (y1 / 1000) * vh, bh = ((y2 - y1) / 1000) * vh;
      const [hx, hy, hs] = headBox(bx, by, bw, bh);
      const p = this.assign.get(tid);
      const style = p === undefined ? "white" : styleOf(p, t);
      drawBox(ctx, hx, hy, hs, hs, style, p === undefined ? 0.55 : 0.95);
      if (p !== undefined && (W.people[p].role !== "IRRELEVANT" || style !== "white") && (this.big || bh > 40)) {
        const P = W.people[p];
        const text = style === "red" ? "THREAT" : style === "white_red" ? "POTENTIAL THREAT"
          : P.role === "PERSON OF INTEREST" ? "POI" : P.role === "IRRELEVANT" ? "" : P.role;
        if (text) drawLabel(ctx, this.big ? `${text} · ${P.name}` : text, hx, hy, hs, hs, style === "white" ? "white" : style, 0.95, w, this.big ? 12 : 8);
      }
    }
  }
  place(boxes) {  // give flagged people present here a body on screen first, then everyone else
    const free = boxes.filter((b) => !this.assign.has(b[0])).sort((a, b) => (b[4] - b[2]) - (a[4] - a[2]));
    const shown = new Set(this.assign.values());
    const want = this.present.map((x) => x.p).filter((p) => !shown.has(p))
      .sort((a, b) => (W.people[a].role === "IRRELEVANT") - (W.people[b].role === "IRRELEVANT"));
    for (const p of want) { const b = free.shift(); if (!b) break; this.assign.set(b[0], p); }
    if (this.assign.size > 64) this.assign.clear();
  }
  hit(x, y) {  // person under the pointer
    const m = this.meta, v = this.video; if (!m || !v.duration) return null;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    let vw = w, vh = w * 9 / 16; if (vh > h) { vh = h; vw = h * 16 / 9; }
    const ox = (w - vw) / 2, oy = (h - vh) / 2, f = Math.floor((v.currentTime / v.duration) * m.n) % m.n;
    const mirror = W.cameras[this.cam].mirror;
    for (const [tid, x1, y1, x2, y2] of m.frames[f]) {
      let bx = ox + (x1 / 1000) * vw; const bw = ((x2 - x1) / 1000) * vw;
      if (mirror) bx = ox + vw - (bx - ox) - bw;
      const by = oy + (y1 / 1000) * vh, bh = ((y2 - y1) / 1000) * vh;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh && this.assign.has(tid)) return this.assign.get(tid);
    }
    return null;
  }
  destroy() { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); }
}

class LiveTile {
  constructor(feed, el, big = false) {
    this.feed = feed; this.el = el; this.big = big; this.cam = null;
    el.innerHTML = `<canvas class="img"></canvas><canvas></canvas>
      <div class="osd"><span>${esc(feed.label)}</span><span>LIVE · ${esc(feed.device)}</span><span class="clk"></span></div>
      <div class="osd b"><span class="cnt"></span></div><div class="alert hidden"></div>`;
    el.classList.add("is-live");
    this.img = $(".img", el); this.cv = $("canvas:not(.img)", el); this.ctx = this.cv.getContext("2d");
    this.header = null; this.busy = false;
    this.connect();
  }
  connect() {
    const ws = (this.ws = new WebSocket(`ws://${location.host}/ws`));
    ws.binaryType = "arraybuffer";
    ws.onopen = () => ws.send(JSON.stringify({ type: "watch", feed: this.feed.id }));
    ws.onmessage = async (m) => {
      if (typeof m.data === "string" || this.busy) return;
      this.busy = true;
      try {
        const n = new DataView(m.data).getUint32(0);
        this.header = JSON.parse(new TextDecoder().decode(new Uint8Array(m.data, 4, n)));
        if (m.data.byteLength > 4 + n) {
          const bmp = await createImageBitmap(new Blob([new Uint8Array(m.data, 4 + n)], { type: "image/jpeg" }));
          const c = this.img; if (c.width !== bmp.width) { c.width = bmp.width; c.height = bmp.height; }
          c.getContext("2d").drawImage(bmp, 0, 0); bmp.close();
        }
      } catch {}
      this.busy = false;
    };
    ws.onclose = () => { if (!this.dead) setTimeout(() => this.connect(), 1500); };
  }
  slow() {
    const h = this.header;
    $(".cnt", this.el).textContent = h ? `SUBJECTS ${h.tracks.length} · ${h.fps.toFixed(0)} FPS` : "ACQUIRING…";
    const threat = h?.tracks.find((t) => t.threat);
    const al = $(".alert", this.el);
    al.textContent = threat ? (threat.label || "THREAT") : ""; al.classList.toggle("hidden", !threat);
    this.el.classList.toggle("hot", !!threat);
  }
  frame() {
    const el = this.el, cv = this.cv, dpr = devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    $(".clk", el).textContent = fmtClock((Date.now() - W.startMs) / 1000);
    const H = this.header; if (!H) return;
    const ar = H.w / H.h; let vw = w, vh = w / ar; if (vh > h) { vh = h; vw = h * ar; }
    const ox = (w - vw) / 2, oy = (h - vh) / 2;
    Object.assign(this.img.style, { left: `${ox}px`, top: `${oy}px`, width: `${vw}px`, height: `${vh}px` });
    for (const t of H.tracks) {
      const [x1, y1, x2, y2] = t.box, sx = vw / H.w, sy = vh / H.h;
      const bx = ox + x1 * sx, by = oy + y1 * sy, bw = (x2 - x1) * sx, bh = (y2 - y1) * sy;
      drawBox(ctx, bx, by, bw, bh, t.style, 0.95);
      if (t.label) drawLabel(ctx, t.label, bx, by, bw, bh, t.style, 0.95, w, this.big ? 12 : 8);
    }
  }
  hit() { return null; }
  destroy() { this.dead = true; this.ws?.close(); }
}

/* ------------------------------------------------------------------ page */
function sources() {  // live feeds first, then the mock cameras
  return [...S.liveState.feeds.map((f) => ({ live: f })), ...W.cameras.map((_, i) => ({ cam: i }))];
}

function clear() { tiles.forEach((t) => t.destroy()); tiles = []; }

function render() {
  clear();
  shownLive = S.liveState.feeds.length;
  const focus = S.arg;
  if (focus !== null && focus !== undefined) return renderFocus(focus);
  const all = sources(), per = cols * cols, banks = Math.ceil(all.length / per);
  bank = Math.min(bank, banks - 1);
  root.innerHTML = `
    <div class="feeds-bar">
      <span class="ttl">CAMERA WALL</span>
      <span class="sub">${all.length} FEEDS · ${S.liveState.feeds.length} LIVE · ${W.cameras.length} NETWORK</span>
      <span class="grp">${Object.entries(LAYOUTS).map(([k, v]) => `<button data-cols="${v}" class="${v === cols ? "on" : ""}">${k}</button>`).join("")}</span>
      <span class="grp">${Array.from({ length: banks }, (_, i) => `<button data-bank="${i}" class="${i === bank ? "on" : ""}">BANK ${i + 1}</button>`).join("")}</span>
    </div>
    <div class="wall" style="--cols:${cols}"></div>`;
  const wall = $(".wall", root);
  for (const src of all.slice(bank * per, bank * per + per)) {
    const el = document.createElement("div");
    el.className = "tile";
    wall.appendChild(el);
    const tile = src.live ? new LiveTile(src.live, el) : new MockTile(src.cam, el);
    el.dataset.key = src.live ? `L:${src.live.id}` : src.cam;
    tiles.push(tile);
  }
  lastSlow = 0;
}

function renderFocus(arg) {
  const live = arg.startsWith("L:") ? S.liveState.feeds.find((f) => `L:${f.id}` === arg) : null;
  const cam = live ? null : +arg;
  root.innerHTML = `
    <div class="focus">
      <div class="focus-main"><div class="feeds-bar"><button data-back>◀ WALL</button>
        <button data-step="-1">◀</button><button data-step="1">▶</button>
        <span class="ttl">${live ? esc(live.label) : esc(W.cameras[cam].id)}</span>
        <span class="sub">${live ? "LIVE FEED" : esc(W.cameras[cam].name)}</span>
        ${live ? `<a class="btn" href="./">OPEN IN MPOV ↗</a>` : `<button data-map>SHOW ON MAP</button>`}</div>
        <div class="tile big"></div></div>
      <aside class="focus-side panel"></aside>
    </div>`;
  const el = $(".tile.big", root);
  tiles.push(live ? new LiveTile(live, el, true) : new MockTile(cam, el, true));
  lastSlow = 0;
}

function renderSide(t) {
  const side = $(".focus-side", root);
  if (!side) return;
  const tile = tiles[0];
  if (tile instanceof LiveTile) {
    const h = tile.header;
    side.innerHTML = `<h3>LIVE FEED</h3><div class="kv"><span>DEVICE</span><b>${esc(tile.feed.device)}</b><span>STATUS</span><b>${esc(tile.feed.status)}</b></div>
      <h3>IN VIEW</h3>${h?.tracks.map((x) => `<div class="prow"><span class="nm">${esc(x.name || "UNIDENTIFIED")}</span><span class="tag ${x.threat ? "r" : x.role ? "y" : "g"}">${esc(x.label || x.role || "SUBJECT")}</span></div>`).join("") || '<div class="empty">NOBODY IN VIEW</div>'}`;
    return;
  }
  const C = W.cameras[tile.cam];
  const pres = tile.present.slice().sort((a, b) => (W.people[a.p].role === "IRRELEVANT") - (W.people[b.p].role === "IRRELEVANT"));
  const hours = Array.from({ length: 24 }, (_, i) => camCount(tile.cam, t - (24 - i) * 3600, t - (23 - i) * 3600));
  const max = Math.max(1, ...hours);
  const cases = W.cases.filter((c) => c.issued <= t && c.events.some((e) => e.cam === tile.cam && e.t <= t));
  side.innerHTML = `
    <h3>CAMERA</h3>
    <div class="kv"><span>ID</span><b>${esc(C.id)}</b><span>SOURCE</span><b>${esc(C.agency)}</b>
      <span>LOCATION</span><b>${esc(C.name)}</b><span>TYPE</span><b>${esc(C.kind.toUpperCase())}</b></div>
    <h3>ACTIVITY · 24 H</h3>
    <div class="bars">${hours.map((n) => `<i style="height:${(n / max) * 100}%"></i>`).join("")}</div>
    <h3>IN VIEW · ${pres.length}</h3>
    <div class="plist">${pres.slice(0, 40).map((x) => personRow(x.p, fmtAgo(t - x.since).replace(" AGO", ""))).join("") || '<div class="empty">NOBODY IN VIEW</div>'}</div>
    ${cases.length ? `<h3>NUMBERS AT THIS LOCATION</h3>${cases.map((c) => `<div class="crow" data-case="${c.id}"><span class="num">${c.number}</span><span class="tag ${c.list === "RELEVANT" ? "r" : "w"}">${c.list}</span><span class="ex">${caseStatus(c, t)}</span></div>`).join("")}` : ""}`;
}

export default {
  id: "feeds", title: "FEEDS",
  mount(el) {
    root = el;
    root.className = "page page-feeds";
    render();
    root.addEventListener("click", onClick);
  },
  unmount() { clear(); root.removeEventListener("click", onClick); },
  onRoute() { render(); },
  frame(t, now) {
    if (now - lastSlow > 1000) {
      lastSlow = now;
      for (const tile of tiles) tile.slow(t);
      if (S.arg !== null) renderSide(t);
      if (S.liveState.feeds.length !== shownLive && S.arg === null) render();
    }
    for (const tile of tiles) tile.frame(t);
  },
};

function onClick(e) {
  const b = e.target.closest("button, [data-person], [data-case], .tile");
  if (!b) return;
  if (b.dataset.cols) { cols = +b.dataset.cols; bank = 0; render(); }
  else if (b.dataset.bank) { bank = +b.dataset.bank; render(); }
  else if (b.hasAttribute("data-back")) go("feeds");
  else if (b.dataset.step) {
    const all = sources().map((s) => (s.live ? `L:${s.live.id}` : String(s.cam)));
    const i = all.indexOf(S.arg);
    go("feeds", all[(i + +b.dataset.step + all.length) % all.length]);
  }
  else if (b.hasAttribute("data-map")) { select("cam", +S.arg); go("map"); }
  else if (b.dataset.person) { go("subjects", W.people[+b.dataset.person].id); }
  else if (b.dataset.case) go("cases", b.dataset.case);
  else if (b.classList.contains("tile")) {
    const tile = tiles.find((t) => t.el === b);
    if (tile && S.arg !== null) {  // focus view: click a box to open the person
      const r = b.getBoundingClientRect(), p = tile.hit(e.clientX - r.left, e.clientY - r.top);
      if (p !== null) go("subjects", W.people[p].id);
      return;
    }
    if (tile) go("feeds", b.dataset.key);
  }
}
