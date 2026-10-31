// @ts-check
// Hiệu ứng niệm bùa trên đầu nhân vật + tia quét theo nét vẽ. Phong cách bút mực vẽ tay:
// không vòng tròn hoàn hảo, không xoay đều; mọi nét có rung tay cố định theo seed (không nhấp nháy).
//
// 4 kiểu (SIGIL_STYLE trong core/config.js, xem thử bằng ?sigil=1..4):
//   1 Mực viết   – ký hiệu tự viết ra bằng nét mực, giọt mực văng, gạch chân lượn sóng
//   2 Pháp ấn    – vòng tròn nguệch ngoạc vẽ dần, tia gạch, sao lấp lánh
//   3 Nét bay    – chính nét người chơi vừa vẽ thu nhỏ bay lên đầu rồi nổ sao
//   4 Truyện tranh – khung nổ răng cưa kiểu "POW", vạch tốc độ
import { SIGIL_STYLE, SPELL_COLOR } from '../core/config.js';
import { edges } from './view.js';
import { INK, ink, inkText } from './ink.js';

const TAU = Math.PI * 2;
const q = new URLSearchParams(location.search).get('sigil');
export const sigil = { style: Number(q) || SIGIL_STYLE };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
/** Số ngẫu nhiên có seed: cùng hiệu ứng -> cùng hình mỗi khung. */
const rand = (seed) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
/** Pha màu với trắng (k = 0..1). */
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(v + (255 - v) * k);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// ---- ký hiệu bùa dạng NÉT (không dùng font -> luôn giống nét bút trên mọi máy) ----
const HEART = Array.from({ length: 33 }, (_, i) => {
  const t = (i / 32) * TAU;
  return [(16 * Math.sin(t) ** 3) / 34, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 34 + 0.02];
});
const PATHS = {
  HAT_UP: [[-0.45, 0.4], [0, -0.45], [0.45, 0.4]],
  HAT_DOWN: [[-0.45, -0.4], [0, 0.45], [0.45, -0.4]],
  VERTICAL: [[0, -0.48], [0, 0.48]],
  HORIZONTAL: [[-0.48, 0], [0.48, 0]],
  DIAGONAL: [[-0.42, 0.42], [0.42, -0.42]],
  LIGHTNING: [[0.22, -0.5], [-0.22, 0.04], [0.18, 0.04], [-0.2, 0.5]],
  HEART,
  SHIELD: Array.from({ length: 33 }, (_, i) => [Math.cos((i / 32) * TAU - 1.2) * 0.46, Math.sin((i / 32) * TAU - 1.2) * 0.46]),
};

/** Chia nhỏ đường gấp khúc để rung tay hiện ra trên cả đoạn thẳng dài. */
function dense(pts, per = 6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    for (let k = 1; k <= per; k++) {
      const t = k / per;
      out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
    }
  }
  return out;
}
/** Phần đầu của đường, dài prog (0..1) tổng độ dài -> hiệu ứng "đang viết". */
function partial(pts, prog) {
  if (prog >= 1) return pts;
  const seg = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let want = total * prog;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (want >= seg[i - 1]) { out.push(pts[i]); want -= seg[i - 1]; continue; }
    const t = want / (seg[i - 1] || 1);
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
    break;
  }
  return out;
}
function trace(c, pts, close = false) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  if (close) c.closePath();
}
/** Nét mực 3 lớp: viền trắng · màu bùa · lõi mực xanh mảnh. */
function inkLine(c, pts, w, color) {
  if (pts.length < 2) return;
  c.lineCap = c.lineJoin = 'round';
  trace(c, pts);
  c.strokeStyle = '#fff'; c.lineWidth = w * 1.8; c.stroke();
  c.strokeStyle = color; c.lineWidth = w; c.stroke();
  if (!ink.low) { c.strokeStyle = INK; c.lineWidth = Math.max(1.5, w * 0.3); c.stroke(); }
}

/** Vẽ ký hiệu bùa tại (x, y), cỡ size, viết được prog phần. spell = null -> dấu '?'. */
function drawGlyph(c, spell, x, y, size, prog, color, seed) {
  const base = spell && PATHS[spell];
  if (!base) { if (prog > 0.3) inkText(c, '?', x, y + size * 0.32, size * 0.9, 'center', '#6b6b80'); return; }
  const pts = dense(base, spell === 'HEART' || spell === 'SHIELD' ? 1 : 6).map(([u, v], i) => [
    x + u * size + Math.sin(i * 1.7 + seed) * size * 0.018,
    y + v * size + Math.cos(i * 2.3 + seed) * size * 0.018,
  ]);
  inkLine(c, partial(pts, prog), size * 0.13, color);
}

/** Ngôi sao 4 cánh vẽ tay. */
function sparkle(c, x, y, r, color) {
  if (r <= 0.5) return;
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
  c.fillStyle = color; c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
}

// ---------------- 4 kiểu ----------------

/** 1. Mực viết: ký hiệu được viết ra, giọt mực văng, gạch chân lượn sóng. */
function inkWrite(c, f, k, col) {
  const r = rand(f.id), cy = f.y - 6 - k * 34, size = 88;
  const burst = easeOut(clamp01(k / 0.35));
  for (let i = 0; i < 9; i++) {   // giọt mực văng
    const a = r() * TAU, d = (40 + r() * 46) * burst, rad = (3 + r() * 6) * (1 - k * 0.6);
    c.beginPath(); c.arc(f.x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, rad, 0, TAU);
    c.fillStyle = i % 3 === 0 ? col : INK; c.fill();
  }
  drawGlyph(c, f.s, f.x, cy, size, clamp01(k / 0.3), col, f.id);
  const u = clamp01((k - 0.22) / 0.25);   // gạch chân lượn sóng viết sau
  if (u > 0) {
    const wave = Array.from({ length: 16 }, (_, i) => [f.x - 52 + i * 7, cy + size * 0.62 + Math.sin(i * 0.9 + f.id) * 4]);
    inkLine(c, partial(wave, u), 4, col);
  }
}

/** 2. Pháp ấn vẽ tay: vòng nguệch ngoạc 2 lớp vẽ dần, tia gạch, sao lấp lánh. */
function doodleSeal(c, f, k, col) {
  const r = rand(f.id), cy = f.y - k * 18, R = 54;
  const ring = (j) => Array.from({ length: 37 }, (_, i) => {
    const a = (i / 36) * TAU * 1.06 - 1.6 + j * 0.4, rr = R * (1 + (r() - 0.5) * 0.09) + j * 4;
    return [f.x + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92];
  });
  const p = clamp01(k / 0.35), a1 = ring(0), a2 = ring(1);
  c.save(); c.globalAlpha *= 0.9 * p;
  trace(c, a1, true); c.fillStyle = 'rgba(251,247,236,.92)'; c.fill();
  c.restore();
  inkLine(c, partial(a1, p), 4, INK);
  if (!ink.low) { c.lineCap = 'round'; trace(c, partial(a2, clamp01(p * 1.2 - 0.2))); c.strokeStyle = col; c.lineWidth = 2.5; c.stroke(); }
  const tick = clamp01((k - 0.12) / 0.2);   // tia gạch quanh vòng
  if (tick > 0) {
    c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + r() * 0.25, l = (8 + r() * 10) * tick;
      c.beginPath();
      c.moveTo(f.x + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10));
      c.lineTo(f.x + Math.cos(a) * (R + 10 + l), cy + Math.sin(a) * (R + 10 + l));
      c.stroke();
    }
  }
  drawGlyph(c, f.s, f.x, cy, 62, clamp01((k - 0.2) / 0.3), col, f.id);
  for (let i = 0; i < 5; i++) {   // sao bật ra lần lượt
    const a = r() * TAU, d = R + 26 + r() * 16, t = clamp01((k - 0.25 - i * 0.06) / 0.4);
    sparkle(c, f.x + Math.cos(a) * d, cy + Math.sin(a) * d, (7 + r() * 6) * Math.sin(Math.PI * t), i % 2 ? col : '#fff');
  }
}

/** 3. Nét bay: nét người chơi vừa vẽ thu nhỏ, bay lên đầu nhân vật rồi nổ sao. */
function strokeFly(c, f, k, col) {
  const src = f.pts;
  if (!src || src.length < 2) { inkWrite(c, f, k, col); return; }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of src) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sc = 96 / Math.max(40, x1 - x0, y1 - y0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const e = easeInOut(clamp01(k / 0.4)), tx = f.x, ty = f.y - 4 - k * 22;
  const pulse = k > 0.4 ? 1 + 0.12 * Math.sin(((k - 0.4) / 0.6) * Math.PI) : 1;
  const pts = src.map(([x, y]) => [
    x + (tx + (x - mx) * sc * pulse - x) * e,
    y + (ty + (y - my) * sc * pulse - y) * e,
  ]);
  inkLine(c, pts, 8 + 4 * (1 - e), col);
  if (k > 0.4) {   // nổ sao khi tới nơi
    const r = rand(f.id), t = (k - 0.4) / 0.6;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + r() * 0.4, d = 30 + easeOut(t) * 60;
      sparkle(c, tx + Math.cos(a) * d, ty + Math.sin(a) * d, 9 * (1 - t), i % 2 ? col : '#fff');
    }
  }
}

/** 4. Truyện tranh: khung nổ răng cưa, vạch tốc độ, ký hiệu bật ra. */
function comicBurst(c, f, k, col) {
  const r = rand(f.id), cy = f.y - 10 - k * 14, pop = easeOutBack(clamp01(k / 0.28));
  const R = 58 * pop, n = 11, rot = (r() - 0.5) * 0.6 + Math.sin(k * 9) * 0.04;
  const star = Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * TAU + rot, rr = i % 2 ? R * 0.64 : R * (0.92 + r() * 0.22);
    return [f.x + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9];
  });
  const lines = clamp01(k / 0.4);
  c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round';
  for (let i = 0; i < 10; i++) {   // vạch tốc độ
    const a = (i / 10) * TAU + r() * 0.3;
    c.beginPath();
    c.moveTo(f.x + Math.cos(a) * R * 1.15, cy + Math.sin(a) * R * 1.05);
    c.lineTo(f.x + Math.cos(a) * R * (1.15 + 0.55 * lines), cy + Math.sin(a) * R * (1.05 + 0.5 * lines));
    c.stroke();
  }
  c.lineJoin = 'round';
  trace(c, star, true);
  c.fillStyle = lighten(col, 0.55); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 9; c.stroke();
  c.strokeStyle = INK; c.lineWidth = 3.5; c.stroke();
  drawGlyph(c, f.s, f.x, cy, 60 * pop, 1, col, f.id);
}

const STYLES = { 1: inkWrite, 2: doodleSeal, 3: strokeFly, 4: comicBurst };

/** f: {x, y, s, ok, id, pts?, a: 0..1} */
export function drawSigil(c, f) {
  const k = f.a, col = f.s ? SPELL_COLOR[f.s] : '#8a8a9a';
  c.save();
  c.globalAlpha = (f.ok ? 1 : 0.55) * (k > 0.72 ? (1 - k) / 0.28 : 1);
  (STYLES[sigil.style] || inkWrite)(c, f, k, col);
  c.restore();
}

// ---------------- tia quét theo nét vẽ ----------------

/** Rung tay dọc đường từ A tới B. */
function wobbly(ax, ay, bx, by, seed, amp) {
  const L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L, ny = (bx - ax) / L, n = Math.max(2, Math.round(L / 40));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, o = Math.sin(i * 1.9 + seed) * amp;
    return [ax + (bx - ax) * t + nx * o, ay + (by - ay) * t + ny * o];
  });
}

/** Tia quét từ A tới B (lướt nhanh rồi mờ dần), bề rộng khớp vùng trúng. f: {ax, ay, bx, by, col, id, a} */
export function drawBeam(c, f) {
  const k = f.a, al = 1 - k, p = easeOut(clamp01(k / 0.3));
  const ex = f.ax + (f.bx - f.ax) * p, ey = f.ay + (f.by - f.ay) * p;
  c.save();
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(f.ax, f.ay); c.lineTo(ex, ey);
  c.globalAlpha = al * 0.22; c.strokeStyle = f.col; c.lineWidth = 110; c.stroke();
  c.globalAlpha = al * 0.5; c.lineWidth = 46; c.stroke();
  c.globalAlpha = al; c.strokeStyle = '#fff'; c.lineWidth = 14; c.stroke();
  trace(c, wobbly(f.ax, f.ay, ex, ey, f.id, 3));
  c.strokeStyle = INK; c.lineWidth = 3.5; c.stroke();
  c.restore();
}

/** Vùng nổ cho bùa V. f: {x, y, r, col, a} */
export function drawArea(c, f) {
  const k = f.a, al = 1 - k, rr = f.r * (0.55 + 0.45 * easeOut(clamp01(k / 0.3)));
  c.save();
  c.globalAlpha = al * 0.3; c.fillStyle = f.col;
  c.beginPath(); c.arc(f.x, f.y, rr, 0, TAU); c.fill();
  c.globalAlpha = al;
  const ring = Array.from({ length: 29 }, (_, i) => {
    const a = (i / 28) * TAU, o = 1 + Math.sin(i * 2.7 + f.id) * 0.05;
    return [f.x + Math.cos(a) * rr * o, f.y + Math.sin(a) * rr * o];
  });
  trace(c, ring, true);
  c.strokeStyle = '#fff'; c.lineWidth = 8; c.stroke();
  c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
  c.restore();
}

/** Đổi hình học nét vẽ thành hiệu ứng tia/vùng. */
export function areaFx(s, g, col, id) {
  const e = edges();
  if (s === 'HORIZONTAL') { const r = g.x1 >= g.x0; return { t: 'beam', ax: r ? e.l - 20 : e.r + 20, ay: g.cy, bx: r ? e.r + 20 : e.l - 20, by: g.cy, col, id }; }
  if (s === 'VERTICAL') { const d = g.y1 >= g.y0; return { t: 'beam', ax: g.cx, ay: d ? e.t - 20 : e.b + 20, bx: g.cx, by: d ? e.b + 20 : e.t - 20, col, id }; }
  if (s === 'DIAGONAL') {
    const dx = g.x1 - g.x0, dy = g.y1 - g.y0, L = Math.hypot(dx, dy) || 1, mx = (g.x0 + g.x1) / 2, my = (g.y0 + g.y1) / 2;
    return { t: 'beam', ax: mx - (dx / L) * 1200, ay: my - (dy / L) * 1200, bx: mx + (dx / L) * 1200, by: my + (dy / L) * 1200, col, id };
  }
  return { t: 'area', x: g.cx, y: g.cy, r: Math.max(g.maxX - g.minX, g.maxY - g.minY) / 2 + 45, col, id };
}
