// Box and label drawing shared by the MPOV view (app.js) and the console's camera tiles.

export const COLORS = { white: "#f2f2f2", yellow: "#f2e02a", red: "#e8212b", blue: "#1d6cf0", black: "#0a0a0a", ink: "#111" };
// edge colour, corner/tick colour, label background, label text
// "cross": the wiki's "corners and crosshairs" boxes have long mid-edge ticks in the corner colour
export const STYLES = {
  white:        { edge: COLORS.white,  corner: COLORS.white,  bg: COLORS.white,  fg: COLORS.ink },
  yellow:       { edge: COLORS.yellow, corner: COLORS.yellow, bg: COLORS.yellow, fg: COLORS.ink },
  black_yellow: { edge: COLORS.black,  corner: COLORS.yellow, bg: COLORS.black,  fg: COLORS.yellow, border: COLORS.yellow, cross: true },
  red:          { edge: COLORS.red,    corner: COLORS.red,    bg: COLORS.red,    fg: "#fff" },
  white_red:    { edge: COLORS.white,  corner: COLORS.red,    bg: COLORS.red,    fg: "#fff", cross: true },
  blue:         { edge: COLORS.blue,   corner: COLORS.blue,   bg: COLORS.blue,   fg: "#fff" },
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The show boxes heads, not bodies: a square from just above the hair to the collar (SPEC 2.1).
// Same rule as head_from_person() in backend/vision.py, for a person box in screen pixels.
export function headBox(x, y, w, h) {
  const side = Math.min(w * 0.62, h * 0.5);
  return [x + w / 2 - side / 2, y - side * 0.08, side, side];
}

export function drawBox(ctx, x, y, w, h, style, alpha) {
  const st = STYLES[style] || STYLES.white;
  const s = Math.min(w, h);
  const lw = clamp(s / 85, 1.4, 4.2);
  const arm = s * 0.11, tick = s * (st.cross ? 0.16 : 0.055);
  const dash = Math.max(4, s * 0.034), gap = Math.max(3, s * 0.022);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = style === "black_yellow" ? "rgba(0,0,0,.6)" : st.edge;
  ctx.shadowBlur = 5;
  // dashed edges between the corner arms
  ctx.strokeStyle = st.edge; ctx.lineWidth = lw; ctx.setLineDash([dash, gap]); ctx.lineCap = "butt";
  ctx.beginPath();
  const g = gap * 0.8;
  ctx.moveTo(x + arm + g, y); ctx.lineTo(x + w - arm - g, y);
  ctx.moveTo(x + arm + g, y + h); ctx.lineTo(x + w - arm - g, y + h);
  ctx.moveTo(x, y + arm + g); ctx.lineTo(x, y + h - arm - g);
  ctx.moveTo(x + w, y + arm + g); ctx.lineTo(x + w, y + h - arm - g);
  ctx.stroke();
  // solid corner brackets
  ctx.setLineDash([]); ctx.strokeStyle = st.corner; ctx.lineWidth = lw * 1.7; ctx.lineJoin = "round";
  ctx.shadowColor = st.corner;
  ctx.beginPath();
  ctx.moveTo(x, y + arm); ctx.lineTo(x, y); ctx.lineTo(x + arm, y);
  ctx.moveTo(x + w - arm, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + arm);
  ctx.moveTo(x + w, y + h - arm); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - arm, y + h);
  ctx.moveTo(x + arm, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - arm);
  ctx.stroke();
  // mid-edge ticks, pointing inward
  ctx.lineWidth = lw * 1.35;
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y - lw * 0.6); ctx.lineTo(x + w / 2, y + tick);
  ctx.moveTo(x + w / 2, y + h + lw * 0.6); ctx.lineTo(x + w / 2, y + h - tick);
  ctx.moveTo(x - lw * 0.6, y + h / 2); ctx.lineTo(x + tick, y + h / 2);
  ctx.moveTo(x + w + lw * 0.6, y + h / 2); ctx.lineTo(x + w - tick, y + h / 2);
  ctx.stroke();
  ctx.restore();
}

// label to the right of the box (left if it would cross `right`); minFs lets small tiles keep labels legible
export function drawLabel(ctx, text, x, y, w, h, style, alpha, right, minFs = 11) {
  const st = STYLES[style] || STYLES.white;
  const s = Math.min(w, h);
  const fs = clamp(s * 0.095, minFs, 32);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `500 ${fs}px Futura, "Futura PT", Jost, "Century Gothic", sans-serif`;
  const tw = ctx.measureText(text).width + fs * 0.12 * text.length * 0.5;
  const pw = tw + fs * 0.9, ph = fs * 1.42;
  let lx = x + w + s * 0.12;
  if (lx + pw > right - 4) lx = x - s * 0.12 - pw;
  const ly = y + h * 0.5 - ph / 2;
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 6;
  ctx.fillStyle = st.bg; ctx.fillRect(lx, ly, pw, ph);
  ctx.shadowBlur = 0;
  if (st.border) { ctx.strokeStyle = st.border; ctx.lineWidth = 1.2; ctx.strokeRect(lx + 0.6, ly + 0.6, pw - 1.2, ph - 1.2); }
  ctx.fillStyle = st.fg; ctx.textBaseline = "middle";
  ctx.letterSpacing = `${fs * 0.06}px`;
  ctx.fillText(text, lx + fs * 0.45, ly + ph / 2 + fs * 0.05);
  ctx.restore();
}
