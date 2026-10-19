// Small DOM helpers shared by the pages.
import { ROLE_SHORT, W, roleClass } from "./world.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;

// a person's CCTV snapshot from the crop sheet, as an inline style
export function cropStyle(p) {
  const c = W.crop, i = W.people[p].crop;
  if (i < 0 || !c?.n) return "";
  const rows = Math.ceil(c.n / c.cols), col = i % c.cols, row = Math.floor(i / c.cols);
  return `background-image:url(media/crops.jpg);background-size:${c.cols * 100}% ${rows * 100}%;` +
    `background-position:${(col / (c.cols - 1)) * 100}% ${(row / Math.max(1, rows - 1)) * 100}%`;
}

export const roleTag = (role) => `<span class="tag ${roleClass(role)}">${esc(ROLE_SHORT[role] || role)}</span>`;

export function personRow(p, extra = "") {
  const P = W.people[p];
  return `<div class="prow" data-person="${p}"><i class="ph" style="${cropStyle(p)}"></i>` +
    `<span class="nm">${esc(P.name)}</span>${roleTag(P.role)}<span class="ex">${extra}</span></div>`;
}

// sparkline of values in [0,1] as an inline SVG path
export function spark(vals, w = 120, h = 24, cls = "") {
  if (!vals.length) return "";
  const max = Math.max(...vals, 1e-9);
  const pts = vals.map((v, i) => `${((i / Math.max(1, vals.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`);
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="none">` +
    `<polyline points="${pts.join(" ")}"/></svg>`;
}

// typewriter-style reveal of rows, like the show's "COMPILING PERSONAL PROFILE"
export function reveal(el, step = 35) {
  const rows = $$(".rv", el);
  rows.forEach((r, i) => { r.style.animationDelay = `${i * step}ms`; });
}
