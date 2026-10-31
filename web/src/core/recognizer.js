// @ts-check
// Nhận dạng nét vẽ -> tên bùa. Thuần hình học, dùng tọa độ logic 960x540.
//
// Ngón tay rung hơn chuột rất nhiều, nhất là khi vẽ nhỏ trên điện thoại: nét thẳng thành răng cưa,
// tổng độ dài nét phồng lên, mỗi răng cưa trông như một "khúc gấp". Vì vậy nhận dạng đi qua 4 bước:
//   1. lấy lại mẫu cách đều          -> vẽ nhanh/chậm như nhau
//   2. làm mượt                       -> bớt rung tay (cảm ứng làm mượt mạnh hơn chuột)
//   3. rút gọn Ramer–Douglas–Peucker  -> chỉ giữ các khúc gấp LỚN so với kích thước nét
//   4. bỏ móc nhỏ ở đầu/cuối nét      -> ngón tay hay "quệt" lúc chạm xuống và lúc nhấc lên
// rồi mới đếm số khúc gấp: 0 = đường thẳng, 1 = chữ V, ≥2 = sét. Vòng kín = tim.

/** @typedef {number[]} Pt */
/**
 * @typedef {{touch?:boolean, around?:number[]}} RecOpts
 *   touch: nét vẽ bằng ngón tay (rung nhiều hơn chuột)
 *   around: tâm nhân vật [x, y] -> vòng kín BAO QUANH điểm này là lá chắn (SHIELD), không phải tim
 */

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pathLen = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += dist(p[i], p[i - 1]); return s; };

/** Lấy lại mẫu nét thành n điểm cách đều. @param {Pt[]} p */
function resample(p, n) {
  const step = pathLen(p) / (n - 1), out = [p[0]], q = p.slice();
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
  out.length = n;
  return out;
}

/** Làm mượt bằng nhân [1 2 1]/4, giữ nguyên 2 đầu. @param {Pt[]} p */
function smooth(p, passes) {
  for (let k = 0; k < passes; k++) {
    const q = p.map((v) => v.slice());
    for (let i = 1; i < p.length - 1; i++) {
      q[i][0] = (p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4;
      q[i][1] = (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4;
    }
    p = q;
  }
  return p;
}

/** Khoảng cách từ điểm p tới đoạn ab. */
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Ramer–Douglas–Peucker: giữ các điểm lệch khỏi đường nối > eps. @param {Pt[]} p */
function rdp(p, eps) {
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const stack = [[0, p.length - 1]];
  while (stack.length) {
    const [i, j] = /** @type {number[]} */ (stack.pop());
    let far = -1, best = eps;
    for (let k = i + 1; k < j; k++) { const d = segDist(p[k], p[i], p[j]); if (d > best) { best = d; far = k; } }
    if (far >= 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return p.filter((_, i) => keep[i]);
}

/** cos góc đổi hướng tại b (1 = đi thẳng, -1 = quay ngược). */
function turnCos(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1];
  return (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
}

const N = 64;           // số điểm sau khi lấy lại mẫu
const MIN_SIZE = 40;    // khung nét nhỏ hơn -> bỏ qua (chạm nhầm)
const CLOSED = 0.25;    // đầu-cuối gần nhau (< 25% độ dài nét) -> vòng kín = tim
const STRAIGHT = 1.2;   // độ dài nét (đã làm mượt) / khoảng cách đầu-cuối < 1.2 -> chắc chắn thẳng
const TURN = 0.3;       // cos góc đổi hướng < 0.3 (≈ > 72°) -> một khúc gấp thật
const HOOK = 0.18;      // đoạn đầu/cuối ngắn hơn 18% khung nét -> móc tay, bỏ

/** Thông số theo thiết bị: ngón tay rung hơn chuột -> làm mượt mạnh hơn, rút gọn thô hơn, nới góc ngang/dọc. */
const TUNE = {
  mouse: { passes: 1, eps: 0.09, axis: 3 },     // lệch trục gấp 3 lần (< ~18°) -> ngang/dọc
  touch: { passes: 3, eps: 0.13, axis: 2.5 },   // < ~22°
};

/**
 * Rút nét về khung xương: vài đỉnh nối bằng đoạn thẳng.
 * @param {Pt[]} p đã lấy mẫu + làm mượt
 * @param {number} size đường chéo khung nét
 */
function skeleton(p, size, eps) {
  let s = rdp(p, size * eps);
  const minSeg = size * HOOK;
  // bỏ móc ở 2 đầu
  while (s.length > 2 && dist(s[0], s[1]) < minSeg) s.shift();
  while (s.length > 2 && dist(s[s.length - 1], s[s.length - 2]) < minSeg) s.pop();
  // gộp 2 đỉnh quá gần nhau (góc bo tròn) và bỏ đỉnh gần như thẳng hàng
  for (let changed = true; changed && s.length > 2;) {
    changed = false;
    for (let i = 1; i < s.length - 1; i++) {
      if (turnCos(s[i - 1], s[i], s[i + 1]) >= TURN) { s.splice(i, 1); changed = true; break; }
      if (i < s.length - 2 && dist(s[i], s[i + 1]) < minSeg * 0.6) {
        s.splice(i, 2, [(s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2]);
        changed = true; break;
      }
    }
  }
  return s;
}

/**
 * @param {Pt[]} raw các điểm [x, y]
 * @param {RecOpts} [opts]
 * @returns {import('./config.js').Spell|null}
 */
export function recognize(raw, opts = {}) {
  if (raw.length < 6) return null;
  const T = opts.touch ? TUNE.touch : TUNE.mouse;
  const p = smooth(resample(raw, N), T.passes);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of p) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const w = maxX - minX, h = maxY - minY, size = Math.hypot(w, h);
  if (size < MIN_SIZE) return null;

  const len = pathLen(p), a = p[0], z = p[N - 1], d = dist(a, z);
  if (d < len * CLOSED && w > 30 && h > 30) return opts.around && encloses(p, opts.around[0], opts.around[1]) ? 'SHIELD' : 'HEART';

  const s = len / (d || 1) < STRAIGHT ? [a, z] : skeleton(p, size, T.eps);
  const corners = s.length - 2;

  if (corners <= 0) {
    const A = s[0], Z = s[s.length - 1];
    const dx = Math.abs(Z[0] - A[0]), dy = Math.abs(Z[1] - A[1]);
    if (dx > dy * T.axis) return 'HORIZONTAL';
    if (dy > dx * T.axis) return 'VERTICAL';
    return 'DIAGONAL';
  }
  if (corners >= 2) return 'LIGHTNING';
  return s[1][1] < (s[0][1] + s[2][1]) / 2 ? 'HAT_UP' : 'HAT_DOWN';
}

/**
 * Vòng nét có bao quanh điểm (x, y) không (nét được coi như khép kín).
 * Nới tay: tâm vòng gần điểm đó (< 45% cỡ vòng) cũng tính, vì vẽ tròn bằng ngón cái hay bị méo.
 * @param {Pt[]} p
 */
export function encloses(p, x, y) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (inside) return true;
  let sx = 0, sy = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [a, b] of p) { sx += a; sy += b; minX = Math.min(minX, a); maxX = Math.max(maxX, a); minY = Math.min(minY, b); maxY = Math.max(maxY, b); }
  return Math.hypot(sx / p.length - x, sy / p.length - y) < 0.45 * Math.max(maxX - minX, maxY - minY);
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
