// @ts-check
// Đoạn kết khi hạ boss cuối: "phép tối thượng" của Cún. Vẽ hoàn toàn bằng canvas.
// Nhịp hình khớp với tiếng assets/audio/ult.mp3 (7.9 giây, xem tools/build_assets.py):
//   0.15 cú đập  -> THỜI GIAN NGƯNG ĐỌNG: sóng chấn động, cảnh ngoài xám lại (CSS .timestop), boss đóng băng;
//                   lãnh địa đen loang ra từ Cún, BÊN TRONG đã có sẵn sao lấp lánh
//   1.7          lãnh địa phủ kín màn hình, cảnh ngoài hết xám (TIMESTOP_END)
//   2.6–4.45 riser -> sao xoáy, hội tụ thành MỘT ĐIỂM SÁNG TRẮNG trước đầu Cún, hạt sáng bị hút vào
//   4.55 tiếng vút -> Cún bắn phép (animation làm phép ngang): quả cầu sáng lao đi kéo theo tia + tia điện,
//                   màn hình chớp + giật như SẤM SÉT
//   6.05 tiếng nổ  -> quả cầu chạm boss: BÙM trắng xóa, rung mạnh (OUTRO_HIT: Session gọi sim.finishBoss)
//   6.05+          khung hình lúc trúng được đóng băng, trắng tan dần -> tối dần; 7.85 hiện bảng chiến thắng
// Đổi âm thanh khác: chỉnh các mốc trong T bên dưới cho khớp.
import { CX, GY } from '../core/config.js';
import { drawSprite, blitSprite } from './draw.js';
import { VIEW, edges } from './view.js';

/** Mốc thời gian (giây) — khớp với ult.mp3. */
const T = {
  stop: 0.15,     // cú đập: thời gian ngưng, lãnh địa bắt đầu loang
  domain: 1.7,    // lãnh địa phủ kín
  conv0: 2.6,     // sao bắt đầu hội tụ (riser)
  conv1: 4.45,    // sao hội tụ xong
  fire: 4.55,     // tiếng vút: bắn
  hit: 6.05,      // tiếng nổ: trúng boss
  dur: 7.85,      // âm thanh hết: bảng chiến thắng
};
export const TIMESTOP_END = T.domain;
export const OUTRO_FIRE = T.fire;
export const OUTRO_HIT = T.hit;
export const OUTRO_DUR = T.dur;
const FREEZE = T.hit - 0.04;      // khung hình giữ lại sau tiếng nổ (quả cầu vừa chạm boss)
const TAU = Math.PI * 2;

/** Âm thanh theo mốc. 'ult' = cả đoạn ult.mp3; Session tự dùng tiếng dự phòng nếu chưa tải được. @type {[number, string][]} */
export const OUTRO_CUES = [[0, 'ult']];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeIn = (k) => k * k * k;
const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

// ---- sao (tọa độ chuẩn hóa theo khung nhìn) + hạt bị hút vào điểm sáng: tạo 1 lần ----
let rs = 20261031;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
const STARS = Array.from({ length: 170 }, () => ({
  u: rnd(), v: rnd(), s: 0.8 + rnd() ** 3 * 3.2, ph: rnd() * TAU, d: rnd(),
  col: ['#ffffff', '#fff6c8', '#c9e8ff', '#e6d4ff'][(rnd() * 4) | 0],
}));
const MOTES = Array.from({ length: 46 }, () => ({ a: rnd() * TAU, r: 60 + rnd() * 110, sp: 0.7 + rnd() * 0.9, off: rnd() }));
// chớp sấm trong lúc quả cầu bay: [giây, độ sáng]
const THUNDER = [[0, 0.95], [0.14, 0.45], [0.36, 0.8], [0.62, 0.4], [0.9, 0.7], [1.2, 0.45]].map(([d, p]) => [T.fire + d, p]);

/** Vị trí điểm sáng: trước đầu Cún, về phía boss. */
const orbAt = (o) => [CX + o.dir * 78, GY - 138];

/** Độ giật màn hình kiểu sấm: giật mạnh đúng lúc chớp rồi tắt nhanh. */
function thunderShake(t) {
  let k = 0;
  for (const [at, p] of THUNDER) if (t >= at && t < at + 0.35) k = Math.max(k, p * (1 - (t - at) / 0.35));
  return k;
}

/** Vua Mực: ĐÓNG BĂNG (1 khung hình cố định) cho tới khi trúng tia thì rung + ửng trắng. */
function boss(c, A, o, t) {
  const hit = t > T.hit - 0.3 ? Math.min(1, (t - T.hit + 0.3) * 3) : 0;   // sắp trúng: rung + ửng trắng
  const jx = hit ? Math.sin(t * 90) * 7 * hit : 0, jy = hit ? Math.cos(t * 70) * 5 * hit : 0;
  const x = o.bx + jx, y = o.by + jy;
  const king = A.sprites.king_laugh?.img ? (hit ? 'king_hit' : 'king_laugh') : null;
  const paint = () => {
    if (king) blitSprite(c, A, king, hit ? ((t * 14) | 0) % 2 : 1, x, y, 1, false, 'c');
    else {   // chưa tải sprite Vua Mực: boss cũ
      const s = A.sprites.boss;
      if (!s?.img) return;
      const f = hit ? ((t * 14) | 0) % s.n : 2, sc = 2.4, w = s.w * sc, h = s.h * sc;
      c.drawImage(s.img, f * s.w, 0, s.w, s.h, x - w / 2, y - h / 2, w, h);
    }
  };
  paint();
  if (hit) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6 * hit;
    paint();
    c.restore();
  }
}

/** Điểm sáng trắng + hạt sáng bị hút vào. p = độ mạnh 0..1 (lớn dần), flare = chói thêm trước khi bắn. */
function lightPoint(c, x, y, t, p, flare, low) {
  if (p <= 0) return;
  const glow = (34 + 50 * p + 50 * flare) * (1 + 0.08 * Math.sin(t * 30));
  const g = c.createRadialGradient(x, y, 0, x, y, glow);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,.85)');
  g.addColorStop(0.45, 'rgba(210,235,255,.28)');
  g.addColorStop(1, 'rgba(180,200,255,0)');
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, glow, 0, TAU); c.fill();
  // tia chữ thập lấp lánh
  c.save();
  c.translate(x, y); c.rotate(t * 0.8);
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineCap = 'round';
  const L = (26 + 46 * p + 60 * flare) * (0.85 + 0.15 * Math.sin(t * 45));
  for (let i = 0; i < 4; i++) {
    c.rotate(Math.PI / 2);
    c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(L, 0); c.stroke();
  }
  c.rotate(Math.PI / 4); c.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(L * 0.45, 0); c.stroke(); }
  c.restore();
  // hạt sáng bị hút vào tâm (vòng lặp liên tục)
  const n = low ? 18 : MOTES.length;
  c.fillStyle = '#fff';
  for (let i = 0; i < n; i++) {
    const m = MOTES[i], k = (t * m.sp + m.off) % 1, r = m.r * (1 - easeIn(k)) * (0.6 + 0.4 * p), a = m.a + k * 2.2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r, sz = 1.5 + 2.5 * k;
    c.globalAlpha = Math.min(1, k * 3) * p;
    c.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  c.globalAlpha = 1;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 5 + 6 * p + 4 * flare, 0, TAU); c.fill();
}

/** Tia điện ngoằn ngoèo giữa a và b, đổi hình mỗi 60ms. */
function zap(c, ax, ay, bx, by, t, seed, spread) {
  const step = Math.floor(t / 0.06), n = 10;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  c.beginPath(); c.moveTo(ax, ay);
  for (let i = 1; i < n; i++) {
    const k = i / n, off = (hash(step * 31 + i * 7 + seed) - 0.5) * spread * Math.sin(k * Math.PI);
    c.lineTo(ax + dx * k + nx * off, ay + dy * k + ny * off);
  }
  c.lineTo(bx, by);
}

/** Quả cầu phép lao đi, kéo theo tia trắng + tia điện. k = quãng đường đã bay (0..1, 1 = trúng boss). */
function beam(c, ax, ay, bx, by, t, k, low) {
  if (k <= 0) return;
  const ex = ax + (bx - ax) * k, ey = ay + (by - ay) * k, w = 26 + Math.sin(t * 60) * 5;
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [col, lw, al] of [['#8fb8ff', w * 2.2, 0.28], ['#d8ecff', w * 1.4, 0.6], ['#ffffff', w * 0.7, 1]]) {
    c.globalAlpha = /** @type {number} */ (al); c.strokeStyle = /** @type {string} */ (col); c.lineWidth = /** @type {number} */ (lw);
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(ex, ey); c.stroke();
  }
  c.globalAlpha = 1;
  if (!low) {   // tia điện ngoằn ngoèo bám quanh tia chính
    for (let j = 0; j < 3; j++) {
      zap(c, ax, ay, ex, ey, t, j * 101, 70 + j * 30);
      c.strokeStyle = j ? 'rgba(200,225,255,.75)' : '#fff'; c.lineWidth = j ? 2 : 3.5; c.stroke();
    }
  }
  if (k < 1) {   // đầu quả cầu: sáng chói, có vầng sáng
    const g = c.createRadialGradient(ex, ey, 0, ex, ey, 60);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(220,238,255,.6)'); g.addColorStop(1, 'rgba(160,190,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(ex, ey, 60, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, 16 + Math.sin(t * 50) * 3, 0, TAU); c.fill();
  }
  if (k >= 1) {   // điểm trúng: tóe sáng
    c.strokeStyle = '#fff'; c.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + t * 8, l = 55 + 40 * Math.abs(Math.sin(t * 30 + i * 1.7));
      c.beginPath(); c.moveTo(bx + Math.cos(a) * 22, by + Math.sin(a) * 22); c.lineTo(bx + Math.cos(a) * l, by + Math.sin(a) * l); c.stroke();
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by, 36 + Math.sin(t * 50) * 6, 0, TAU); c.fill();
  }
  c.restore();
}

/** Cảnh tại thời điểm t (không gồm lớp chớp trắng). */
function scene(c, A, o, t, low) {
  const E = edges(), cx = CX, cy = GY - 80;
  const maxR = Math.hypot(Math.max(cx - E.l, E.r - cx), Math.max(cy - E.t, E.b - cy)) + 40;
  const R = maxR * easeOut(seg(t, T.stop, T.domain));
  const [ox, oy] = orbAt(o);

  // sóng chấn động lúc thời gian ngưng lại (2 vòng)
  for (const [a, b, wd] of [[T.stop, T.stop + 0.55, 5], [T.stop + 0.12, T.stop + 0.9, 2.5]]) {
    const k = seg(t, a, b);
    if (k > 0 && k < 1) {
      c.globalAlpha = 1 - k; c.strokeStyle = '#fff'; c.lineWidth = wd;
      c.beginPath(); c.arc(cx, cy, 30 + k * maxR * 0.9, 0, TAU); c.stroke();
      c.globalAlpha = 1;
    }
  }

  // lãnh địa đen + sao BÊN TRONG ngay khi loang ra
  if (R > 0) {
    c.fillStyle = '#04040e';
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
    if (t < T.domain + 0.1) { c.lineWidth = 10; c.strokeStyle = 'rgba(160,170,255,.55)'; c.stroke(); c.lineWidth = 2.5; c.strokeStyle = '#fff'; c.stroke(); }
    if (t < T.conv1 + 0.2) {
      c.save();
      c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
      const n = low ? 70 : STARS.length;
      for (let i = 0; i < n; i++) {
        const st = STARS[i];
        const sx = E.l + st.u * (E.r - E.l), sy = E.t + st.v * (E.b - E.t);
        const e = easeIn(seg(t, T.conv0 + st.d * 0.7, T.conv1));
        if (e >= 1) continue;
        const r0 = Math.hypot(sx - ox, sy - oy), a0 = Math.atan2(sy - oy, sx - ox), turn = 4 + st.d * 3;
        const r = r0 * (1 - e), a = a0 + e * turn, x = ox + Math.cos(a) * r, y = oy + Math.sin(a) * r;
        const tw = 0.55 + 0.45 * Math.sin(t * 5 + st.ph);
        c.globalAlpha = e > 0 ? 1 : tw;
        if (e > 0.02) {   // đang hội tụ: vệt sáng trắng
          const e2 = Math.max(0, e - 0.08), r2 = r0 * (1 - e2), a2 = a0 + e2 * turn;
          c.strokeStyle = '#fff'; c.lineWidth = st.s * 1.2; c.lineCap = 'round';
          c.beginPath(); c.moveTo(ox + Math.cos(a2) * r2, oy + Math.sin(a2) * r2); c.lineTo(x, y); c.stroke();
        } else if (st.s > 2.6 && !low) {
          c.strokeStyle = st.col; c.lineWidth = 1.5;
          const l = st.s * 2.2 * tw;
          c.beginPath(); c.moveTo(x - l, y); c.lineTo(x + l, y); c.moveTo(x, y - l); c.lineTo(x, y + l); c.stroke();
        } else {
          c.fillStyle = st.col; c.fillRect(x - st.s / 2, y - st.s / 2, st.s, st.s);
        }
      }
      c.restore();
      c.globalAlpha = 1;
    }
  }

  boss(c, A, o, t);

  // Cún: niệm phép CHẬM lúc thời gian ngưng (0.3x), rồi bình thường -> bắn bằng cast_h
  const firing = t >= OUTRO_FIRE;
  const castT = t < T.domain ? t * 0.3 : T.domain * 0.3 + (t - T.domain);
  if (t > T.conv0 && !firing && !low) {   // hào quang khi tụ phép
    c.strokeStyle = `rgba(255,255,255,${0.15 + 0.15 * Math.sin(t * 20)})`; c.lineWidth = 5;
    c.beginPath(); c.ellipse(CX, GY - 55, 72, 82, 0, 0, TAU); c.stroke();
  }
  drawSprite(c, A, firing ? 'cast_h' : 'wave', firing ? t - OUTRO_FIRE : castT, CX, GY, o.dir < 0);

  // điểm sáng: thành hình khi sao hội tụ, chói nhất ngay trước khi bắn, co lại khi tia bắn ra
  // điểm sáng: thành hình khi sao hội tụ, chói nhất ngay trước khi bắn, tắt khi quả cầu đã bay đi
  const p = ease(seg(t, T.conv0 + 0.2, T.conv1)) * (1 - seg(t, T.fire, T.fire + 0.35));
  const flare = seg(t, T.conv1 - 0.4, T.fire) * (0.7 + 0.3 * Math.sin(t * 70)) * (firing ? 0 : 1);
  lightPoint(c, ox, oy, t, p, flare, low);
  // quả cầu: vọt nhanh lúc đầu rồi lao thẳng vào boss đúng tiếng nổ
  const fly = seg(t, T.fire, T.hit);
  beam(c, ox, oy, o.bx, o.by, t, t >= T.hit ? 1 : 0.18 * easeOut(Math.min(1, fly * 5)) + 0.82 * easeIn(fly), low);
}

/**
 * @param {CanvasRenderingContext2D} c
 * @param {import('../engine/assets.js').Assets} A
 * @param {{t:number, bx:number, by:number, dir:number}} o
 * @param {boolean} low máy yếu
 */
export function drawOutro(c, A, o, low = false) {
  const t = o.t, frozen = t >= OUTRO_HIT;
  const ts = frozen ? FREEZE : t;
  c.clearRect(0, 0, VIEW.w, VIEW.h);
  c.save();
  c.translate(VIEW.ox, VIEW.oy);
  // giật màn hình: khựng nhẹ lúc thời gian ngưng, giật như sấm lúc bắn, rung lớn lúc nổ
  let sh = t > T.stop && t < T.stop + 0.25 ? (T.stop + 0.25 - t) * 40 : thunderShake(t) * 22;
  if (frozen && t < OUTRO_HIT + 0.6) sh = Math.max(sh, (OUTRO_HIT + 0.6 - t) * 36);
  if (low) sh *= 0.4;
  if (sh > 0.3) {
    const j = Math.floor(t / 0.035);   // giật cục (không mượt) như sấm
    c.translate((hash(j) - 0.5) * 2 * sh, (hash(j + 99) - 0.5) * 2 * sh);
  }
  scene(c, A, o, ts, low);
  c.restore();

  // chớp sấm khi bắn, sáng dần trước nổ, trắng xóa lúc nổ rồi tan dần, sau đó tối lại
  let white = 0;
  if (!frozen) {
    for (const [at, p] of THUNDER) if (t >= at && t < at + 0.07) white = Math.max(white, p * (1 - (t - at) / 0.07) * 0.75);
    if (t > T.hit - 0.3) white = Math.max(white, seg(t, T.hit - 0.3, T.hit) ** 2);
  } else white = 1 - seg(t, OUTRO_HIT + 0.1, OUTRO_HIT + 0.9);
  if (white > 0) { c.fillStyle = `rgba(255,255,248,${white})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (frozen) { c.fillStyle = `rgba(4,4,14,${0.45 * seg(t, OUTRO_HIT + 0.4, OUTRO_DUR + 0.3)})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
}
