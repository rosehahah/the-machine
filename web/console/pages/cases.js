// CASES: the numbers. The Machine gives a number before the crime and never says why; the nature of a
// case is only shown once it has played out. Live numbers from the real cameras are listed too.
import { S, go, select, seek, setSpeed } from "../state.js";
import { $, cropStyle, esc, pct, personRow } from "../ui.js";
import { DAY, W, caseProb, caseStatus, fmtDay, fmtHM, fmtStamp } from "../world.js";

let root, tab = "ALL", listKey = "", detKey = "", lastSlow = 0;
const TABS = ["ALL", "OPEN", "IRRELEVANT", "RELEVANT", "CLOSED", "LIVE"];

function visible(t) {
  return W.cases.map((c, i) => [c, i]).filter(([c]) => c.issued <= t).reverse();
}

function renderList(t) {
  const live = S.liveState.numbers || [];
  const key = `${tab}|${Math.floor(t / 30)}|${S.sel.case}|${live.map((n) => n.id + n.updated).join()}`;
  if (key === listKey) return;
  listKey = key;
  const all = visible(t);
  const count = { ALL: all.length, OPEN: 0, IRRELEVANT: 0, RELEVANT: 0, CLOSED: 0, LIVE: live.length };
  for (const [c] of all) { count[c.list]++; count[t < c.closed ? "OPEN" : "CLOSED"]++; }
  $(".tabs", root).innerHTML = TABS.map((x) => `<button data-tab="${x}" class="${x === tab ? "on" : ""} ${x === "RELEVANT" ? "red" : ""}">${x} <b>${count[x]}</b></button>`).join("");
  if (tab === "LIVE") {
    $(".clist", root).innerHTML = live.map((n) => `
      <div class="nrow live ${n.open ? "" : "closed"}" data-live="${n.id}">
        <img src="/api/numbers/${n.id}.jpg" alt="" onerror="this.style.visibility='hidden'">
        <div class="mid"><div class="num">${esc(n.number)}</div><div class="where">${esc(n.subject)}${n.drill ? " · DRILL" : ""} · ${esc(n.feed_label)}</div></div>
        <div class="rt"><span class="tag ${n.list === "RELEVANT" ? "r" : "w"}">${n.list}</span><div class="st">${esc(n.open ? n.status : "CLOSED")}</div></div>
      </div>`).join("") || `<div class="empty">NO NUMBERS FROM THE LIVE CAMERAS YET.<br>THEY APPEAR HERE WHEN THE MPOV ISSUES ONE.</div>`;
    return;
  }
  const rows = all.filter(([c]) => tab === "ALL" || (tab === "OPEN" ? t < c.closed : tab === "CLOSED" ? t >= c.closed : c.list === tab));
  $(".clist", root).innerHTML = rows.map(([c, i]) => {
    const st = caseStatus(c, t);
    return `<div class="nrow ${S.sel.case === i ? "on" : ""} ${st === "CLOSED" ? "closed" : ""}" data-case="${i}">
      <i class="ph" style="${cropStyle(c.subject)}"></i>
      <div class="mid"><div class="num">${c.number}</div><div class="where">${c.id} · ISSUED ${fmtDay(c.issued)} ${fmtHM(c.issued)}</div></div>
      <div class="rt"><span class="tag ${c.list === "RELEVANT" ? "r" : "w"}">${c.list}</span><div class="st ${st === "ACTIVE" ? "red" : ""}">${st}</div></div></div>`;
  }).join("") || '<div class="empty">NO NUMBERS</div>';
}

function chart(c, t) {
  const a = Math.min(c.events[0].t, c.issued) - 3600, b = c.closed + 1800, w = 600, h = 120;
  const x = (v) => ((v - a) / (b - a)) * w, y = (p) => h - 8 - p * (h - 20);
  const pts = [];
  for (let v = a; v <= Math.min(b, t); v += (b - a) / 240) pts.push(`${x(v).toFixed(1)},${y(caseProb(c, v)).toFixed(1)}`);
  const marks = c.events.filter((e) => e.t <= t).map((e) =>
    `<line x1="${x(e.t)}" x2="${x(e.t)}" y1="6" y2="${h - 8}" class="ev ${e.kind.toLowerCase()}"/>`).join("");
  const cur = t < b ? `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${h}" class="cur"/><rect x="${x(t)}" y="0" width="${Math.max(0, w - x(t))}" height="${h}" class="fut"/>` : "";
  const days = [];
  for (let d = Math.ceil(a / DAY) * DAY; d < b; d += DAY) days.push(`<line x1="${x(d)}" x2="${x(d)}" y1="0" y2="${h}" class="day"/><text x="${x(d) + 4}" y="12">${fmtDay(d)}</text>`);
  return `<svg class="pchart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${[0.25, 0.5, 0.75].map((p) => `<line x1="0" x2="${w}" y1="${y(p)}" y2="${y(p)}" class="grid"/>`).join("")}
    ${days.join("")}${marks}<polyline points="${pts.join(" ")}"/>${cur}</svg>
    <div class="paxis"><span>${fmtDay(a)} ${fmtHM(a)}</span><span>${fmtDay(b)} ${fmtHM(b)}</span></div>`;
}

function renderDetail(t) {
  const el = $(".cdetail", root), i = S.sel.case;
  if (i === null) {
    el.innerHTML = `<div class="placeholder">SELECT A NUMBER<br><span>THE MACHINE WILL NOT TELL YOU WHY</span></div>`;
    detKey = "";
    return;
  }
  const key = `${i}|${Math.floor(t / 20)}`;
  if (key === detKey) return;
  detKey = key;
  const c = W.cases[i], st = t < c.issued ? "ANALYZING" : caseStatus(c, t), done = t >= c.closed, P = W.people[c.subject];
  const prob = caseProb(c, t);
  const shown = c.events.filter((e) => e.t <= t);
  const next = c.events.find((e) => e.t > t);
  const roleIn = (p) => p === c.asset ? "ASSIGNED ASSET" : p === c.subject ? "SUBJECT"
    : done ? (p === c.perp ? "PERPETRATOR" : p === c.victim ? "VICTIM" : "ASSOCIATED") : "ASSOCIATED";
  const cams = [...new Set(c.events.filter((e) => e.t <= t).map((e) => e.cam))];
  const bg = shown.length ? W.cameras[shown[shown.length - 1].cam] : W.cameras[c.cam];
  const red = c.list === "RELEVANT" ? "r" : "";
  // Same MPOV panel as the dossier, over the camera of the latest event. The head is the show's two-layer status
  // bar (SPEC §4: "THREATS IDENTIFIED / PROCESSING..."): list name big on black, the issue line small on white.
  el.innerHTML = `
    <div class="d-cam" style="background-image:url(media/clips/${bg.clip}.jpg)"></div>
    <div class="d-camid">${esc(bg.id)}<br>${esc(bg.name.split(" / ")[0])}</div>
    <div class="d-cols">
    <div class="c-main">
      <div class="sbar ${red}"><b>${c.list}</b><span>NUMBER ISSUED · ${c.id} · ${st}</span></div>
      <div class="mp">
        <div class="d-sub">SUBJECT: <span data-person="${c.subject}" class="lnk">${esc(P.name)}</span></div>
        <div class="d-body">
          <div class="d-top">
            <div><div class="c-num">${c.number}</div><div class="c-code">${esc(c.code)}</div>
            <div class="kv">
              <span>LIST:</span><b class="${red ? "red" : ""}">${c.list}</b>
              <span>ISSUED:</span><b>${fmtStamp(c.issued)}</b>
              <span>NATURE OF THREAT:</span><b>${done ? esc(c.kind) : "UNKNOWN"}</b>
              <span>THREAT PROBABILITY:</span><b class="${prob > 0.5 ? "red" : ""}">${pct(prob)}</b>
              <span>OUTCOME:</span><b>${done ? esc(c.outcome) : "PENDING"}</b>
            </div></div>
            <i class="photo" style="${cropStyle(c.subject)}"></i>
          </div>
          <div class="evlist">
            ${shown.map((e) => `<div class="ev ${e.kind.toLowerCase()}" data-seek="${e.t}" data-cam="${e.cam}"><span class="tm">${fmtDay(e.t).slice(0, 3)} ${fmtHM(e.t)}</span><span class="tx">${esc(e.text)}</span><span class="cm">${esc(W.cameras[e.cam].name)}</span><b>${pct(e.p, 0)}</b></div>`).join("")}
            ${next ? `<div class="ev pending"><span class="tm">— — : — —</span><span class="tx">CALCULATING…</span></div>` : ""}
          </div>
          ${done && c.list === "RELEVANT" ? `<hr><div class="d-foot">${esc(c.outcome)}</div>` : ""}
        </div>
      </div>
    </div>
    <div class="d-side">
      <div class="mp"><div class="d-head w sm">THREAT PROBABILITY</div><div class="d-body">${chart(c, t)}</div></div>
      <div class="mp"><div class="d-head w sm">PERSONS</div><div class="d-body"><div class="plist">${c.people.map((p) => personRow(p, roleIn(p))).join("")}</div></div></div>
      <div class="mp"><div class="d-head w sm">LOCATIONS</div><div class="d-body"><div class="cams">${cams.map((cm) => `<button class="chip" data-cam="${cm}">${esc(W.cameras[cm].name)}</button>`).join("")}</div></div></div>
      <div class="d-actions"><button data-act="replay">REPLAY CASE · 60×</button><button data-act="issue">JUMP TO ISSUE</button><button data-act="map">SHOW ON MAP</button><button data-act="net">NETWORK</button></div>
    </div>
    </div>`;
}

function renderLive(id) {
  const n = (S.liveState.numbers || []).find((x) => x.id === id), el = $(".cdetail", root);
  if (!n) return;
  detKey = `live|${id}`;
  el.innerHTML = `
    <div class="c-head ${n.list === "RELEVANT" ? "r" : ""}"><span>NUMBER ISSUED · LIVE${n.drill ? " · DRILL" : ""}</span><span class="st">${n.open ? esc(n.status) : "CLOSED"}</span></div>
    <div class="c-num">${esc(n.number)}</div><div class="c-code">${esc(n.code)}</div>
    <div class="c-top"><img class="photo" src="/api/numbers/${n.id}.jpg" alt="" onerror="this.style.visibility='hidden'">
      <div class="kv"><span>SUBJECT</span><b>${esc(n.subject)}</b><span>DESIGNATION</span><b>${esc(n.role || "NONE")}</b>
      <span>LIST</span><b>${n.list}</b><span>FEED</span><b>${esc(n.feed_label)}</b></div></div>
    <h3>EVENTS</h3><div class="evlist">${n.timeline.map((l) => `<div class="ev"><span class="tm">${esc(l.t)}</span><span class="tx">${esc(l.text)}</span></div>`).join("")}</div>
    <div class="d-actions"><a class="btn" href="./">OPEN MPOV ↗</a></div>`;
}

export default {
  id: "cases", title: "CASES",
  mount(el) {
    root = el;
    root.className = "page page-cases";
    root.innerHTML = `<section class="ccol panel"><div class="tabs grp"></div><div class="clist"></div></section><section class="cdetail dossier panel"></section>`;
    listKey = detKey = "";
    root.addEventListener("click", onClick);
  },
  unmount() { root.removeEventListener("click", onClick); },
  onRoute() { listKey = detKey = ""; },
  frame(t, now) {
    if (now - lastSlow < 400) return;
    lastSlow = now;
    renderList(t);
    if (!detKey.startsWith("live|")) renderDetail(t);
  },
};

function onClick(e) {
  const b = e.target.closest("[data-tab], [data-case], [data-live], [data-person], [data-cam], [data-seek], [data-act]");
  if (!b) return;
  const c = S.sel.case !== null ? W.cases[S.sel.case] : null;
  if (b.dataset.tab) tab = b.dataset.tab;
  else if (b.dataset.case) { const i = +b.dataset.case; select("case", i); go("cases", W.cases[i].id); detKey = ""; }
  else if (b.dataset.live) { renderLive(b.dataset.live); return; }
  else if (b.dataset.person) { select("person", +b.dataset.person); go("subjects", W.people[+b.dataset.person].id); }
  else if (b.dataset.seek) { seek(+b.dataset.seek, false); detKey = ""; }
  else if (b.dataset.cam) go("feeds", b.dataset.cam);
  else if (b.dataset.act === "replay" && c) { seek(Math.min(c.events[0].t, c.issued) - 600); setSpeed(60); }
  else if (b.dataset.act === "issue" && c) { seek(c.issued, false); }
  else if (b.dataset.act === "map") go("map");
  else if (b.dataset.act === "net" && c) { select("person", c.subject); go("network"); }
  listKey = ""; lastSlow = 0;
}
