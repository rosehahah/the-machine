// NETWORK: who has been on camera with whom. Overview of everyone flagged, or the selected person's
// two-step circle. Edges appear as the clock passes their first co-location. Drag nodes, click to focus.
import { S, go, on, select } from "../state.js";
import { $, esc, personRow } from "../ui.js";
import { W, roleClass } from "../world.js";

const COLOR = { y: "#f2e02a", by: "#f2e02a", r: "#e8212b", w: "#f2f2f2", g: "#6d757c" };
let root, cv, ctx, nodes = [], edges = [], idx = new Map(), mode = "EGO", graphKey = "", lastSlow = 0;
let dragN = null, hoverN = null, pan = { x: 0, y: 0 };
// zoom out about the centre when the layout is bigger than the canvas (pinning nodes to the edges made them bounce)
let view = 1;
const sx = (x) => cv.clientWidth / 2 + (x - cv.clientWidth / 2) * view;
const sy = (y) => cv.clientHeight / 2 + (y - cv.clientHeight / 2) * view;
const wx = (x) => cv.clientWidth / 2 + (x - cv.clientWidth / 2) / view;
const wy = (y) => cv.clientHeight / 2 + (y - cv.clientHeight / 2) / view;
function fit(w, h) {
  let rx = 1, ry = 1;
  for (const n of nodes) { rx = Math.max(rx, Math.abs(n.x - w / 2)); ry = Math.max(ry, Math.abs(n.y - h / 2)); }
  const want = Math.min(1, (w / 2 - 30) / rx, (h / 2 - 16) / ry);
  view = Math.abs(want - view) < 0.002 ? want : view + (want - view) * 0.15;
}

function build(t) {
  const key = `${mode}|${S.sel.person}|${Math.floor(t / 3600)}`;
  if (key === graphKey) return;
  graphKey = key;
  const keep = new Map(nodes.map((n) => [n.p, n]));
  const want = new Set(), caseLinks = new Set();
  for (const c of W.cases) if (c.issued <= t) for (const a of c.people) for (const b of c.people) if (a < b) caseLinks.add(`${a}|${b}`);
  const nb = (p, k) => W.neighbors[p].filter(([, , f]) => f <= t).slice(0, k);
  if (mode === "EGO" && S.sel.person !== null) {
    const p0 = S.sel.person;
    want.add(p0);
    for (const [q] of nb(p0, 14)) { want.add(q); for (const [r] of nb(q, 4)) want.add(r); }
  } else {
    W.people.forEach((P, p) => { if (P.role !== "IRRELEVANT") want.add(p); });
    for (const c of W.cases) if (c.issued <= t) c.people.forEach((p) => want.add(p));
    for (const p of [...want]) for (const [q] of nb(p, 2)) want.add(q);
  }
  const w = cv.clientWidth, h = cv.clientHeight;
  nodes = [...want].map((p) => keep.get(p) || { p, x: w / 2 + (Math.random() - 0.5) * w * 0.6, y: h / 2 + (Math.random() - 0.5) * h * 0.6, vx: 0, vy: 0 });
  idx = new Map(nodes.map((n, i) => [n.p, i]));
  edges = [];
  for (const [a, b, n, f] of W.edges) {
    if (f > t || !idx.has(a) || !idx.has(b)) continue;
    edges.push({ a: idx.get(a), b: idx.get(b), n, hot: caseLinks.has(`${a}|${b}`) });
  }
  for (const k of caseLinks) {  // case partners always connected
    const [a, b] = k.split("|").map(Number);
    if (idx.has(a) && idx.has(b) && !edges.some((e) => (e.a === idx.get(a) && e.b === idx.get(b)))) edges.push({ a: idx.get(a), b: idx.get(b), n: 3, hot: true });
  }
  for (const n of nodes) n.deg = 0;
  for (const e of edges) { nodes[e.a].deg++; nodes[e.b].deg++; }
}

function step() {
  const w = cv.clientWidth, h = cv.clientHeight, N = nodes.length;
  const k = Math.sqrt((w * h) / Math.max(1, N)) * 0.55;
  for (let i = 0; i < N; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < N; j++) {
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01;
      if (d2 > 90000) continue;
      // fades to zero at 300 px: a hard cut-off made nodes bounce across that distance forever (jitter)
      const f = (k * k) / d2 * 0.6 * (1 - d2 / 90000);
      dx *= f; dy *= f;
      a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
    }
  }
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) + 0.01;
    const f = ((d - k * 0.8) / d) * 0.02 * Math.min(3, 1 + e.n / 6);
    a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
  }
  const cx = w / 2, cy = h / 2, ego = mode === "EGO" && S.sel.person !== null;
  for (const n of nodes) {
    if (n === dragN) continue;
    if (ego && n.p === S.sel.person) { n.x += (cx - n.x) * 0.1; n.y += (cy - n.y) * 0.1; n.vx = n.vy = 0; continue; }
    n.vx += (cx - n.x) * 0.002; n.vy += (cy - n.y) * 0.002;
    // soft walls: a pull that grows from zero past the edge (a hard clamp there made nodes bounce)
    const mx = 70, my = 40;
    if (n.x < mx) n.vx += (mx - n.x) * 0.05; else if (n.x > w - mx) n.vx += (w - mx - n.x) * 0.05;
    if (n.y < my) n.vy += (my - n.y) * 0.05; else if (n.y > h - my) n.vy += (h - my - n.y) * 0.05;
    n.vx *= 0.82; n.vy *= 0.82;
    n.x += Math.max(-12, Math.min(12, n.vx)); n.y += Math.max(-12, Math.min(12, n.vy));
  }
}

// The show has no relationship graph (自创). It borrows the look of the S2–S3 national map screens
// (research/hits/ref_network: S02E01 01m59s, S02E02 06m11s, S03E06 01m09s): black ground, a faint grid and
// scattered specks, people as points of light, thin white links, names in wide white Futura capitals, and a
// hairline white box of small print beside the focus. Threat links in red, as the red points on S03E06.
let specks = null;
function ground(w, h) {
  if (!specks || specks.w !== w || specks.h !== h) {
    const c = document.createElement("canvas"), dpr = devicePixelRatio || 1;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,.07)"; g.lineWidth = 1; g.beginPath();
    for (let x = 0.5 + (w % 120) / 2; x < w; x += 120) { g.moveTo(x, 0); g.lineTo(x, h); }
    for (let y = 0.5 + (h % 120) / 2; y < h; y += 120) { g.moveTo(0, y); g.lineTo(w, y); }
    g.stroke();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (w * h) / 900; i++) {
      g.fillStyle = `rgba(220,228,240,${0.05 + rnd() * 0.18})`;
      g.fillRect(rnd() * w, rnd() * h, rnd() < 0.9 ? 1 : 2, 1);
    }
    specks = { w, h, c };
  }
  return specks.c;
}

function draw() {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) { cv.width = w * dpr; cv.height = h * dpr; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(ground(w, h), 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!dragN) fit(w, h);
  const sel = S.sel.person !== null ? idx.get(S.sel.person) : undefined;
  const near = new Set();
  const focus = hoverN ?? sel;
  if (focus !== undefined && focus !== null) for (const e of edges) { if (e.a === focus) near.add(e.b); if (e.b === focus) near.add(e.a); }
  for (const e of edges) {
    const a = nodes[e.a], b = nodes[e.b], lit = e.a === focus || e.b === focus;
    ctx.strokeStyle = e.hot ? `rgba(232,33,43,${lit ? 0.95 : 0.6})` : `rgba(235,240,248,${lit ? 0.75 : Math.min(0.3, 0.05 + e.n / 60)})`;
    ctx.lineWidth = lit ? 1.4 : Math.min(1.6, 0.5 + e.n / 16);
    ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
  }
  ctx.textBaseline = "middle";
  nodes.forEach((n, i) => {
    const P = W.people[n.p], rc = roleClass(P.role), r = 1.6 + Math.min(4, Math.sqrt(n.deg) * 0.8);
    const dim = focus !== undefined && focus !== null && i !== focus && !near.has(i);
    ctx.globalAlpha = dim ? 0.3 : 1;
    const col = rc === "g" ? "#dfe6ee" : COLOR[rc];
    ctx.shadowColor = col; ctx.shadowBlur = rc === "g" ? 4 : 10;
    ctx.fillStyle = rc === "by" ? "#000" : col;
    ctx.beginPath(); ctx.arc(sx(n.x), sy(n.y), r, 0, Math.PI * 2); ctx.fill();
    if (rc === "by") { ctx.strokeStyle = COLOR.by; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.shadowBlur = 0;
    if (P.role !== "IRRELEVANT" || i === focus || near.has(i) || nodes.length < 40) {
      const big = i === focus;
      ctx.font = `500 ${big ? 22 : 10}px Futura, 'Futura PT', Jost, sans-serif`; ctx.letterSpacing = big ? "2px" : "1.5px";
      ctx.fillStyle = rc === "g" ? "rgba(225,230,236,.75)" : rc === "w" ? "#f2f2f2" : col;
      ctx.fillText(P.name, sx(n.x) + r + 6, sy(n.y));
    }
    ctx.globalAlpha = 1;
  });
  if (focus !== undefined && focus !== null) infoBox(nodes[focus], near.size);
}

// hairline white box of small capitals next to the focus (S02E02 06m11s, S02E01 01m59s)
function infoBox(n, links) {
  const P = W.people[n.p], w = cv.clientWidth;
  const lines = [P.role, `SUBJECT ID: ${P.id}`, `SSN: ${P.ssn}`, `KNOWN LINKS: ${links}`, `OCCUPATION: ${P.occ}`];
  ctx.font = "500 9px Futura, 'Futura PT', Jost, sans-serif"; ctx.letterSpacing = "1px";
  const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18, bh = lines.length * 13 + 14;
  let x = sx(n.x) + 18, y = sy(n.y) + 18;
  if (x + bw > w - 10) x = sx(n.x) - 18 - bw;
  ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = "rgba(240,240,240,.85)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
  ctx.fillStyle = "#e9edf1";
  lines.forEach((l, i) => ctx.fillText(l, x + 9, y + 13 + i * 13));
}

function nodeAt(x, y) {
  let best = null, bd = 12;
  nodes.forEach((n, i) => { const d = Math.hypot(sx(n.x) - x, sy(n.y) - y); if (d < bd) { bd = d; best = i; } });
  return best;
}

function renderSide(t) {
  const el = $(".nside", root), p = S.sel.person;
  const counts = {};
  for (const n of nodes) { const r = W.people[n.p].role; counts[r] = (counts[r] || 0) + 1; }
  el.innerHTML = `
    <div class="grp modes">${["EGO", "OVERVIEW"].map((m) => `<button data-mode="${m}" class="${m === mode ? "on" : ""}">${m === "EGO" ? "SUBJECT CIRCLE" : "ALL FLAGGED"}</button>`).join("")}</div>
    <h3>GRAPH</h3><div class="kv"><span>NODES</span><b>${nodes.length}</b><span>LINKS</span><b>${edges.length}</b>
      <span>CASE LINKS</span><b class="red">${edges.filter((e) => e.hot).length}</b></div>
    <div class="legend"><span><i class="y"></i>ASSET / ADMIN</span><span><i class="r"></i>THREAT</span><span><i class="w"></i>POI</span><span><i class="g"></i>IRRELEVANT</span><span><i class="ln"></i>CASE LINK</span></div>
    ${p !== null ? `<h3>FOCUS</h3>${personRow(p)}<h3>STRONGEST LINKS</h3><div class="plist">${W.neighbors[p].filter(([, , f]) => f <= t).slice(0, 10).map(([q, n]) => personRow(q, `${n}×`)).join("") || '<div class="empty">NONE YET</div>'}</div>
      <button data-dossier="${p}">OPEN DOSSIER</button>` : `<div class="empty">CLICK A NODE TO FOCUS ON A SUBJECT.</div>`}`;
}

export default {
  id: "network", title: "NETWORK",
  mount(el) {
    root = el;
    root.className = "page page-network";
    root.innerHTML = `<div class="netwrap panel"><canvas></canvas><div class="mframe"></div><div class="mhint">DRAG NODES · CLICK TO FOCUS · DOUBLE-CLICK FOR DOSSIER</div></div><aside class="nside panel"></aside>`;
    cv = $("canvas", root); ctx = cv.getContext("2d");
    if (S.sel.person === null) mode = "OVERVIEW";
    graphKey = ""; nodes = [];
    cv.addEventListener("pointerdown", (e) => { const r = cv.getBoundingClientRect(); const i = nodeAt(e.clientX - r.left, e.clientY - r.top); dragN = i !== null ? nodes[i] : null; if (dragN) dragN.moved = false; });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (dragN) { dragN.x = wx(x); dragN.y = wy(y); dragN.vx = dragN.vy = 0; dragN.moved = true; }
      hoverN = nodeAt(x, y); cv.style.cursor = hoverN !== null ? "pointer" : "default";
    });
    cv.addEventListener("pointerup", () => {
      if (dragN && !dragN.moved) { select("person", dragN.p); if (mode === "OVERVIEW") graphKey = ""; mode = "EGO"; lastSlow = 0; }
      dragN = null;
    });
    cv.addEventListener("dblclick", (e) => { const r = cv.getBoundingClientRect(), i = nodeAt(e.clientX - r.left, e.clientY - r.top); if (i !== null) go("subjects", W.people[nodes[i].p].id); });
    root.addEventListener("click", onClick);
  },
  unmount() { root.removeEventListener("click", onClick); },
  frame(t, now) {
    build(t);
    if (now - lastSlow > 800) { lastSlow = now; renderSide(t); }
    step(); draw();
  },
};

function onClick(e) {
  const b = e.target.closest("[data-mode], [data-person], [data-dossier]");
  if (!b) return;
  if (b.dataset.mode) mode = b.dataset.mode;
  else if (b.dataset.person) { select("person", +b.dataset.person); mode = "EGO"; }
  else if (b.dataset.dossier) go("subjects", W.people[+b.dataset.dossier].id);
  lastSlow = 0;
}
