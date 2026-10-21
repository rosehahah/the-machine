// Shared console state: the world clock, playback, the selection, and the current page.
import { clamp } from "../hud.js";
import { DAY, W, nowT } from "./world.js";

export const S = {
  t: 0,               // world time under the cursor
  live: true,         // cursor glued to now
  playing: true,
  speed: 1,
  view: { t0: 0, t1: DAY },  // timeline window
  sel: { person: null, case: null, cam: null },
  page: "feeds",
  arg: null,          // page argument from the URL (#/page/arg)
  liveState: { feeds: [], numbers: [], identities: [] },  // from the real server
};

const bus = new EventTarget();
export const on = (ev, fn) => bus.addEventListener(ev, (e) => fn(e.detail));
export const emit = (ev, detail) => bus.dispatchEvent(new CustomEvent(ev, { detail }));

export function seek(t, keepPlaying = true) {
  const now = nowT();
  S.t = clamp(t, 0, now);
  S.live = S.t >= now - 1;
  if (!keepPlaying) S.playing = false;
  emit("seek", S.t);
}
export function goLive() { S.live = true; S.playing = true; S.speed = 1; S.t = nowT(); emit("seek", S.t); }
export function setSpeed(v) { S.speed = v; if (v > 1 && S.live) S.live = false; S.playing = true; emit("play"); }
export function togglePlay() { S.playing = !S.playing; if (!S.playing) S.live = false; emit("play"); }

export function select(kind, v) {
  if (S.sel[kind] === v) return;
  S.sel[kind] = v;
  emit("sel", kind);
}

// navigate: page + optional argument (camera index, person id, case id)
export function go(page, arg) {
  const h = `#/${page}${arg !== undefined && arg !== null ? `/${arg}` : ""}`;
  if (location.hash !== h) location.hash = h;
  else route();
}

export function route() {
  const [, page = "feeds", arg = null] = location.hash.split("/");
  S.page = page || "feeds";
  S.arg = arg ? decodeURIComponent(arg) : null;
  if (S.arg && S.page === "subjects" && W.byId.has(S.arg)) select("person", W.byId.get(S.arg));
  if (S.arg && S.page === "cases" && W.caseById.has(S.arg)) select("case", W.caseById.get(S.arg));
  if (S.arg && S.page === "feeds" && /^\d+$/.test(S.arg)) select("cam", +S.arg);
  emit("page", S.page);
}
