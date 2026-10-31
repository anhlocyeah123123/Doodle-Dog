// @ts-check
// Phong cách bút mực xanh như nhân vật: nét chính + nét gạch phụ run tay + viền trắng như giấy dán.
import { FONT } from '../engine/assets.js';
import { cached, blit, measure } from './cache.js';

export const INK = '#1b1bb8';
const INK2 = 'rgba(40,40,200,.55)';
/** low = máy yếu: bỏ nét phụ, bỏ hiệu ứng trang trí. */
export const ink = { low: false };

const jitter = (i, k) => Math.sin(i * 12.9898 + k * 78.233) * 1.8;   // rung cố định theo chỉ số điểm -> không nhấp nháy

/** Một đường đi qua mọi điểm, lệch nhẹ theo jitter. */
function polyline(c, pts, off, k) {
  c.beginPath();
  c.moveTo(pts[0][0] + off * jitter(0, k), pts[0][1] + off * jitter(0, k + 1));
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] + off * jitter(i, k), pts[i][1] + off * jitter(i, k + 1));
}

/**
 * Nét người chơi đang vẽ: 3 lệnh vẽ cho cả nét (thay vì 3 lệnh cho MỖI đoạn).
 * k = hệ số độ dày: trên điện thoại khung game nhỏ nên nét 10px logic chỉ còn ~5px thật, mảnh và khó nhìn
 * dưới ngón tay -> lớp vẽ truyền k > 1 để nét luôn dày ít nhất ~7px trên màn hình (xem strokeK ở draw.js).
 */
export function inkStroke(c, pts, alpha = 1, k = 1) {
  if (pts.length < 2 || alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  c.lineCap = c.lineJoin = 'round';
  polyline(c, pts, 0, 0);
  c.strokeStyle = 'rgba(255,255,255,.92)'; c.lineWidth = 16 * k; c.stroke();
  c.strokeStyle = INK; c.lineWidth = 10 * k; c.stroke();
  if (!ink.low) { polyline(c, pts, 1.6 * k, 3); c.strokeStyle = INK2; c.lineWidth = 4 * k; c.stroke(); }
  c.restore();
}

const font = (size) => `bold ${size}px ${FONT}`;

/** Chữ mực xanh viền trắng, có đệm. align: 'left' | 'center' | 'right'; y là đường chân chữ. */
export function inkText(c, str, x, y, size, align = 'left', color = INK) {
  const f = font(size);
  const pad = size * 0.3;
  const w = measure(f, str) + pad * 2;
  const h = size * 1.5;
  const base = size * 1.1;
  const ox = align === 'center' ? w / 2 : align === 'right' ? w - pad : pad;
  const e = cached(`t|${size}|${color}|${str}`, w, h, ox, base, (g) => {
    g.font = f; g.textAlign = 'left'; g.lineJoin = 'round';
    g.lineWidth = size / 4; g.strokeStyle = '#fff'; g.strokeText(str, pad, base);
    g.fillStyle = color; g.fillText(str, pad, base);
  });
  blit(c, e, x, y);
  return w - pad * 2;
}

/** Trái tim viền mực. */
export function inkHeart(c, x, y, s, fill) {
  const e = cached(`h|${s}|${fill}`, s * 2.4, s * 2, s * 1.2, s * 1.1, (g) => {
    const cx = s * 1.2, cy = s * 1.1;
    g.beginPath();
    g.moveTo(cx, cy + s * 0.35);
    g.bezierCurveTo(cx - s, cy - s * 0.4, cx - s * 0.5, cy - s, cx, cy - s * 0.35);
    g.bezierCurveTo(cx + s * 0.5, cy - s, cx + s, cy - s * 0.4, cx, cy + s * 0.35);
    g.lineWidth = 3; g.strokeStyle = INK; g.fillStyle = fill;
    if (fill) g.fill();
    g.stroke();
  });
  blit(c, e, x, y);
}

/** Bong bóng tròn chứa ký hiệu bùa (trên đầu ma). */
export function bubble(c, x, y, r, ch, col = INK, fill = '#fff') {
  const e = cached(`b|${r}|${ch}|${col}|${fill}`, r * 2 + 6, r * 2 + 6, r + 3, r + 3, (g) => {
    const m = r + 3;
    g.fillStyle = fill; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = col; g.font = `bold ${(r * 1.3) | 0}px sans-serif`; g.textAlign = 'center';
    g.fillText(ch, m, m + r * 0.45);
  });
  blit(c, e, x, y);
}

/** Đường zigzag ngẫu nhiên cho tia sét. */
export function bolt(x0, y0, x1, y1) {
  const p = [[x0, y0]], n = 7;
  for (let i = 1; i < n; i++) p.push([x0 + ((x1 - x0) * i) / n + (Math.random() - 0.5) * 50, y0 + ((y1 - y0) * i) / n]);
  p.push([x1, y1]);
  return p;
}
