import { FX } from "./fx.js";
import { clamp, drawBox as drawBoxOn, drawLabel as drawLabelOn } from "./hud.js";

const $ = (s) => document.querySelector(s);
const videoCanvas = $("#video"), hud = $("#hud"), ctx = hud.getContext("2d");
const fx = new FX(videoCanvas);

const WHY = { PERSISTENT: "SUBJECT HAS ACTED", PROXIMITY: "CIVILIAN AT RISK" };
const GREET_EVERY = 10 * 60 * 1000;

const S = {
  ws: null, feed: null, state: { feeds: [], identities: [], roles: [] },
  frameW: 1280, frameH: 720, tracks: new Map(), lastPacket: 0, header: null,
  glitchUntil: 0, glitchAmt: 0, follow: true, statusUntil: 0, statusLock: false,
  dossier: null, greeted: {}, decoding: false, nextPacket: null, pendingBitmap: null, rect: { x: 0, y: 0, w: 1, h: 1 },
  idsKey: "", numsKey: "", listTab: "IRRELEVANT", booted: false, sound: true, audio: null,
};

/* ------------------------------------------------------------------ layout */
function layout() {
  const dpr = window.devicePixelRatio || 1;
  const W = innerWidth, H = innerHeight;
  for (const c of [videoCanvas, hud]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const ar = S.frameW / S.frameH;
  let w = W, h = W / ar;
  if (h > H) { h = H; w = H * ar; }
  S.rect = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  const r = S.rect;
  Object.assign($("#osd-cam").style, { left: `${r.x + r.w * 0.045}px`, top: `${r.y + r.h * 0.06}px` });
  Object.assign($("#osd-time").style, { right: `${W - (r.x + r.w * 0.955)}px`, top: `${r.y + r.h * 0.06}px` });
  Object.assign($("#osd-meta").style, { left: `${r.x + r.w * 0.045}px`, bottom: `${H - (r.y + r.h * 0.95)}px` });
  Object.assign($("#feeds").style, { right: `${W - (r.x + r.w * 0.955)}px`, bottom: `${H - (r.y + r.h * 0.95) + 26}px` });
  $("#status").style.top = `${r.y + r.h * 0.69}px`;
  $("#say").style.top = `${r.y + r.h * 0.72}px`;
}
addEventListener("resize", layout);

/* ------------------------------------------------------------------ socket */
function connect() {
  const ws = (S.ws = new WebSocket(`ws://${location.host}/ws`));
  ws.binaryType = "arraybuffer";
  ws.onopen = () => { if (S.feed) watch(S.feed, true); };
  ws.onclose = () => { S.ws = null; setTimeout(connect, 1000); };
  ws.onmessage = (m) => {
    if (typeof m.data === "string") return onJSON(JSON.parse(m.data));
    if (S.decoding) { S.nextPacket = m.data; return; }
    decode(m.data);
  };
}

async function decode(buf) {
  S.decoding = true;
  try {
    const n = new DataView(buf).getUint32(0);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, n)));
    if (header.feed === S.feed) {
      let bmp = null;
      if (buf.byteLength > 4 + n) bmp = await createImageBitmap(new Blob([new Uint8Array(buf, 4 + n)], { type: "image/jpeg" }));
      if (header.feed === S.feed) {
        if (bmp) { S.pendingBitmap?.close(); S.pendingBitmap = bmp; }
        applyHeader(header);
      } else bmp?.close();
    }
  } catch (e) { console.warn(e); }
  S.decoding = false;
  if (S.nextPacket) { const p = S.nextPacket; S.nextPacket = null; decode(p); }
}

function watch(feed, force) {
  if (feed === S.feed && !force) return;
  S.feed = feed;
  S.tracks.clear();
  S.ws?.readyState === 1 && S.ws.send(JSON.stringify({ type: "watch", feed }));
  renderFeeds();
}

function switchFeed(feed, why) {
  if (feed === S.feed) return;
  glitch(0.55, 0.9);
  showStatus({ top: why || "SWITCHING FEED…", single: true }, 900);
  watch(feed);
}

/* ------------------------------------------------------------------ data */
function applyHeader(h) {
  S.header = h;
  S.lastPacket = performance.now();
  if (h.w !== S.frameW || h.h !== S.frameH) { S.frameW = h.w; S.frameH = h.h; layout(); }
  const now = performance.now() / 1000;
  const seen = new Set();
  for (const t of h.tracks) {
    seen.add(t.id);
    let st = S.tracks.get(t.id);
    if (!st) {
      st = { id: t.id, born: now, box: [...t.box], style: t.style, prev: t.style, changeAt: -9, gone: 0 };
      S.tracks.set(t.id, st);
    }
    if (t.style !== st.style) { st.prev = st.style; st.style = t.style; st.changeAt = now; }
    st.target = t.box; st.data = t; st.gone = 0;
  }
  for (const st of S.tracks.values()) {
    if (!seen.has(st.id) && !st.gone) st.gone = now;
    if (st.gone && now - st.gone > 0.35) S.tracks.delete(st.id);
  }
  handleEnroll(h.enroll);
  renderMeta();
}

function onJSON(m) {
  if (m.type === "state") {
    S.state = m;
    if (!S.feed && m.feeds.length) {
      const live = m.feeds.find((f) => f.status === "LIVE") || m.feeds[0];
      watch(live.id, true);
    }
    renderFeeds(); renderPanel(); checkSignal();
    return;
  }
  if (m.type === "identified") {
    if (m.feed === S.feed) return identified(m);
    if (S.follow && !presentHere(m.pid)) {
      switchFeed(m.feed, "SUBJECT REACQUIRED");
      setTimeout(() => identified(m), 700);
    }
  }
  if (m.type === "lost" && m.feed === S.feed && S.follow) {
    setTimeout(() => {
      if (presentHere(m.pid)) return;
      const other = S.state.feeds.find((f) => f.id !== S.feed && f.people.some((p) => p.pid === m.pid));
      if (other) switchFeed(other.id, "SUBJECT REACQUIRED");
    }, 400);
  }
  if (m.type === "enrolled") toast(`PROFILE COMPILED`, `${m.role}: ${m.name}`, "yellow", 2600);
  if (m.type === "incident") incident(m);
}

/* ------------------------------------------------------------------ threats and numbers */
function incident(m) {
  const n = m.number, away = m.feed !== S.feed;
  if (away && !S.follow && m.kind !== "hostile" && m.kind !== "down") return;
  if (away && S.follow) switchFeed(m.feed, "PRIORITY FEED");
  const delay = away && S.follow ? 800 : 0;
  setTimeout(() => {
    const subj = n.role || "SUBJECT";
    if (m.kind === "armed") {
      glitch(0.3, 0.7);
      toast("POTENTIAL THREAT", `${m.weapon} DETECTED`, "red", 2400);
    } else if (m.kind === "hostile") {
      glitch(0.5, 1);
      toast("THREAT IDENTIFIED", WHY[m.why] || `${m.why.replace("THREAT TO ", "")} AT RISK`, "red", 3200);
    } else if (m.kind === "down") {
      glitch(0.5, 1);
      toast("SITUATION CRITICAL", `${subj} DOWN`, "red", 3200);
    } else if (m.kind === "recovered") toast("SUBJECT MOBILE", "", "", 1600);
    else if (m.kind === "disarmed") toast("STAND DOWN", "NO WEAPON DETECTED", "", 1600);
    if (m.new) {
      ring();
      setTimeout(() => showNumber(n), 1500);
      setTimeout(() => say(n.code.toUpperCase()), 3400);
    }
  }, delay);
}

function showNumber(n) {
  const d = $("#dossier");
  const rows = [
    ["SUBJECT:", n.subject], ["DESIGNATION:", n.role || "NONE"], ["LIST:", n.list],
    ["LAST SEEN:", `${n.feed_label} ${n.timeline[n.timeline.length - 1].t}`],
  ];
  const head = d.querySelector(".head");
  head.textContent = n.drill ? "NUMBER ISSUED · DRILL" : "NUMBER ISSUED";
  head.className = `head ${n.list === "RELEVANT" ? "red" : "white"}`;
  d.querySelector(".sub").textContent = `SSN: ${n.number}`;
  d.querySelector(".body").innerHTML = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${esc(v)}</span>`).join("");
  d.querySelector(".photo").src = `/api/numbers/${n.id}.jpg?${Date.now()}`;
  d.querySelector(".photo").onerror = (e) => e.target.removeAttribute("src");
  d.querySelector(".warn").textContent = "";
  d.classList.remove("hidden", "out");
  S.dossier = { pid: null, track: n.track, feed: n.feed, until: performance.now() + 9000 };
  placeDossier();
}

/* payphone ring: two bursts of 440+480 Hz, warbled at 20 Hz like a bell */
function ring() {
  if (!S.sound) return;
  try {
    const ac = (S.audio ||= new AudioContext());
    const t0 = ac.currentTime + 0.05, out = ac.createGain();
    out.gain.value = 0.12; out.connect(ac.destination);
    for (const start of [0, 0.55, 2.2, 2.75]) {
      const g = ac.createGain(); g.gain.value = 0; g.connect(out);
      const lfo = ac.createOscillator(), lg = ac.createGain();
      lfo.frequency.value = 20; lg.gain.value = 0.5; lfo.connect(lg).connect(g.gain);
      for (const f of [440, 480]) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(g); o.start(t0 + start); o.stop(t0 + start + 0.42); }
      g.gain.setValueAtTime(0.5, t0 + start); g.gain.setValueAtTime(0, t0 + start + 0.42);
      lfo.start(t0 + start); lfo.stop(t0 + start + 0.42);
    }
  } catch (e) { console.warn(e); }
}
const unlockAudio = () => { try { (S.audio ||= new AudioContext()).resume(); } catch {} };
addEventListener("pointerdown", unlockAudio);
addEventListener("keydown", unlockAudio);

const presentHere = (pid) => [...S.tracks.values()].some((t) => !t.gone && t.data?.pid === pid);

/* ------------------------------------------------------------------ identification moment */
function identified(e) {
  glitch(0.25, 0.6);
  toast(`${e.role} IDENTIFIED`, "COMPILING PERSONAL PROFILE…", "yellow", 2200);
  setTimeout(() => showDossier(e), 1400);
  if (e.role === "ADMIN" && Date.now() - (S.greeted[e.pid] || 0) > GREET_EVERY) {
    S.greeted[e.pid] = Date.now();
    const hr = new Date().getHours();
    const part = hr < 5 ? "EVENING" : hr < 12 ? "MORNING" : hr < 18 ? "AFTERNOON" : "EVENING";
    setTimeout(() => say(`GOOD ${part}, ADMIN.`), 2500);
  }
}

function showDossier(e) {
  const d = $("#dossier");
  const clearance = { ADMIN: "UNRESTRICTED", "ANALOG INTERFACE": "DIRECT INTERFACE", "PRIMARY ASSET": "OPERATIONAL",
    "SECONDARY ASSET": "OPERATIONAL" }[e.role] || "NONE";
  const feed = S.state.feeds.find((f) => f.id === S.feed);
  const rows = [
    ["SSN:", "REDACTED"], ["DOB:", "REDACTED"], ["ADDRESS:", "REDACTED"],
    ["OCCUPATION:", e.alias || "REDACTED"], ["CLEARANCE:", clearance],
    ["LAST SEEN:", `${feed?.label || "UNKNOWN"} ${clock()}`],
  ];
  d.querySelector(".head").textContent = `${e.role} IDENTIFIED`;
  d.querySelector(".head").className = "head";
  d.querySelector(".photo").removeAttribute("src");
  d.querySelector(".sub").textContent = `ALIAS: ${e.name}`;
  d.querySelector(".body").innerHTML = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${esc(v)}</span>`).join("");
  d.querySelector(".warn").textContent = "";
  d.classList.remove("hidden", "out");
  S.dossier = { pid: e.pid, track: e.track, feed: e.feed, until: performance.now() + 7000 };
  placeDossier();
}

function placeDossier() {
  const d = $("#dossier"), r = S.rect;
  if (!S.dossier) return;
  const st = trackFor(S.dossier);
  // keep the card clear of the box and its label: use the wider free side
  let bx = r.x + r.w / 2, bw = 0;
  if (st) { const b = toScreen(st.box); bx = b[0]; bw = b[2] * 1.75; } // box + label
  const margin = r.w * 0.04, gap = r.w * 0.025;
  const leftSpace = bx - r.x - margin - gap, rightSpace = r.x + r.w - margin - gap - (bx + bw);
  const onLeft = leftSpace >= rightSpace;
  const w = clamp(Math.max(leftSpace, rightSpace), 230, 420);
  d.style.width = `${w}px`;
  d.style.left = `${onLeft ? Math.max(r.x + margin, bx - gap - w) : Math.min(r.x + r.w - margin - w, bx + bw + gap)}px`;
  d.style.top = `${r.y + r.h * 0.14}px`;
}

function trackFor(ds) {
  if (ds.feed && ds.feed !== S.feed) return null;
  return [...S.tracks.values()].find((t) => !t.gone && (ds.pid ? t.data?.pid === ds.pid : t.id === ds.track)) || null;
}

function say(text) {
  const el = $("#say");
  el.classList.toggle("long", text.length > 30);
  el.innerHTML = "<span></span>";
  const span = el.firstChild;
  let i = 0;
  const tick = () => {
    span.textContent = text.slice(0, ++i) + (i < text.length ? "▌" : "");
    if (i < text.length) setTimeout(tick, 55 + Math.random() * 40);
    else setTimeout(() => (el.innerHTML = ""), 3500);
  };
  tick();
}

/* ------------------------------------------------------------------ status bar */
function showStatus({ top, bottom = "", color = "", single = false, progress = null }, ms) {
  const el = $("#status");
  el.querySelector(".top").textContent = top;
  el.querySelector(".top").className = `top ${color}`;
  el.querySelector(".bottom .text").textContent = bottom;
  el.classList.toggle("single", single || !bottom);
  el.classList.toggle("with-progress", progress !== null);
  if (progress !== null) el.querySelector(".progress i").style.width = `${Math.round(progress * 100)}%`;
  el.classList.remove("hidden");
  S.statusUntil = ms ? performance.now() + ms : Infinity;
}
const toast = (top, bottom, color, ms) => { if (!S.statusLock) showStatus({ top, bottom, color }, ms); };

function handleEnroll(en) {
  if (!en) { if (S.statusLock) { S.statusLock = false; S.statusUntil = 0; } return; }
  S.statusLock = true;
  if (en.state === "ACTIVE") showStatus({ top: "ENROLLING SUBJECT", bottom: dots(en.message), progress: en.progress });
  else if (en.state === "DONE") showStatus({ top: "PROFILE COMPILED", bottom: `${en.role}: ${en.name}`, color: "yellow", progress: 1 });
  else showStatus({ top: "ENROLLMENT FAILED", bottom: en.message, color: "red" });
}
const dots = (s) => s + ".".repeat(1 + (Math.floor(performance.now() / 400) % 3));

/* ------------------------------------------------------------------ HUD drawing */
const toScreen = (b) => {
  const r = S.rect, sx = r.w / S.frameW, sy = r.h / S.frameH;
  return [r.x + b[0] * sx, r.y + b[1] * sy, (b[2] - b[0]) * sx, (b[3] - b[1]) * sy];
};
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

const drawBox = (x, y, w, h, style, alpha) => drawBoxOn(ctx, x, y, w, h, style, alpha);
const drawLabel = (text, x, y, w, h, style, alpha) => drawLabelOn(ctx, text, x, y, w, h, style, alpha, S.rect.x + S.rect.w);

function drawLeader() {
  if (!S.dossier) return;
  const d = $("#dossier");
  if (d.classList.contains("hidden")) return;
  const st = trackFor(S.dossier);
  if (!st) return;
  const [x, y, w, h] = toScreen(st.box);
  const r = d.getBoundingClientRect();
  const toLeft = r.left + r.width / 2 < x;
  const bx = toLeft ? x : x + w, by = y + h / 2;
  const dx = toLeft ? r.right : r.left, dy = r.top + r.height * 0.45;
  ctx.save();
  ctx.strokeStyle = "rgba(240,240,240,.85)"; ctx.lineWidth = 1.2; ctx.shadowColor = "#000"; ctx.shadowBlur = 3;
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(dx, dy); ctx.stroke();
  ctx.fillStyle = "#f2f2f2";
  ctx.beginPath(); ctx.arc(bx, by, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function frame(tms) {
  requestAnimationFrame(frame);
  const now = tms / 1000;
  if (S.pendingBitmap) { fx.upload(S.pendingBitmap); S.pendingBitmap.close(); S.pendingBitmap = null; }
  const dpr = window.devicePixelRatio || 1, r = S.rect;
  const glitchAmt = tms < S.glitchUntil ? S.glitchAmt * (0.5 + Math.random() * 0.5) : (Math.random() < 0.0015 ? 0.35 : 0);
  fx.render({ x: Math.round(r.x * dpr), y: Math.round(r.y * dpr), w: Math.round(r.w * dpr), h: Math.round(r.h * dpr) }, now, glitchAmt);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const st of S.tracks.values()) {
    if (st.target) for (let i = 0; i < 4; i++) st.box[i] += (st.target[i] - st.box[i]) * 0.55;
    let [x, y, w, h] = toScreen(st.box);
    const age = now - st.born;
    const k = ease(age / 0.28);
    const scale = 1 + 0.5 * (1 - k);
    let alpha = Math.min(1, age / 0.18);
    if (st.gone) alpha *= 1 - clamp((now - st.gone) / 0.3, 0, 1);
    const cx = x + w / 2, cy = y + h / 2;
    w *= scale; h *= scale; x = cx - w / 2; y = cy - h / 2;
    let style = st.style;
    const since = now - st.changeAt;
    if (since < 0.45) style = Math.floor(since / 0.075) % 2 ? st.style : st.prev;
    if (st.data?.down) alpha *= 0.55 + 0.45 * (Math.floor(now * 3) % 2); // subject down: slow blink
    drawBox(x, y, w, h, style, alpha);
    if (age < 0.35) drawBox(x, y, w, h, "white", alpha * (1 - age / 0.35) * 0.7); // acquisition flash
    const label = st.data?.label;
    if (label && since >= 0.3) drawLabel(label, x, y, w, h, st.style, alpha * Math.min(1, (since - 0.3) / 0.15));
  }
  drawLeader();

  if (S.dossier && tms > S.dossier.until) {
    const d = $("#dossier");
    d.classList.add("out");
    S.dossier = null;
    setTimeout(() => d.classList.add("hidden"), 400);
  } else placeDossier();
  if (tms > S.statusUntil && !S.statusLock) $("#status").classList.add("hidden");
  $("#osd-time").textContent = clock();
  if (S.statusLock && S.header?.enroll?.state === "ACTIVE") handleEnroll(S.header.enroll);
}

function glitch(sec, amt) { S.glitchUntil = performance.now() + sec * 1000; S.glitchAmt = amt; }

/* ------------------------------------------------------------------ OSD / meta */
const clock = () => new Date().toTimeString().slice(0, 8);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function renderMeta() {
  const h = S.header; if (!h) return;
  const known = h.tracks.filter((t) => t.pid).length, threats = h.tracks.filter((t) => t.threat).length;
  $("#osd-meta").innerHTML =
    `OBJECT ID: <b>[${h.tracks.length ? "TRACKING" : "SCANNING"}]</b><br>` +
    `SUBJECTS: <b>${h.tracks.length}</b> &nbsp; IDENTIFIED: <b>${known}</b>` +
    (threats ? ` &nbsp; <b style="color:#ff3b3b">THREATS: ${threats}</b>` : "") + "<br>" +
    `ASSIGNMENT [${h.feed.slice(1)}] &nbsp; ${h.fps.toFixed(0)} FPS`;
}

function renderFeeds() {
  const f = S.state.feeds.find((x) => x.id === S.feed);
  $("#osd-cam").textContent = f ? f.label : "";
  $("#feeds").innerHTML = S.state.feeds.length > 1 ? S.state.feeds.map((x, i) => {
    const admin = x.people.some((p) => p.role === "ADMIN"), threat = x.people.some((p) => p.threat);
    return `<div class="${x.id === S.feed ? "on" : ""}">${i + 1} · ${esc(x.label)}${admin ? ' <span class="admin">ADMIN</span>' : ""}` +
      `${threat ? ' <span class="threat">THREAT</span>' : ""}</div>`;
  }).join("") : "";
}

function checkSignal() {
  const el = $("#nosignal");
  const f = S.state.feeds.find((x) => x.id === S.feed);
  const stale = performance.now() - S.lastPacket > 2500;
  if (!S.state.feeds.length) {
    el.querySelector(".small").textContent = "NO CAMERAS FOUND. CONNECT A CAMERA AND PRESS M → RESCAN CAMERAS.";
    el.classList.remove("hidden");
  } else if (f && f.status !== "LIVE" && stale) {
    el.querySelector(".small").innerHTML =
      `${esc(f.label)} — ${esc(f.error || f.status)}<br><br>` +
      "IF THIS IS THE FIRST RUN: SYSTEM SETTINGS → PRIVACY &amp; SECURITY → CAMERA → ALLOW YOUR TERMINAL APP, THEN RESTART THE MACHINE.";
    el.classList.remove("hidden");
  } else el.classList.add("hidden");
}

/* ------------------------------------------------------------------ admin terminal */
function renderPanel() {
  const st = S.state;
  $("#feed-list").innerHTML = st.feeds.map((f, i) => `
    <div class="feed-item ${f.id === S.feed ? "on" : ""}" data-feed="${f.id}">
      <div><div class="name">${i + 1} · ${esc(f.label)}</div><div class="dev">${esc(f.device)}</div></div>
      <div class="st ${f.status === "LIVE" ? "" : "bad"}">${esc(f.status)}${f.status === "LIVE" ? ` · ${f.people.length}` : ""}</div>
    </div>`).join("") || '<div class="empty">NO FEEDS</div>';
  const sel = $("#en-role");
  if (!sel.options.length) sel.innerHTML = st.roles.map((r) => `<option>${r}</option>`).join("");
  renderNumbers();
  renderNotify();
  const key = JSON.stringify(st.identities);
  if (key === S.idsKey) return;
  S.idsKey = key;
  $("#id-list").innerHTML = st.identities.map((p) => `
    <div class="id-item" data-pid="${p.id}">
      <div class="nm">${esc(p.name)}</div>
      <button class="danger" data-del="${p.id}">DELETE</button>
      <select data-role="${p.id}">${st.roles.map((r) => `<option ${r === p.role ? "selected" : ""}>${r}</option>`).join("")}</select>
      <div class="meta">${p.alias ? esc(p.alias) + " · " : ""}${p.samples} FACE SAMPLES</div>
    </div>`).join("") || '<div class="empty">NONE ENROLLED</div>';
}

function renderNumbers() {
  const nums = S.state.numbers || [];
  const key = JSON.stringify([S.listTab, nums.map((n) => [n.id, n.updated, n.open, n.list])]);
  if (key === S.numsKey) return;
  S.numsKey = key;
  for (const b of document.querySelectorAll("#panel .tabs button")) {
    const l = b.dataset.list;
    b.classList.toggle("on", l === S.listTab);
    const open = nums.filter((n) => n.list === l && n.open).length;
    b.querySelector("b").textContent = open ? `(${open})` : "";
  }
  const mine = nums.filter((n) => n.list === S.listTab);
  $("#num-list").innerHTML = mine.map((n) => `
    <div class="num-item ${n.open ? "" : "closed"}">
      <img src="/api/numbers/${n.id}.jpg" alt="" onerror="this.style.visibility='hidden'">
      <div class="nb">${esc(n.number)}</div>
      <div class="acts"><button data-view="${n.id}">VIEW</button>${n.open ? `<button class="danger" data-close="${n.id}">CLOSE</button>` : ""}</div>
      <div class="who">${esc(n.subject)}${n.drill ? " · DRILL" : ""}</div>
      <div class="st">${esc(n.open ? n.status : "CLOSED")}</div>
      <div class="tl">${n.timeline.slice(-4).map((l) => `${l.t} ${esc(l.text)}`).join("<br>")}</div>
    </div>`).join("") || `<div class="empty">NO NUMBERS</div>`;
}

function renderNotify() {
  const c = S.state.notify || {};
  $("#nt-mac").checked = !!c.mac;
  if (document.activeElement !== $("#nt-im") && !$("#nt-im").dataset.dirty) $("#nt-im").value = c.imessage_to || "";
}

const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
document.querySelector("#panel .tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-list]");
  if (b) { S.listTab = b.dataset.list; renderNumbers(); }
});
$("#num-list").addEventListener("click", async (e) => {
  const v = e.target.dataset?.view, c = e.target.dataset?.close;
  const n = (S.state.numbers || []).find((x) => x.id === (v || c));
  if (!n) return;
  if (c) { await post(`/api/numbers/${c}/close`); return; }
  togglePanel(false);
  if (n.feed !== S.feed) { S.follow = false; $("#follow").checked = false; switchFeed(n.feed); }
  setTimeout(() => showNumber(n), 500);
});
document.querySelector("[data-drill]").parentElement.addEventListener("click", async (e) => {
  const kind = e.target.dataset?.drill;
  if (!kind) return;
  const r = await post("/api/drill", { feed: S.feed, kind });
  if (r.ok) togglePanel(false);
  else showStatus({ top: "DRILL ABORTED", bottom: (await r.json()).detail?.toUpperCase() || "ERROR", color: "red" }, 2200);
});
$("#nt-mac").addEventListener("change", (e) => post("/api/notify", { mac: e.target.checked }));
$("#nt-im").addEventListener("input", (e) => (e.target.dataset.dirty = "1"));
$("#nt-save").addEventListener("click", async () => {
  await post("/api/notify", { imessage_to: $("#nt-im").value });
  delete $("#nt-im").dataset.dirty;
  showStatus({ top: $("#nt-im").value.trim() ? "IMESSAGE LINK SET" : "IMESSAGE OFF", single: true }, 1400);
});
$("#nt-test").addEventListener("click", async () => {
  await post("/api/notify/test");
  showStatus({ top: "TEST SENT", single: true }, 1400);
});
$("#snd-on").addEventListener("change", (e) => (S.sound = e.target.checked));

$("#feed-list").addEventListener("click", (e) => {
  const it = e.target.closest("[data-feed]");
  if (it) { S.follow = false; $("#follow").checked = false; switchFeed(it.dataset.feed); }
});
$("#id-list").addEventListener("click", async (e) => {
  const pid = e.target.dataset?.del;
  if (pid && confirm("Delete this subject's profile and face samples?")) {
    await fetch(`/api/identities/${pid}`, { method: "DELETE" });
  }
});
$("#id-list").addEventListener("change", async (e) => {
  const pid = e.target.dataset?.role;
  if (pid) await fetch(`/api/identities/${pid}`, { method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: e.target.value }) });
});
$("#enroll").addEventListener("click", async () => {
  const name = $("#en-name").value.trim();
  if (!name) { $("#en-name").focus(); return; }
  const r = await fetch("/api/enroll", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ feed: S.feed, name, alias: $("#en-alias").value, role: $("#en-role").value }) });
  if (r.ok) { togglePanel(false); $("#en-name").value = ""; $("#en-alias").value = ""; }
  else showStatus({ top: "ENROLLMENT FAILED", bottom: (await r.json()).detail || "ERROR", color: "red" }, 2500);
});
$("#rescan").addEventListener("click", async () => {
  const r = await (await fetch("/api/cameras/rescan", { method: "POST" })).json();
  showStatus({ top: r.added ? `${r.added} NEW FEED${r.added > 1 ? "S" : ""} ACQUIRED` : "NO NEW FEEDS", single: true }, 1600);
});
$("#follow").addEventListener("change", (e) => (S.follow = e.target.checked));
$("#fx-on").addEventListener("change", (e) => (fx.enabled = e.target.checked));
$("#reboot").addEventListener("click", () => { togglePanel(false); boot(); });
$("#menu-btn").addEventListener("click", () => togglePanel());
$("#panel-close").addEventListener("click", () => togglePanel(false));

function togglePanel(show) {
  const p = $("#panel");
  p.classList.toggle("hidden", show === undefined ? !p.classList.contains("hidden") : !show);
}

addEventListener("keydown", (e) => {
  if (!S.booted) return finishBoot();
  if (e.target.matches?.("input, select")) { if (e.key === "Escape") e.target.blur(); return; }
  const k = e.key.toLowerCase();
  if (k === "m") togglePanel();
  else if (k === "escape") togglePanel(false);
  else if (k === "f") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  else if (k === "x") { fx.enabled = !fx.enabled; $("#fx-on").checked = fx.enabled; }
  else if (/^[1-9]$/.test(k)) {
    const f = S.state.feeds[+k - 1];
    if (f) { S.follow = false; $("#follow").checked = false; switchFeed(f.id); }
  }
});

/* ------------------------------------------------------------------ boot */
const BOOT = `- - - - - SYSTEM STARTUP - - - - -
START_KERNEL
INIT
RUNLEVEL

LAUNCHING...
CORE ANALYTICS
NEURAL NETWORKS
HEURISTIC ENGINES
RECURSION PROCESSORS
EVOLUTIONARY GENERATORS
BAYESIAN NETWORKS
DATA ACQUISITION
CRYPTOGRAPHIC ALGORITHMS
DOCUMENT PROCESSORS
COMPUTATIONAL LINGUISTICS
VOICEPRINT IDENTIFICATION
NATURAL LANGUAGE PROCESSING
FACIAL RECOGNITION
GAIT ANALYSIS
BIOMETRIC RECOGNITION
SUBJECT IDENTIFICATION
PATTERN MINING
INTEL INTERPRETATION
THREAT DETECTION
THREAT CLASSIFICATION
DISSEMINATION PROTOCOLS
CONTINUITY-OF-OPERATIONS PROTOCOLS

ACQUIRING FEEDS...`.split("\n");
let bootTimer = null;

function boot() {
  const el = $("#boot"), pre = el.querySelector("pre");
  S.booted = false;
  el.classList.remove("done");
  pre.textContent = "";
  let i = 0;
  clearTimeout(bootTimer);
  const step = () => {
    if (i < BOOT.length) {
      pre.textContent += BOOT[i] + "\n";
      bootTimer = setTimeout(step, i < 5 ? 160 : BOOT[i] === "" ? 220 : 70 + Math.random() * 60);
      i++;
    } else bootTimer = setTimeout(finishBoot, 700);
  };
  step();
}
function finishBoot() {
  clearTimeout(bootTimer);
  S.booted = true;
  $("#boot").classList.add("done");
  glitch(0.4, 0.8);
}
$("#boot").addEventListener("click", finishBoot);

/* ------------------------------------------------------------------ go */
layout();
connect();
boot();
requestAnimationFrame(frame);
setInterval(() => { renderMeta(); checkSignal(); }, 1000);
