// @ts-check
// Vẽ phần hướng dẫn của màn tập: bàn tay mực vẽ mẫu + băng lời dặn phía trên.
import { INK, inkText } from './ink.js';
import { cached, blit, measure } from './cache.js';
import { FONT } from '../engine/assets.js';
import { VIEW, uiK, safeCx } from './view.js';

const CYCLE = 2.4;   // 1 vòng bàn tay: hiện 0.3s · vẽ 1.2s · giữ 0.5s · mờ 0.4s
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** Bàn tay vẽ tay, đầu ngón trỏ tại (0, 0), nghiêng nhẹ. Vẽ 1 lần vào bộ đệm. */
function hand(c, x, y, a, press = 0) {
  const e = cached('hand', 70, 110, 14, 4, (g) => {
    g.translate(14, 4);
    g.lineJoin = g.lineCap = 'round';
    g.beginPath();   // ngón trỏ + lòng bàn tay + 3 ngón gập
    g.moveTo(-8, 8); g.quadraticCurveTo(-8, -3, 0, -3); g.quadraticCurveTo(8, -3, 8, 8);
    g.lineTo(8, 40);
    g.quadraticCurveTo(13, 34, 19, 38); g.quadraticCurveTo(24, 33, 30, 38); g.quadraticCurveTo(36, 34, 41, 41);
    g.quadraticCurveTo(46, 52, 42, 70); g.quadraticCurveTo(38, 92, 20, 96); g.quadraticCurveTo(0, 98, -6, 82);
    g.lineTo(-18, 58); g.quadraticCurveTo(-21, 50, -13, 50); g.lineTo(-8, 58);
    g.closePath();
    g.fillStyle = '#fff'; g.fill();
    g.lineWidth = 3.2; g.strokeStyle = INK; g.stroke();
    g.lineWidth = 2; g.beginPath();   // nếp ngón tay
    g.moveTo(19, 38); g.lineTo(20, 50); g.moveTo(30, 38); g.lineTo(31, 51); g.moveTo(-2, 24); g.lineTo(4, 24);
    g.stroke();
  });
  c.save();
  c.globalAlpha = a;
  c.translate(x, y); c.rotate(-0.35); c.scale(1 - press * 0.12, 1 - press * 0.12);
  blit(c, e, 0, 0);
  c.restore();
}

/** Các điểm cách đều trên nét mẫu + điểm tại tỉ lệ k (0..1). */
function along(path, k) {
  const L = [0];
  for (let i = 1; i < path.length; i++) L.push(L[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const target = L[L.length - 1] * k, pts = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (L[i] <= target) { pts.push(path[i]); continue; }
    const f = (target - L[i - 1]) / (L[i] - L[i - 1] || 1);
    pts.push([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * f, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * f]);
    break;
  }
  return pts;
}

/**
 * Bàn tay mẫu (tọa độ thế giới).
 * @param {CanvasRenderingContext2D} c
 * @param {{path?:number[][], tap?:number[], t:number}} d
 */
export function drawDemo(c, d) {
  const t = d.t % CYCLE;
  const fade = t < 0.3 ? t / 0.3 : t > 2.0 ? Math.max(0, 1 - (t - 2.0) / 0.4) : 1;
  if (d.tap) {   // chạm: bàn tay nhấn xuống, vòng tròn lan ra
    const [x, y] = d.tap, k = (t * 1.6) % 1, press = k < 0.25 ? k / 0.25 : Math.max(0, 1 - (k - 0.25) / 0.2);
    c.save();
    c.globalAlpha = (1 - k) * 0.9;
    c.strokeStyle = '#fff'; c.lineWidth = 6;
    c.beginPath(); c.arc(x, y, 18 + k * 40, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
    c.restore();
    hand(c, x + 4, y + 6 + press * 4, 1, press);
    return;
  }
  if (!d.path) return;
  const k = ease(Math.min(1, Math.max(0, (t - 0.3) / 1.2)));
  const pts = along(d.path, k), tip = pts[pts.length - 1];
  // vệt mẫu: nét đứt trắng viền mực, đậm dần khi vẽ xong
  c.save();
  c.globalAlpha = fade * 0.95;
  c.lineCap = c.lineJoin = 'round';
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
  c.setLineDash([]); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 15; c.stroke();
  c.setLineDash([16, 12]); c.strokeStyle = INK; c.lineWidth = 7; c.stroke();
  c.setLineDash([]);
  c.fillStyle = '#ff7a1a';   // chấm cam = điểm bắt đầu
  c.beginPath(); c.arc(d.path[0][0], d.path[0][1], 9, 0, Math.PI * 2); c.fill();
  c.restore();
  hand(c, tip[0], tip[1], fade, t < 0.3 ? 1 - t / 0.3 : 0);
}

/**
 * Băng lời dặn trên đầu màn hình (tọa độ khung nhìn).
 * @param {CanvasRenderingContext2D} c
 * @param {string} say @param {string} sub @param {number} a độ hiện (0..1)
 */
export function drawBanner(c, say, sub, a) {
  if (a <= 0) return;
  const s1 = 27, s2 = 17;
  const w = Math.max(measure(`bold ${s1}px ${FONT}`, say), measure(`bold ${s2}px ${FONT}`, sub || '')) + 70, h = sub ? 82 : 56;
  const e = cached(`banner|${say}|${sub}`, w + 10, h + 10, (w + 10) / 2, 0, (g) => {
    g.fillStyle = '#fbf7ec'; g.strokeStyle = INK; g.lineWidth = 4;
    g.beginPath(); g.moveTo(8, 6); g.lineTo(w, 3); g.lineTo(w + 3, h); g.lineTo(5, h + 4); g.closePath();   // giấy hơi méo
    g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,224,102,.8)'; g.fillRect(w / 2 - 30, 0, 60, 12);   // băng dính
    inkText(g, say, w / 2 + 4, 42, s1, 'center');
    if (sub) inkText(g, sub, w / 2 + 4, 71, s2, 'center', '#3a3ad0');
  });
  const k = uiK() * Math.min(1, (VIEW.sw - 40) / (w * uiK()));   // không tràn mép màn hẹp
  c.save();
  c.globalAlpha = a;
  c.translate(VIEW.sx + VIEW.sw / 2, VIEW.sy + 6 * uiK() + (1 - a) * -20); c.scale(k, k);
  blit(c, e, 0, 0);
  c.restore();
}
