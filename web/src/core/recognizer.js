// @ts-check
// Nhận dạng nét vẽ -> tên bùa. Thuần hình học (port từ recognize_spell của bản Python),
// không phụ thuộc kích thước màn hình vì dùng tọa độ logic 960x540.

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Lấy lại mẫu nét thành n điểm cách đều -> tốc độ vẽ nhanh/chậm không ảnh hưởng kết quả. */
function resample(p, n = 32) {
  let total = 0;
  for (let i = 1; i < p.length; i++) total += dist(p[i], p[i - 1]);
  const step = total / (n - 1), out = [p[0]], q = p.slice();
  let acc = 0;
  for (let i = 1; i < q.length; i++) {
    const d = dist(q[i - 1], q[i]);
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const m = [q[i - 1][0] + t * (q[i][0] - q[i - 1][0]), q[i - 1][1] + t * (q[i][1] - q[i - 1][1])];
      out.push(m);
      q.splice(i, 0, m);
      acc = 0;
    } else acc += d;
  }
  while (out.length < n) out.push(p[p.length - 1]);
  return out;
}

const CLOSED = 0.25;    // đầu-cuối gần nhau (< 25% độ dài nét) -> vòng kín = tim
const STRAIGHT = 1.25;  // độ dài nét / khoảng cách đầu-cuối < 1.25 -> đường thẳng
const AXIS = 3;         // lệch trục gấp 3 lần -> ngang/dọc, còn lại là chéo
const TURN = 0.3;       // cos góc giữa 2 đoạn < 0.3 (≈ > 72°) -> một khúc gấp

/**
 * @param {number[][]} raw các điểm [x, y]
 * @returns {import('./config.js').Spell|null}
 */
export function recognize(raw) {
  if (raw.length < 6) return null;
  let len = 0;
  for (let i = 1; i < raw.length; i++) len += dist(raw[i], raw[i - 1]);
  if (len < 50) return null;

  const p = resample(raw), a = p[0], z = p[p.length - 1], d = dist(a, z);
  const xs = p.map((v) => v[0]), ys = p.map((v) => v[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);

  if (d < len * CLOSED && w > 30 && h > 30) return 'HEART';

  if (len / (d || 1) < STRAIGHT) {
    const dx = Math.abs(z[0] - a[0]), dy = Math.abs(z[1] - a[1]);
    if (dx > dy * AXIS) return 'HORIZONTAL';
    if (dy > dx * AXIS) return 'VERTICAL';
    return 'DIAGONAL';
  }

  let turns = 0, corner = a;   // đếm khúc gấp
  for (let i = 3; i < p.length - 3; i++) {
    const u = [p[i][0] - p[i - 3][0], p[i][1] - p[i - 3][1]];
    const v = [p[i + 3][0] - p[i][0], p[i + 3][1] - p[i][1]];
    const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]) || 1);
    if (cos < TURN) { turns++; corner = p[i]; i += 3; }
  }
  if (turns >= 2) return 'LIGHTNING';
  if (turns === 1) return corner[1] < (a[1] + z[1]) / 2 ? 'HAT_UP' : 'HAT_DOWN';
  return null;
}

/**
 * @typedef {{x0:number,y0:number,x1:number,y1:number,cx:number,cy:number,minX:number,maxX:number,minY:number,maxY:number}} StrokeGeo
 * Điểm đầu/cuối, tâm và khung của nét: Sim dùng để biết bùa quét trúng những con ma nào.
 * @param {number[][]} pts
 * @returns {StrokeGeo}
 */
export function strokeGeometry(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const a = pts[0], z = pts[pts.length - 1];
  return { x0: a[0], y0: a[1], x1: z[0], y1: z[1], cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, minX, maxX, minY, maxY };
}
