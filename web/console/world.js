// The mock city (web/data/world.json, made by tools/gen_world.py) plus indexes and time-aware queries.
// World time t = seconds since local midnight of world.start. Nothing after "now" has happened yet.

export const DAY = 86400;
export const W = {};

const lowerBound = (arr, v) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  return lo;
};
export const upperBound = (arr, v) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; }
  return lo;
};

export async function loadWorld() {
  const [world, map] = await Promise.all([
    fetch("data/world.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("data/manhattan.json").then((r) => r.json()),
  ]);
  Object.assign(W, world);
  W.map = map;
  const [y, m, d] = world.start.split("-").map(Number);
  W.startMs = new Date(y, m - 1, d).getTime();
  // a static copy (the public demo site) can't regenerate the archive: slide the window so it ends today
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const want = new Date(today); want.setDate(today.getDate() - (world.days - 1));
  if (W.startMs < want.getTime()) W.startMs = want.getTime();
  W.end = world.days * DAY;
  const s = world.sightings;
  W.n = s.t.length;
  // per camera and per person: sighting indices in time order (sightings are sorted by t)
  W.camIdx = world.cameras.map(() => []);
  W.personIdx = world.people.map(() => []);
  for (let i = 0; i < W.n; i++) { W.camIdx[s.c[i]].push(i); W.personIdx[s.p[i]].push(i); }
  W.camT = W.camIdx.map((ix) => Float64Array.from(ix, (i) => s.t[i]));
  W.personT = W.personIdx.map((ix) => Float64Array.from(ix, (i) => s.t[i]));
  W.byId = new Map(world.people.map((p, i) => [p.id, i]));
  W.caseById = new Map(world.cases.map((c, i) => [c.id, i]));
  W.casesOf = world.people.map(() => []);
  world.cases.forEach((c, i) => c.people.forEach((p) => W.casesOf[p].push(i)));
  W.neighbors = world.people.map(() => []);
  for (const [a, b, n, f, l] of world.edges) { W.neighbors[a].push([b, n, f, l]); W.neighbors[b].push([a, n, f, l]); }
  for (const nb of W.neighbors) nb.sort((x, y) => y[1] - x[1]);
  return W;
}

export const nowT = () => (Date.now() - W.startMs) / 1000;
export const toDate = (t) => new Date(W.startMs + t * 1000);
const pad = (n) => String(n).padStart(2, "0");
export const fmtClock = (t) => { const d = toDate(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
export const fmtHM = (t) => { const d = toDate(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
export const fmtDay = (t) => { const d = toDate(t); return `${DOW[d.getDay()]} ${pad(d.getDate())} ${MON[d.getMonth()]}`; };
export const fmtDate = (t) => { const d = toDate(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtStamp = (t) => `${fmtDay(t)} ${fmtClock(t)}`;
export function fmtAgo(sec) {
  if (sec < 60) return `${Math.max(0, Math.round(sec))} S AGO`;
  if (sec < 3600) return `${Math.round(sec / 60)} MIN AGO`;
  if (sec < DAY) return `${(sec / 3600).toFixed(sec < 36000 ? 1 : 0)} H AGO`;
  return `${(sec / DAY).toFixed(1)} D AGO`;
}

/* ------------------------------------------------------------------ queries */
// people at a camera at time t: [{p, i (sighting), since}]
export function presentAt(cam, t) {
  const ix = W.camIdx[cam], ts = W.camT[cam], s = W.sightings, out = [];
  for (let k = lowerBound(ts, t - 3600); k < ix.length && ts[k] <= t; k++) {
    const i = ix[k];
    if (t < s.t[i] + s.d[i]) out.push({ p: s.p[i], i, since: s.t[i] });
  }
  return out;
}

// sightings of a person up to t (indices into W.sightings), most recent last
export function sightingsOf(p, t = Infinity, from = -Infinity) {
  const ix = W.personIdx[p], ts = W.personT[p];
  return ix.slice(lowerBound(ts, from), upperBound(ts, t));
}

export function lastSeen(p, t) {
  const ts = W.personT[p], k = upperBound(ts, t) - 1;
  return k >= 0 ? W.personIdx[p][k] : -1;
}

export function camCount(cam, t0, t1) {
  const ts = W.camT[cam];
  return upperBound(ts, t1) - lowerBound(ts, t0);
}

// where is this person, according to the Machine: the camera they are on now, or a guess from habit
export function predictLocation(p, t) {
  const ix = sightingsOf(p, t), s = W.sightings;
  const hist = new Map();
  const hour = toDate(t + 3600).getHours();
  for (const i of ix) {
    const h = toDate(s.t[i]).getHours();
    const wgt = Math.abs(h - hour) <= 1 ? 3 : 1;
    hist.set(s.c[i], (hist.get(s.c[i]) || 0) + wgt);
  }
  const total = [...hist.values()].reduce((a, b) => a + b, 0);
  return [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => ({ cam: c, p: n / (total || 1) }));
}

/* ------------------------------------------------------------------ cases */
export const caseVisible = (c, t) => c.issued <= t;
export const caseOpen = (c, t) => c.issued <= t && t < c.closed;
export function caseStatus(c, t) {
  if (t < c.issued) return "PENDING";
  if (t < c.due) return "OPEN";
  if (t < c.closed) return "ACTIVE";
  return "CLOSED";
}
export function caseProb(c, t) {
  let p = 0;
  for (const e of c.events) if (e.t <= t && e.kind !== "CLOSED") p = e.p;
  if (t >= c.closed) p = 0;
  return p;
}

// threat probability for a person at t: baseline + open cases they are the threat in
export function threatProb(p, t) {
  const person = W.people[p];
  let v = person.risk;
  for (const ci of W.casesOf[p]) {
    const c = W.cases[ci];
    if (c.perp === p && c.issued - 4 * DAY <= t && t < c.closed) v = Math.max(v, caseProb(c, t));
  }
  return v;
}

// box style for a person on camera at t, matching the MPOV legend
export function styleOf(p, t) {
  const role = W.people[p].role;
  if (role === "ADMIN" || role === "PRIMARY ASSET" || role === "SECONDARY ASSET") return "yellow";
  if (role === "ANALOG INTERFACE") return "black_yellow";
  for (const ci of W.casesOf[p]) {
    const c = W.cases[ci];
    if (c.perp !== p) continue;
    const armed = c.events.find((e) => e.kind === "ARMED");
    if (armed && armed.t <= t && t < c.closed) return t >= c.due ? "red" : "white_red";
  }
  if (role === "THREAT") return "white_red";
  return "white";
}

export const ROLE_ORDER = ["ADMIN", "ANALOG INTERFACE", "PRIMARY ASSET", "SECONDARY ASSET", "THREAT", "PERSON OF INTEREST", "IRRELEVANT"];
export const ROLE_SHORT = { ADMIN: "ADMIN", "ANALOG INTERFACE": "ANALOG INTERFACE", "PRIMARY ASSET": "PRIMARY ASSET",
  "SECONDARY ASSET": "SECONDARY ASSET", THREAT: "THREAT", "PERSON OF INTEREST": "POI", IRRELEVANT: "IRRELEVANT" };
export const roleClass = (role) => ({ ADMIN: "y", "PRIMARY ASSET": "y", "SECONDARY ASSET": "y", "ANALOG INTERFACE": "by",
  THREAT: "r", "PERSON OF INTEREST": "w" }[role] || "g");
export const age = (dob, t) => { const d = toDate(t), b = new Date(dob); return d.getFullYear() - b.getFullYear() - (d < new Date(d.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0); };
