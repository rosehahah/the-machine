// The Machine — console. Pages share one world clock (the timeline at the bottom) and one selection.
import { S, go, on, route, seek, select } from "./state.js";
import { drawTimeline, initTimeline, timelineKeys } from "./timeline.js";
import { $ } from "./ui.js";
import { W, fmtDay, fmtClock, loadWorld, nowT } from "./world.js";
import feeds from "./pages/feeds.js";
import subjects from "./pages/subjects.js";
import cases from "./pages/cases.js";
import network from "./pages/network.js";
import map from "./pages/map.js";
import log from "./pages/log.js";

const PAGES = { feeds, subjects, cases, network, map, log };
const KEYS = { 1: "feeds", 2: "subjects", 3: "cases", 4: "network", 5: "map", 6: "log" };
let current = null, lastTick = performance.now();

function mountPage() {
  const page = PAGES[S.page] || feeds;
  for (const a of document.querySelectorAll("#nav a")) a.classList.toggle("on", a.dataset.page === page.id);
  if (current === page) { page.onRoute?.(); return; }
  current?.unmount();
  const el = $("#page");
  el.innerHTML = "";
  current = page;
  page.mount(el);
}

function tick(ms) {
  requestAnimationFrame(tick);
  const dt = (ms - lastTick) / 1000;
  lastTick = ms;
  const now = nowT();
  if (S.live) S.t = now;
  else if (S.playing) { S.t = Math.min(now, S.t + dt * S.speed); if (S.t >= now) { S.live = true; S.speed = 1; } }
  $("#clock .day").textContent = fmtDay(S.t);
  $("#clock .time").textContent = fmtClock(S.t);
  $("#clock").classList.toggle("replay", !S.live);
  current?.frame(S.t, ms);
  drawTimeline();
}

async function pollLive() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) {
      const st = await r.json();
      S.liveState = { feeds: st.feeds || [], numbers: st.numbers || [], identities: st.identities || [] };
      const open = S.liveState.numbers.filter((n) => n.open).length;
      $("#live-badge").textContent = `${S.liveState.feeds.length} LIVE${open ? ` · ${open} NUMBER${open > 1 ? "S" : ""}` : ""}`;
      $("#live-badge").classList.toggle("hot", open > 0);
    } else if (r.status === 404) return;  // no backend (static demo site): archive only
  } catch {}
  setTimeout(pollLive, 2000);
}

addEventListener("keydown", (e) => {
  if (e.target.matches?.("input, select, textarea")) { if (e.key === "Escape") e.target.blur(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (timelineKeys(e)) return;
  if (KEYS[e.key]) go(KEYS[e.key]);
  else if (e.key === "Escape" && S.page === "feeds" && S.arg !== null) go("feeds");
  else if (e.key.toLowerCase() === "f") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
});

(async function start() {
  const boot = $("#cboot pre");
  boot.textContent = "THE MACHINE · CONSOLE\nLOADING SURVEILLANCE ARCHIVE…\n";
  try {
    await loadWorld();
  } catch (e) {
    boot.textContent += `\nARCHIVE UNAVAILABLE: ${e.message}\nRUN: .venv/bin/python tools/gen_world.py`;
    return;
  }
  boot.textContent += `${W.cameras.length} CAMERAS\n${W.people.length} PROFILES\n${W.n.toLocaleString("en-US")} SIGHTINGS\n${W.cases.length} NUMBERS\n${fmtDay(0)} — ${fmtDay(W.end - 1)}\n\nONLINE.`;
  S.t = nowT();
  window.machine = { S, W, go, seek, select };  // handy from the devtools console
  initTimeline($("#timeline"));
  on("page", mountPage);
  addEventListener("hashchange", route);
  route();
  pollLive();
  requestAnimationFrame(tick);
  setTimeout(() => $("#cboot").classList.add("done"), 700);
})();
