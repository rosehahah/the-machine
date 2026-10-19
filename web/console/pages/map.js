// MAP: the Machine's city map, after the S3–S4 MPOV map screens (research/hits/ref_map: S04E13 37m42s,
// S04E21 36m04s, S04E19 26m57s, S05E13 05m51s). Dark land with its street mesh, white water, a 1 km grid with
// small squares at its crossings, borough labels with a stats box, red crosshair lines through the target, red
// rings round an active operation. Our data on top: the camera network, open numbers, a person's trail.
// Wheel to zoom, drag to pan, click a camera. Anything the show does not have is marked 自创.
import { clamp } from "../../hud.js";
import { S, go, select } from "../state.js";
import { $, esc } from "../ui.js";
import { DAY, W, caseOpen, fmtAgo, fmtHM, presentAt, sightingsOf } from "../world.js";

let root, cv, ctx, base = null, baseKey = "", lastSlow = 0, drag = null, hoverCam = null, fontsReady = false;
const V = { cx: 480, cy: 0, scale: 0 };  // starts fully zoomed out (clampView raises it)  // metres at screen centre, px per metre
let present = [];

const MONO = "ShareTech, 'Share Tech Mono', Menlo, monospace";
const C = { water: "#e2e2e0", land: "#2a2b2c", park: "#323434", minor: "rgba(255,255,255,.075)", major: "rgba(255,255,255,.17)",
  shore: "rgba(255,255,255,.55)", grid: "rgba(150,150,150,.33)", red: "#e8212b", white: "#f2f2f2", yellow: "#f2e02a" };

// boroughs as the show labels them (S04E13 37m42s: MANHATTAN / QUEENS / BROOKLYN, each with COUNTY, AREA,
// POPULATION, DENSITY). 2020 census population, land area.
const BOROUGHS = [
  ["MANHATTAN", 40.7795, -73.9665, "NEW YORK", 59, 1694251],
  ["QUEENS", 40.7505, -73.9195, "QUEENS", 281, 2405464],
  ["BROOKLYN", 40.7065, -73.9545, "KINGS", 179, 2736074],
  ["THE BRONX", 40.8445, -73.9185, "BRONX", 109, 1472654],
  ["HUDSON", 40.7745, -74.0125, "HUDSON, NJ", 120, 724854],
];

const sx = (x) => cv.clientWidth / 2 + (x - V.cx) * V.scale;
const sy = (y) => cv.clientHeight / 2 - (y - V.cy) * V.scale;
const mx = (px) => V.cx + (px - cv.clientWidth / 2) / V.scale;
const my = (py) => V.cy - (py - cv.clientHeight / 2) / V.scale;

function project(lat, lon) {
  const [la, lo] = W.map.origin;
  return [(lon - lo) * 111320 * Math.cos((la * Math.PI) / 180), (lat - la) * 110540];
}

// The map data covers a tall box round Manhattan. Vertically the view stays inside it; sideways it may show up
// to 30% more, which is New Jersey to the west and Queens to the east, so plain land there is right.
const SIDE = 1.6;
function clampView() {
  const [x0, y0, x1, y1] = W.map.bbox, w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  V.scale = clamp(V.scale, Math.max(w / ((x1 - x0) * SIDE), h / (y1 - y0)), 0.8);
  const hw = w / 2 / V.scale, hh = h / 2 / V.scale, mid = (x0 + x1) / 2;
  V.cx = hw * 2 > x1 - x0 ? clamp(V.cx, x1 - hw, x0 + hw) : clamp(V.cx, x0 + hw, x1 - hw);
  if (hw * 2 > (x1 - x0) * SIDE) V.cx = mid;
  V.cy = clamp(V.cy, y0 + hh, y1 - hh);
}

function size() {
  const dpr = devicePixelRatio || 1;
  cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
  clampView();
  baseKey = "";
}

function drawBase() {
  const key = `${V.cx}|${V.cy}|${V.scale}|${cv.width}|${cv.height}|${fontsReady}`;
  if (key === baseKey) return base;
  baseKey = key;
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  base ||= document.createElement("canvas");
  base.width = cv.width; base.height = cv.height;
  const c = base.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const M = W.map;
  const path = (arr, close) => {
    c.moveTo(sx(arr[0]), sy(arr[1]));
    for (let i = 2; i < arr.length; i += 2) c.lineTo(sx(arr[i]), sy(arr[i + 1]));
    if (close) c.closePath();
  };
  c.lineJoin = c.lineCap = "round";
  // water is the paper, land is laid on top (the show's maps are white water, near-black land)
  c.fillStyle = C.water; c.fillRect(0, 0, w, h);
  const [bx0, , bx1] = M.bbox, ex0 = sx(bx0), ex1 = sx(bx1);
  c.fillStyle = C.land;  // beyond the data, sideways: land without streets (自创)
  if (ex0 > 0) c.fillRect(0, 0, ex0, h);
  if (ex1 < w) c.fillRect(ex1, 0, w - ex1, h);
  c.beginPath(); for (const poly of M.land) for (const ring of poly) path(ring, true);
  c.fillStyle = C.land; c.fill("evenodd");
  c.save(); c.clip("evenodd");  // everything else stays on land
  c.fillStyle = C.park;
  c.beginPath(); for (const p of M.parks) path(p, true); c.fill();
  c.strokeStyle = C.minor; c.lineWidth = clamp(7 * V.scale, 0.6, 2.5);
  c.beginPath(); for (const s of M.streets.minor) path(s); c.stroke();
  c.strokeStyle = C.major; c.lineWidth = clamp(12 * V.scale, 0.9, 4);
  c.beginPath(); for (const s of M.streets.major) path(s); c.stroke();
  c.restore();
  c.strokeStyle = C.shore; c.lineWidth = 1;
  c.beginPath(); for (const poly of M.land) for (const ring of poly) path(ring, true); c.stroke();
  // 1 km grid; small squares where its lines cross (S04E13 37m42s, top row)
  const step = 1000, gx0 = Math.ceil(mx(0) / step) * step, gy0 = Math.ceil(my(h) / step) * step;
  c.strokeStyle = C.grid; c.lineWidth = 1;
  c.beginPath();
  for (let x = gx0; x < mx(w); x += step) { c.moveTo(Math.round(sx(x)) + 0.5, 0); c.lineTo(Math.round(sx(x)) + 0.5, h); }
  for (let y = gy0; y < my(0); y += step) { c.moveTo(0, Math.round(sy(y)) + 0.5); c.lineTo(w, Math.round(sy(y)) + 0.5); }
  c.stroke();
  for (const [e, dir] of [[ex0, -1], [ex1, 1]]) {  // fade the streetless strip so the data edge reads as an edge
    if (e < 0 || e > w) continue;
    const g = c.createLinearGradient(e, 0, e + dir * 160, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
    c.fillStyle = g; dir < 0 ? c.fillRect(0, 0, e, h) : c.fillRect(e, 0, w - e, h);
  }
  for (let x = gx0; x < mx(w); x += step * 2) {
    for (let y = gy0; y < my(0); y += step * 2) {
      const px = Math.round(sx(x)), py = Math.round(sy(y));
      c.fillStyle = "#111"; c.fillRect(px - 4, py - 4, 9, 9);
      c.fillStyle = "#cfcfcf"; c.fillRect(px - 3, py - 3, 7, 7);
    }
  }
  // street names when zoomed in (自创: the show's maps carry no street names)
  if (V.scale > 0.4) {
    c.font = `10px ${MONO}`; c.fillStyle = "rgba(255,255,255,.4)"; c.letterSpacing = "1px";
    for (const [n, x, y, a] of M.names) {
      const px = sx(x), py = sy(y);
      if (px < -50 || py < -50 || px > w + 50 || py > h + 50) continue;
      c.save(); c.translate(px, py); c.rotate((-a * Math.PI) / 180); c.fillText(n, -c.measureText(n).width / 2, -3); c.restore();
    }
  }
  drawBoroughs(c, w, h);
  return base;
}

// black name block in white mono capitals, a smoked stats box under it (S04E13 37m42s, S04E21 36m04s)
function drawBoroughs(c, w, h) {
  if (V.scale > 0.5) return;
  const big = V.scale < 0.3;
  for (const [name, lat, lon, county, area, pop] of BOROUGHS) {
    const [x, y] = project(lat, lon), px = Math.round(sx(x)), py = Math.round(sy(y));
    if (px < -200 || py < -60 || px > w + 40 || py > h + 80) continue;
    c.font = `${big ? 20 : 16}px ${MONO}`; c.letterSpacing = "2px"; c.textBaseline = "middle";
    const tw = c.measureText(name).width, bh = big ? 28 : 23;
    c.fillStyle = "rgba(0,0,0,.92)"; c.fillRect(px, py, tw + 14, bh);
    c.fillStyle = C.white; c.fillText(name, px + 7, py + bh / 2 + 1);
    const rows = [`COUNTY: ${county}`, `AREA: ${area} km²`, `POPULATION: ${pop.toLocaleString("en-US")}`,
      `DENSITY: ${Math.round(pop / area).toLocaleString("en-US")}/km²`];
    c.font = `9px ${MONO}`; c.letterSpacing = "0.5px";
    const bw = Math.max(...rows.map((r) => c.measureText(r).width)) + 12;
    c.fillStyle = "rgba(40,40,40,.78)"; c.fillRect(px, py + bh + 3, bw, rows.length * 11 + 8);
    c.fillStyle = "rgba(225,225,225,.85)";
    rows.forEach((r, i) => c.fillText(r, px + 6, py + bh + 3 + 9 + i * 11));
  }
}

function trail(p, t) {
  const s = W.sightings, ix = sightingsOf(p, t, t - DAY);
  return ix.map((i) => ({ x: W.cameras[s.c[i]].x, y: W.cameras[s.c[i]].y, t: s.t[i], cam: s.c[i] }));
}

// the case a camera is the latest place of, for every open number
function hotCams(t) {
  const hot = new Map();
  for (const c of W.cases) {
    if (!caseOpen(c, t)) continue;
    const last = c.events.filter((e) => e.t <= t).pop();
    if (last) hot.set(last.cam, c);
  }
  return hot;
}

function target(t) {
  if (S.sel.person !== null) {
    const L = trail(S.sel.person, t).pop();
    return L ? { x: L.x, y: L.y } : null;
  }
  if (S.sel.cam !== null) return W.cameras[S.sel.cam];
  return null;
}

function draw(t, now) {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(drawBase(), 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = "middle";
  const hot = hotCams(t), pulse = (now / 1400) % 1, tags = [];
  // active operation: red disc fading out, concentric rings, one ring breathing outwards (S04E13 37m42s)
  for (const [i, c] of hot) {
    const K = W.cameras[i], x = sx(K.x), y = sy(K.y), red = c.list === "RELEVANT";
    const col = red ? "232,33,43" : "242,242,242";
    const g = ctx.createRadialGradient(x, y, 0, x, y, 70);
    g.addColorStop(0, `rgba(${col},.32)`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.2;
    for (const [r, a] of [[16, 0.85], [30, 0.6], [52, 0.42], [88, 0.3]]) {
      ctx.strokeStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = `rgba(${col},${0.7 * (1 - pulse)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 16 + pulse * 90, 0, Math.PI * 2); ctx.stroke();
    // the show's black tag with red letters and a red edge ("ACTIVE OPERATION"); ours names the number
    tags.push([`${red ? "ACTIVE OPERATION" : "NUMBER"} · ${c.number}`, x, y + 22, red ? C.red : C.white]);
  }
  // selected case: its places joined in order (自创)
  if (S.sel.case !== null) {
    const c = W.cases[S.sel.case], ev = c.events.filter((e) => e.t <= t);
    ctx.strokeStyle = c.list === "RELEVANT" ? "rgba(232,33,43,.85)" : "rgba(242,242,242,.8)"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4;
    ctx.beginPath(); ev.forEach((e, i) => { const K = W.cameras[e.cam]; i ? ctx.lineTo(sx(K.x), sy(K.y)) : ctx.moveTo(sx(K.x), sy(K.y)); }); ctx.stroke();
    ctx.setLineDash([]);
  }
  // cameras: small open squares like the show's map markers; a filled one when picked
  W.cameras.forEach((K, i) => {
    const x = Math.round(sx(K.x)), y = Math.round(sy(K.y)), sel = S.sel.cam === i || hoverCam === i;
    ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(x - 5, y - 5, 11, 11);
    ctx.strokeStyle = hot.has(i) && hot.get(i).list === "RELEVANT" ? C.red : C.white; ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 3.5, y - 3.5, 8, 8);
    if (sel) { ctx.fillStyle = C.white; ctx.fillRect(x - 2, y - 2, 5, 5); }
    if (V.scale > 0.32 && S.sel.cam !== i || hoverCam === i && S.sel.cam !== i) {  // the picked one has its card
      ctx.font = `10px ${MONO}`; ctx.letterSpacing = "1px";
      tag(ctx, V.scale > 0.6 || sel ? `${K.id} · ${K.name}` : K.id, x + 9, y - 7, "#d8d8d8", "rgba(0,0,0,.8)");
    }
  });
  for (const [text, x, y, col] of tags) tag(ctx, text, x, y, col, "#000", col, true);  // over the camera squares
  // selected person: last 24 h trail (自创: the show draws routes, not sighting trails)
  if (S.sel.person !== null) {
    const tr = trail(S.sel.person, t);
    ctx.lineWidth = 2;
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i], age = 1 - (t - b.t) / DAY;
      ctx.strokeStyle = `rgba(242,224,42,${0.15 + age * 0.75})`;
      ctx.beginPath(); ctx.moveTo(sx(a.x), sy(a.y)); ctx.lineTo(sx(b.x), sy(b.y)); ctx.stroke();
    }
    for (const p of tr) { ctx.fillStyle = C.yellow; ctx.fillRect(sx(p.x) - 2, sy(p.y) - 2, 4, 4); }
  }
  // target: thin red lines across the whole screen through it, a white square on it (S04E21 36m04s)
  const T = target(t);
  if (T) {
    const x = Math.round(sx(T.x)) + 0.5, y = Math.round(sy(T.y)) + 0.5;
    ctx.strokeStyle = "rgba(232,33,43,.75)"; ctx.lineWidth = 1;
    ctx.shadowColor = "rgba(232,33,43,.8)"; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#111"; ctx.fillRect(x - 8.5, y - 8.5, 17, 17);
    ctx.fillStyle = "#e6e6e6"; ctx.fillRect(x - 6.5, y - 6.5, 13, 13);
  }
  // scale bar (自创) + OpenStreetMap credit (licence)
  const len = [1000, 500, 200, 100].find((v) => v * V.scale <= 220) || 100, m = len * V.scale;
  ctx.font = `10px ${MONO}`; ctx.letterSpacing = "1px";
  ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(46, h - 32, m + 60, 18);
  ctx.fillStyle = "#ddd"; ctx.fillRect(52, h - 24, m, 2); ctx.fillText(len === 1000 ? "1 KM" : `${len} M`, 58 + m, h - 23);
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillText(W.map.attribution, w - 210, h - 14);
  placeCard();
}

// a label block: text on a solid box, optional 1px edge, optionally centred on x
function tag(c, text, x, y, fg, bg, edge, centre) {
  c.font = `11px ${MONO}`; c.letterSpacing = "1.5px";
  const tw = c.measureText(text).width;
  if (centre) x = Math.round(x - (tw + 12) / 2);
  c.fillStyle = bg; c.fillRect(x, y, tw + 12, 17);
  if (edge) { c.strokeStyle = edge; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, tw + 11, 16); }
  c.fillStyle = fg; c.fillText(text, x + 6, y + 9);
}

// top-left status block, after "/// ANALYZING LOCATION DATA..." (S05E13 05m51s, S04E01 04m10s)
function renderStatus(t) {
  const openCases = W.cases.filter((c) => caseOpen(c, t));
  const inView = present.reduce((a, b) => a + b, 0);
  const tracking = S.sel.person !== null ? W.people[S.sel.person] : null;
  $(".mstat", root).innerHTML = `
    <div class="ms-h">/// ANALYZING LOCATION DATA<i class="dots"></i></div>
    <div class="ms-r"><span>CAMERAS ONLINE:</span><b>${W.cameras.length}</b></div>
    <div class="ms-r"><span>SUBJECTS IN VIEW:</span><b>${inView}</b></div>
    <div class="ms-r"><span>OPEN NUMBERS:</span><b class="${openCases.length ? "r" : ""}">${openCases.length}</b></div>
    ${openCases.map((c) => `<div class="ms-n" data-case="${c.id}"><b class="${c.list === "RELEVANT" ? "r" : ""}">${c.number}</b><span>${esc(W.cameras[c.cam].id)}</span></div>`).join("")}
    ${tracking ? `<div class="ms-search"><span>SEARCHING FOR TARGET</span><i class="dots r"></i></div>
      <div class="ms-r"><span>NAME:</span><b class="r">${esc(tracking.name)}</b></div>
      <div class="ms-trail">${trail(S.sel.person, t).slice(-6).reverse().map((p) => `<div data-cam="${p.cam}"><span>${fmtHM(p.t)}</span>${esc(W.cameras[p.cam].name)}</div>`).join("") || '<div class="empty">NOT SEEN IN 24 H</div>'}</div>
      <button data-clear="person">CLEAR</button>` : ""}`;
}

// camera card pinned next to its square, after the "FBI FIELD OFFICE" box (S04E13 37m42s): white title strip,
// one red line, then rows of label / value
function renderCard(t) {
  const el = $(".mcard", root), k = S.sel.cam;
  if (k === null) { el.classList.add("hidden"); return; }
  const K = W.cameras[k], pres = presentAt(k, t), people = pres.map((x) => W.people[x.p]);
  const threats = people.filter((P) => P.role === "THREAT").length;
  const assets = people.filter((P) => /ASSET|ADMIN|INTERFACE/.test(P.role)).length;
  const known = pres.filter((x) => W.people[x.p].role !== "IRRELEVANT");
  el.classList.remove("hidden");
  el.innerHTML = `<div class="mc-h">${esc(K.id)}</div><div class="mc-s">${esc(K.name)}</div>
    <div class="mc-r"><span>SOURCE:</span><b>${esc(K.agency)}</b></div>
    <div class="mc-r"><span>OCCUPANTS:</span><b>${pres.length}</b></div>
    <div class="mc-r"><span>DEVIANTS:</span><b class="${threats ? "r" : ""}">${threats}</b></div>
    <div class="mc-r"><span>ASSETS:</span><b>${assets}</b></div>
    ${known.map((x) => `<div class="mc-p" data-person="${x.p}"><span>${esc(W.people[x.p].name)}</span><em>${fmtAgo(t - x.since)}</em></div>`).join("")}
    <button data-open="${k}">OPEN FEED</button>`;
}

function placeCard() {
  const el = $(".mcard", root), k = S.sel.cam;
  if (k === null || el.classList.contains("hidden")) return;
  const K = W.cameras[k], x = sx(K.x), y = sy(K.y), w = cv.clientWidth, h = cv.clientHeight;
  const cw = el.offsetWidth, ch = el.offsetHeight;
  const left = x + 24 + cw > w - 30 ? x - 24 - cw : x + 24;
  el.style.left = `${clamp(left, 30, w - cw - 30)}px`;
  el.style.top = `${clamp(y - 30, 10, h - ch - 10)}px`;
}

function camAt(px, py) {
  let best = null, bd = 12;
  W.cameras.forEach((K, i) => { const d = Math.hypot(sx(K.x) - px, sy(K.y) - py); if (d < bd) { bd = d; best = i; } });
  return best;
}

export default {
  id: "map", title: "MAP",
  mount(el) {
    root = el;
    root.className = "page page-map";
    root.innerHTML = `<div class="mapwrap"><canvas></canvas><div class="mstat"></div><div class="mcard hidden"></div>
      <div class="mframe"></div><div class="mhint">WHEEL ZOOM · DRAG PAN · CLICK A CAMERA</div></div>`;
    cv = $("canvas", root); ctx = cv.getContext("2d");
    if (!fontsReady) document.fonts.load(`16px ShareTech`).then(() => { fontsReady = true; }).catch(() => {});
    // centre on whatever is selected, else on the camera network
    const focus = target(S.t);
    if (focus) { V.cx = focus.x; V.cy = focus.y; V.scale = Math.max(V.scale, 0.3); }
    size(); addEventListener("resize", size);
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const ax = mx(px), ay = my(py);
      V.scale = V.scale * Math.exp(-e.deltaY * 0.0015);
      clampView();
      V.cx = ax - (px - cv.clientWidth / 2) / V.scale; V.cy = ay + (py - cv.clientHeight / 2) / V.scale;
      clampView();
    }, { passive: false });
    cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: V.cx, cy: V.cy, moved: false }; });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect();
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        V.cx = drag.cx - dx / V.scale; V.cy = drag.cy + dy / V.scale;
        clampView();
      }
      hoverCam = camAt(e.clientX - r.left, e.clientY - r.top);
      cv.style.cursor = hoverCam !== null ? "pointer" : drag ? "grabbing" : "grab";
    });
    cv.addEventListener("pointerup", (e) => {
      if (drag && !drag.moved) {
        const r = cv.getBoundingClientRect(), c = camAt(e.clientX - r.left, e.clientY - r.top);
        select("cam", c); lastSlow = 0;
      }
      drag = null;
    });
    root.addEventListener("click", onClick);
  },
  unmount() { removeEventListener("resize", size); root.removeEventListener("click", onClick); },
  frame(t, now) {
    if (now - lastSlow > 700) {
      lastSlow = now;
      present = W.cameras.map((_, i) => presentAt(i, t).length);
      renderStatus(t);
      renderCard(t);
    }
    draw(t, now);
  },
};

function onClick(e) {
  const b = e.target.closest("[data-person], [data-case], [data-cam], [data-open], [data-clear]");
  if (!b) return;
  if (b.dataset.person) { select("person", +b.dataset.person); }
  else if (b.dataset.case) go("cases", b.dataset.case);
  else if (b.dataset.open) go("feeds", b.dataset.open);
  else if (b.dataset.cam) { select("cam", +b.dataset.cam); const K = W.cameras[+b.dataset.cam]; V.cx = K.x; V.cy = K.y; clampView(); }
  else if (b.dataset.clear) select("person", null);
  lastSlow = 0;
}
