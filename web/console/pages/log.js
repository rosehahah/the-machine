// LOG: the Machine's running commentary up to the cursor: identifications, case events and system chatter.
// The show has no log screen (自创); lines are set like its MPOV system boxes, "[1] CORE SYSTEMS SHUTTING DOWN /
// INITIATING TERMINATION SEQUENCE." (S05E13 36m04s): bracketed index, white monospace capitals, red for alarms.
import { S, go, select, seek } from "../state.js";
import { $, esc } from "../ui.js";
import { W, fmtClock, fmtDay, upperBound } from "../world.js";

const SPAN = 4 * 3600, MAX = 450;
const FILTERS = ["ALL", "IDENT", "THREAT", "CASE", "SYSTEM"];
const SYSTEM = [
  (r) => `PARSING ${(12000 + r % 9000).toLocaleString("en-US")} CALL RECORDS`,
  (r) => `CROSS-REFERENCING 311 DATABASE · ${r % 400} MATCHES`,
  (r) => `FEED ${W.cameras[r % W.cameras.length].id} LATENCY ${40 + r % 160} MS`,
  () => "RECALIBRATING FACIAL RECOGNITION WEIGHTS",
  (r) => `VOICEPRINT MATCH ${(0.8 + (r % 19) / 100).toFixed(2)} · INTERCEPT ${r % 9000}`,
  (r) => `FINANCIAL TRANSACTIONS INGESTED · ${(r % 70) + 10}K`,
  (r) => `GAIT ANALYSIS · ${r % 50} PROFILES UPDATED`,
  () => "BACKUP TO DISTRIBUTED NODES COMPLETE",
  (r) => `ANOMALY SCAN · ${r % 7} DEVIATIONS BELOW THRESHOLD`,
  (r) => `CELL TOWER HANDOFFS PROCESSED · ${(r % 900) + 100}K`,
  () => "SIMULATION ENGINE IDLE",
  (r) => `LICENSE PLATE READS · ${(r % 300) + 50} NEW`,
];
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; };

let root, filter = "ALL", follow = true, lastSlow = 0, lastKey = "";

function entries(t) {
  const out = [], s = W.sightings, t0 = t - SPAN;
  for (let i = upperBound(s.t, t0); i < W.n && s.t[i] <= t; i++) {
    const P = W.people[s.p[i]];
    if (P.role === "IRRELEVANT" && hash(i) % 23) continue;  // a sample of the crowd
    out.push({ t: s.t[i], k: P.role === "THREAT" ? "THREAT" : "IDENT", p: s.p[i], cam: s.c[i],
      text: P.role === "IRRELEVANT" ? `SUBJECT ${P.id} ACQUIRED` : `${P.role === "PERSON OF INTEREST" ? "POI" : P.role} ACQUIRED · ${P.name}` });
  }
  W.cases.forEach((c, ci) => {
    for (const e of c.events) {
      if (e.t <= t0 || e.t > t) continue;
      const hot = ["ARMED", "HOSTILE", "DOWN"].includes(e.kind);
      out.push({ t: e.t, k: hot ? "THREAT" : "CASE", ci, cam: e.cam,
        text: e.kind === "NUMBER" ? `NUMBER ISSUED · ${c.number} · ${c.list}` : `${c.number} · ${e.text}`, hot });
    }
  });
  for (let b = Math.ceil(t0 / 47); b * 47 <= t; b++) {
    const r = hash(b);
    if (r % 3) continue;
    out.push({ t: b * 47, k: "SYSTEM", text: SYSTEM[r % SYSTEM.length](r >>> 8) });
  }
  return out.sort((a, b) => a.t - b.t);
}

function render(t) {
  const key = `${Math.floor(t)}|${filter}`;
  if (key === lastKey) return;
  lastKey = key;
  const list = entries(t).filter((e) => filter === "ALL" || e.k === filter).slice(-MAX);
  const box = $(".term", root);
  box.innerHTML = list.map((e, i) => `<div class="ln ${e.k.toLowerCase()} ${e.hot ? "hot" : ""}"${e.p !== undefined ? ` data-person="${e.p}"` : ""}${e.ci !== undefined ? ` data-case="${e.ci}"` : ""} data-t="${e.t}">` +
    `<span class="ix">[${list.length - i}]</span><span class="tm">${fmtClock(e.t)}</span><span class="k">${e.k}</span><span class="tx">${esc(e.text)}</span>` +
    `${e.cam !== undefined ? `<span class="cm">${esc(W.cameras[e.cam].id)}</span>` : ""}</div>`).join("") +
    `<div class="ln cursor"><span class="ix">[0]</span><span class="tm">${fmtClock(t)}</span><span class="k"></span><span class="tx">▌</span></div>`;
  if (follow) box.scrollTop = box.scrollHeight;
  $(".lhdr .sub", root).textContent = `${fmtDay(t)} · LAST 4 HOURS · ${list.length} ENTRIES`;
}

export default {
  id: "log", title: "LOG",
  mount(el) {
    root = el;
    root.className = "page page-log";
    root.innerHTML = `<section class="panel logp">
      <div class="lhdr"><span class="ttl">SYSTEM LOG</span><span class="sub"></span>
        <span class="grp">${FILTERS.map((f) => `<button data-filter="${f}" class="${f === filter ? "on" : ""}">${f}</button>`).join("")}</span>
        <label class="row"><input type="checkbox" ${follow ? "checked" : ""} data-follow> FOLLOW</label></div>
      <div class="term"></div></section>`;
    lastKey = "";
    root.addEventListener("click", onClick);
    $(".term", root).addEventListener("wheel", () => { follow = false; $("[data-follow]", root).checked = false; });
    $("[data-follow]", root).addEventListener("change", (e) => (follow = e.target.checked));
  },
  unmount() { root.removeEventListener("click", onClick); },
  frame(t, now) { if (now - lastSlow > 300) { lastSlow = now; render(t); } },
};

function onClick(e) {
  const f = e.target.closest("[data-filter]");
  if (f) { filter = f.dataset.filter; root.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("on", b === f)); lastKey = ""; return; }
  const ln = e.target.closest(".ln");
  if (!ln) return;
  if (ln.dataset.person) { select("person", +ln.dataset.person); go("subjects", W.people[+ln.dataset.person].id); }
  else if (ln.dataset.case) { select("case", +ln.dataset.case); go("cases", W.cases[+ln.dataset.case].id); }
  else if (ln.dataset.t) seek(+ln.dataset.t, false);
}
