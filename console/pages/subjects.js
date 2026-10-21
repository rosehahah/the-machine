// SUBJECTS: everyone the Machine has catalogued, by classification, with a dossier for the selected person.
// The two list columns are ours (自创: the show never shows its catalogue as a list); the dossier follows the
// show's MPOV profile panel. The side boxes (description, movement, numbers) reuse that panel's look (自创).
import { S, go, on, select, seek } from "../state.js";
import { $, cropStyle, esc, pct, reveal, roleTag, spark } from "../ui.js";
import {
  DAY, ROLE_ORDER, W, age, caseStatus, fmtAgo, fmtDay, fmtHM, fmtStamp, lastSeen, predictLocation, sightingsOf, threatProb,
} from "../world.js";

let root, filter = "ALL", query = "", sort = "LAST SEEN", listKey = "", dossKey = "", lastSlow = 0;
const FILTERS = ["ALL", ...ROLE_ORDER.filter((r) => r !== "IRRELEVANT"), "NUMBERS", "IRRELEVANT"];
const SORTS = ["LAST SEEN", "THREAT", "NAME"];

function matches(p, t) {
  const P = W.people[p];
  if (filter === "NUMBERS") { if (!W.casesOf[p].some((ci) => W.cases[ci].issued <= t && W.cases[ci].subject === p)) return false; }
  else if (filter !== "ALL" && P.role !== filter) return false;
  if (query) {
    const q = query.toUpperCase();
    if (!P.name.includes(q) && !P.ssn.includes(q) && !P.id.includes(q) && !P.occ.includes(q)) return false;
  }
  return true;
}

function renderList(t) {
  const key = `${filter}|${query}|${sort}|${Math.floor(t / 60)}|${S.sel.person}`;
  if (key === listKey) return;
  listKey = key;
  const ids = [];
  for (let p = 0; p < W.people.length; p++) if (matches(p, t)) ids.push(p);
  const seen = new Map(ids.map((p) => [p, lastSeen(p, t)]));
  if (sort === "LAST SEEN") ids.sort((a, b) => (seen.get(b) >= 0 ? W.sightings.t[seen.get(b)] : -1) - (seen.get(a) >= 0 ? W.sightings.t[seen.get(a)] : -1));
  else if (sort === "THREAT") ids.sort((a, b) => threatProb(b, t) - threatProb(a, t));
  else ids.sort((a, b) => W.people[a].name.localeCompare(W.people[b].name));
  const counts = {};
  for (const f of FILTERS) counts[f] = 0;
  for (let p = 0; p < W.people.length; p++) {
    counts.ALL++; counts[W.people[p].role]++;
    if (W.casesOf[p].some((ci) => W.cases[ci].issued <= t && W.cases[ci].subject === p)) counts.NUMBERS++;
  }
  $(".cats", root).innerHTML = FILTERS.map((f) => `<button data-filter="${f}" class="${f === filter ? "on" : ""}">
    <span>${f === "PERSON OF INTEREST" ? "PERSONS OF INTEREST" : f}</span><b>${counts[f]}</b></button>`).join("");
  $(".sorts", root).innerHTML = SORTS.map((s) => `<button data-sort="${s}" class="${s === sort ? "on" : ""}">${s}</button>`).join("");
  $(".count", root).textContent = `${ids.length} SUBJECTS`;
  $(".list", root).innerHTML = ids.slice(0, 300).map((p) => {
    const i = seen.get(p), tp = threatProb(p, t);
    const where = i >= 0 ? `${fmtAgo(t - W.sightings.t[i])} · ${esc(W.cameras[W.sightings.c[i]].name)}` : "NO SIGHTINGS";
    return `<div class="srow ${S.sel.person === p ? "on" : ""}" data-person="${p}">
      <i class="ph" style="${cropStyle(p)}"></i>
      <div class="mid"><div class="nm">${esc(W.people[p].name)}</div><div class="where">${where}</div></div>
      <div class="rt">${roleTag(W.people[p].role)}<div class="tp ${tp > 0.5 ? "r" : ""}">${pct(tp, 0)}</div></div></div>`;
  }).join("") + (ids.length > 300 ? `<div class="empty">+${ids.length - 300} MORE · REFINE SEARCH</div>` : "");
}

function renderDossier(t) {
  const p = S.sel.person, el = $(".dossier", root);
  if (p === null) {
    el.innerHTML = `<div class="placeholder">SELECT A SUBJECT<br><span>${W.people.length} PROFILES INDEXED</span></div>`;
    dossKey = "";
    return;
  }
  const key = `${p}|${Math.floor(t / 30)}`;
  if (key === dossKey) return;
  const fresh = !dossKey.startsWith(`${p}|`);
  dossKey = key;
  const P = W.people[p], s = W.sightings;
  const ix = sightingsOf(p, t), last = ix.length ? ix[ix.length - 1] : -1;
  const tp = threatProb(p, t);
  const pred = predictLocation(p, t);
  const ident = 0.9 + ((p * 7919) % 97) / 1000;  // stable per person
  const cams = new Map();
  for (const i of ix) cams.set(s.c[i], (cams.get(s.c[i]) || 0) + 1);
  const topCams = [...cams.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  // threat probability over the last 7 days, 6-hour steps
  const tl = Array.from({ length: 28 }, (_, i) => threatProb(p, t - (27 - i) * 6 * 3600));
  const cases = W.casesOf[p].map((ci) => W.cases[ci]).filter((c) => c.issued <= t);
  const assoc = W.neighbors[p].filter(([, , f]) => f <= t).slice(0, 8);
  const A = P.attrs;
  // The Machine's own dossier panel (S05E02 08m17s "PRIMARY ASSET IDENTIFIED", S04E21 Shaw): black glass, grey
  // rim, coloured title, white alias bar, "FIELD:  VALUE" rows in white capitals, a rule, a red line at the foot.
  // It floats over the camera that last saw the subject, with the camera name and clock in the corners.
  const head = { THREAT: "r", "PERSON OF INTEREST": "w", IRRELEVANT: "w" }[P.role] || "y";
  const alias = /ASSET|ADMIN|INTERFACE/.test(P.role) ? "ALIAS" : "SUBJECT";
  const cam = last >= 0 ? W.cameras[s.c[last]] : null;
  const row = (k, v, cls = "") => `<span class="rv">${k}:</span><b class="rv ${cls}">${v}</b>`;
  const foot = [...P.flags, ...cases.filter((c) => c.subject === p && c.list === "RELEVANT").map((c) => `NUMBER ${c.number}`)];
  el.innerHTML = `
    <div class="d-cam" style="${cam ? `background-image:url(media/clips/${cam.clip}.jpg)` : ""}"></div>
    ${cam ? `<div class="d-camid">${esc(cam.id)}<br>${esc(cam.name.split(" / ")[0])}</div><div class="d-clock">${fmtHM(s.t[last])}:${String(Math.floor(s.t[last] % 60)).padStart(2, "0")}</div>` : ""}
    <div class="d-cols">
    <div class="mp">
      <div class="d-head ${head}">${esc(P.role)}${P.role === "IRRELEVANT" ? "" : " IDENTIFIED"}</div>
      <div class="d-sub">${alias}: ${esc(P.name)}</div>
      <div class="d-body">
        <div class="d-top">
          <div class="kv">
            ${row("SSN", esc(P.ssn))}${row("DOB", `${esc(P.dob)} (${age(P.dob, t)})`)}${row("ADDRESS", esc(P.addr))}${row("OCCUPATION", esc(P.occ))}
            <i></i><i></i>
            ${row("LAST SEEN", last >= 0 ? `${fmtDay(s.t[last])} ${fmtHM(s.t[last])} · ${esc(cam.name)}` : "UNKNOWN", last >= 0 ? "" : "red")}
            ${row("PROJECTED", pred.length ? `${esc(W.cameras[pred[0].cam].name)} · ${pct(pred[0].p, 0)}` : "UNKNOWN")}
            ${row("SUBJECT ID", P.id)}
          </div>
          <i class="photo" style="${cropStyle(p)}"></i>
        </div>
        <div class="kv">
          <span class="rv wide">PROBABILITIES:</span>
          ${row("THREAT", pct(tp), tp > 0.5 ? "red" : "")}${row("IDENTITY MATCH", pct(ident))}
          ${pred.slice(1).map((x) => row("ALT. LOCATION", `${esc(W.cameras[x.cam].name)} · ${pct(x.p, 0)}`)).join("")}
          <i></i><i></i>
          <span class="rv wide">KNOWN ASSOCIATES:</span>
          ${assoc.map(([q, n]) => `<span class="rv lnk" data-person="${q}">${esc(W.people[q].name)}</span><b class="rv">${n}× CO-LOCATED · ${esc(W.people[q].role)}</b>`).join("") || row("ASSOCIATES", "NONE ESTABLISHED")}
        </div>
        ${foot.length ? `<hr><div class="d-foot">${foot.map(esc).join(" · ")}</div>` : ""}
      </div>
    </div>
    <div class="d-side">
      <div class="mp">
        <div class="d-head w sm">PHYSICAL DESCRIPTION</div>
        <div class="d-body"><div class="kv small">
          ${row("HEIGHT", `${A.height} CM`)}${row("BUILD", A.build)}${row("UPPER", A.top)}${row("LOWER", A.bottom)}
          ${row("EYEWEAR", A.glasses ? "YES" : "NO")}${row("HEADWEAR", A.hat ? "YES" : "NO")}
          ${row("CARRYING", [A.bag && "BAG", A.phone && "PHONE"].filter(Boolean).join(", ") || "NOTHING")}
        </div>
        <div class="lbl rv">THREAT · 7 DAYS</div>${spark(tl, 300, 34, tp > 0.5 ? "r" : "")}</div>
      </div>
      <div class="mp">
        <div class="d-head w sm">MOVEMENT · ${ix.length} SIGHTINGS</div>
        <div class="d-body"><div class="strip" data-strip></div>
        <div class="cams">${topCams.map(([c, n]) => `<button class="chip" data-cam="${c}">${esc(W.cameras[c].name)} <b>${n}</b></button>`).join("")}</div>
        <div class="slog">${ix.slice(-6).reverse().map((i) => `<div class="rv" data-seek="${s.t[i]}" data-cam="${s.c[i]}"><span>${fmtDay(s.t[i]).slice(0, 3)} ${fmtHM(s.t[i])}</span>${esc(W.cameras[s.c[i]].name)}</div>`).join("") || '<div class="empty">NONE</div>'}</div></div>
      </div>
      ${cases.length ? `<div class="mp"><div class="d-head w sm">NUMBERS</div><div class="d-body">${cases.map((c) => `<div class="crow" data-case="${c.id}"><span class="num">${c.number}</span><span class="tag ${c.list === "RELEVANT" ? "r" : "w"}">${c.list}</span><span class="ex">${c.subject === p ? "SUBJECT" : c.asset === p ? "ASSIGNED ASSET" : "ASSOCIATED"} · ${caseStatus(c, t)}</span></div>`).join("")}</div></div>` : ""}
      <div class="d-actions"><button data-act="map">SHOW ON MAP</button><button data-act="net">NETWORK</button>${last >= 0 ? `<button data-act="last">GO TO LAST SIGHTING</button>` : ""}</div>
    </div>
    </div>`;
  drawStrip($("[data-strip]", el), ix, t);
  if (fresh) { el.classList.remove("compiling"); void el.offsetWidth; el.classList.add("compiling"); reveal(el); }
}

// 7-day strip: one row per day, a tick per sighting
function drawStrip(el, ix, t) {
  const s = W.sightings, rows = [];
  for (let d = 0; d < W.days; d++) {
    const ticks = ix.filter((i) => Math.floor(s.t[i] / DAY) === d)
      .map((i) => `<i style="left:${((s.t[i] % DAY) / DAY) * 100}%" title="${fmtHM(s.t[i])} ${esc(W.cameras[s.c[i]].name)}" data-seek="${s.t[i]}"></i>`).join("");
    const future = (d + 1) * DAY > t ? `<u style="left:${Math.max(0, ((t - d * DAY) / DAY) * 100)}%"></u>` : "";
    rows.push(`<div class="srow7"><span>${fmtDay(d * DAY + 1).slice(0, 6)}</span><div>${ticks}${future}</div></div>`);
  }
  el.innerHTML = rows.join("") + `<div class="srow7 axis"><span></span><div>${[0, 6, 12, 18].map((h) => `<em style="left:${(h / 24) * 100}%">${String(h).padStart(2, "0")}:00</em>`).join("")}</div></div>`;
}

export default {
  id: "subjects", title: "SUBJECTS",
  mount(el) {
    root = el;
    root.className = "page page-subjects";
    root.innerHTML = `
      <aside class="cats panel"></aside>
      <section class="listcol panel">
        <div class="search"><input placeholder="SEARCH NAME, SSN, OCCUPATION" value="${esc(query)}"></div>
        <div class="listbar"><span class="count"></span><span class="sorts grp"></span></div>
        <div class="list"></div>
      </section>
      <section class="dossier panel"></section>`;
    listKey = dossKey = "";
    root.addEventListener("click", onClick);
    $("input", root).addEventListener("input", (e) => { query = e.target.value.trim(); listKey = ""; renderList(S.t); });
  },
  unmount() { root.removeEventListener("click", onClick); },
  onRoute() { listKey = dossKey = ""; },
  frame(t, now) {
    if (now - lastSlow < 500) return;
    lastSlow = now;
    renderList(t);
    renderDossier(t);
  },
};

function onClick(e) {
  const b = e.target.closest("[data-filter], [data-sort], [data-person], [data-case], [data-act], [data-seek], [data-cam]");
  if (!b) return;
  if (b.dataset.filter) { filter = b.dataset.filter; listKey = ""; }
  else if (b.dataset.sort) { sort = b.dataset.sort; listKey = ""; }
  else if (b.dataset.person) { const p = +b.dataset.person; select("person", p); go("subjects", W.people[p].id); }
  else if (b.dataset.case) go("cases", b.dataset.case);
  else if (b.dataset.act === "map") go("map");
  else if (b.dataset.act === "net") go("network");
  else if (b.dataset.act === "last") {
    const i = lastSeen(S.sel.person, S.t);
    seek(W.sightings.t[i] + 5, false); select("cam", W.sightings.c[i]); go("feeds", W.sightings.c[i]);
  }
  else if (b.dataset.seek) { seek(+b.dataset.seek + 5, false); if (b.dataset.cam) go("feeds", b.dataset.cam); }
  else if (b.dataset.cam) go("feeds", b.dataset.cam);
  listKey = ""; dossKey = dossKey.replace(/\|.*/, "|x");
  lastSlow = 0;
}
