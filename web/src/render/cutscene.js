// @ts-check
// Phim mở đầu (~12.5 giây), vẽ hoàn toàn bằng canvas từ sprite có sẵn -> không tốn dung lượng video.
// Kịch bản theo mốc thời gian (giây):
//   0.0  Đêm Halloween, Cún ôn bùa bên cuốn sách phép phát sáng
//   2.6  Đèn chớp, sấm -> Cún giật mình
//   3.0  Lũ ma ùa vào từ hai bên, "Hù!"
//   4.4  Ma trùm lao xuống, 5.9 cướp cuốn sách rồi bay mất
//   7.0  Cún buồn -> 8.3 rút đũa, nổi giận "Trả sách đây!!" (máy quay zoom vào)
//  10.8  Tiêu đề "Lấy lại sách phép!" -> sang màn tập
// Sửa kịch bản: chỉnh các mốc trong hàm draw() và CUES.
import { W, CX, GY } from '../core/config.js';
import { INK, inkText } from './ink.js';
import { cached, blit, measure } from './cache.js';
import { FONT } from '../engine/assets.js';
import { drawSprite } from './draw.js';
import { VIEW, uiK, edges } from './view.js';

export const DURATION = 12.5;
const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Tiến độ 0..1 trong khoảng [a, b]. */
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const lerp = (a, b, k) => a + (b - a) * k;
/** Hiện dần trong 0.3s đầu, mờ dần 0.3s cuối của khoảng [a, b]. */
const fadeIn = (t, a, b) => (t < a || t > b ? 0 : Math.min(1, (t - a) / 0.3, (b - t) / 0.3));

/** Âm thanh theo mốc: [giây, tên]. Session đổi tên thành tiếng thật. */
/** @type {[number, string][]} */
export const CUES = [[2.6, 'thunder'], [3.0, 'whoosh'], [5.9, 'grab'], [6.3, 'laugh'], [8.6, 'angry'], [10.8, 'title']];

const BOOK = { x: CX - 95, y: 300 };
// Lũ ma: [bên vào (-1 trái, 1 phải), x đích, y đích, cỡ]
const MINIONS = [[-1, 170, 170, 1], [-1, 300, 105, 0.85], [-1, 250, 255, 0.95], [1, 700, 115, 0.9], [1, 820, 205, 1.05], [1, 660, 255, 0.85]];
const BOSS_HOVER = [BOOK.x + 30, 175], BOSS_GRAB = [BOOK.x + 25, 238];

/** Vẽ 1 khung sprite, tâm tại (x, y). */
function frame(c, A, name, t, x, y, sc, flip) {
  const s = A.sprites[name];
  if (!s?.img) return;
  const f = ((t * s.fps) | 0) % s.n, w = s.w * sc, h = s.h * sc;
  c.save(); c.translate(x, y); if (flip) c.scale(-1, 1);
  c.drawImage(s.img, f * s.w, 0, s.w, s.h, -w / 2, -h / 2, w, h);
  c.restore();
}

/** Cuốn sách phép mở, phát sáng, viền mực. */
function book(c, x, y, t, glow) {
  c.save();
  c.translate(x, y); c.rotate(Math.sin(t * 1.7) * 0.07);
  if (glow > 0) {
    c.globalAlpha = 0.22 * glow; c.fillStyle = '#ffe066';
    c.beginPath(); c.arc(0, 8, 58 + Math.sin(t * 4) * 5, 0, TAU); c.fill();
    c.globalAlpha = 0.3 * glow; c.beginPath(); c.arc(0, 8, 38, 0, TAU); c.fill();
    c.globalAlpha = 1;
  }
  const e = cached('book', 110, 64, 55, 18, (g) => {
    g.translate(55, 18); g.lineJoin = g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = 3;
    g.fillStyle = '#7a3db8';   // bìa
    g.beginPath(); g.moveTo(-50, -2); g.lineTo(0, 8); g.lineTo(50, -2); g.lineTo(50, 30); g.lineTo(0, 42); g.lineTo(-50, 30); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fbf7ec';   // 2 trang
    for (const d of [-1, 1]) {
      g.beginPath(); g.moveTo(0, 2); g.quadraticCurveTo(d * 22, -14, d * 45, -8); g.lineTo(d * 45, 24); g.quadraticCurveTo(d * 22, 18, 0, 34); g.closePath(); g.fill(); g.stroke();
    }
    g.lineWidth = 2; g.globalAlpha = 0.6;   // dòng chữ
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-38, -2 + i * 7); g.lineTo(-10, 2 + i * 7); g.stroke(); }
    g.globalAlpha = 1; g.strokeStyle = '#d8430f'; g.lineWidth = 3;   // bùa ∧ trên trang phải
    g.beginPath(); g.moveTo(12, 20); g.lineTo(24, -2); g.lineTo(36, 20); g.stroke();
  });
  blit(c, e, 0, 0);
  c.restore();
  if (glow > 0) {   // đốm sáng bay lên
    c.fillStyle = '#fff6b0';
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.5 + i / 6) % 1;
      c.globalAlpha = glow * (1 - k);
      c.fillRect(x + Math.sin(i * 7.3 + t) * 34 - 2, y - 10 - k * 70, 4, 4);
    }
    c.globalAlpha = 1;
  }
}

/** Bong bóng thoại kiểu truyện tranh, đuôi chỉ xuống (tọa độ thế giới). */
function speech(c, txt, x, y, a, size = 26, tail = 0) {
  if (a <= 0) return;
  const w = measure(`bold ${size}px ${FONT}`, txt) + 36, h = size * 1.7;
  const e = cached(`sp|${txt}|${size}|${tail}`, w + 8, h + 30, (w + 8) / 2, h + 26, (g) => {
    g.translate(4, 4); g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 3.5; g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(14, 0); g.lineTo(w - 14, 0); g.quadraticCurveTo(w, 0, w, 14); g.lineTo(w, h - 14); g.quadraticCurveTo(w, h, w - 14, h);
    g.lineTo(w / 2 + 14 + tail, h); g.lineTo(w / 2 + tail * 1.6, h + 22); g.lineTo(w / 2 - 4 + tail, h);
    g.lineTo(14, h); g.quadraticCurveTo(0, h, 0, h - 14); g.lineTo(0, 14); g.quadraticCurveTo(0, 0, 14, 0);
    g.fill(); g.stroke();
    inkText(g, txt, w / 2, h / 2 + size * 0.38, size, 'center');
  });
  c.save(); c.globalAlpha = a;
  c.translate(x, y); c.scale(0.7 + 0.3 * Math.min(1, a * 1.5), 0.7 + 0.3 * Math.min(1, a * 1.5));
  blit(c, e, 0, 0);
  c.restore();
}

/** Khung lời dẫn trên giấy, phía dưới màn hình (tọa độ khung nhìn). */
function caption(c, txt, a, bar) {
  if (a <= 0) return;
  const size = 24, w = measure(`bold ${size}px ${FONT}`, txt) + 50, h = 50;
  const e = cached(`cap|${txt}`, w + 8, h + 8, (w + 8) / 2, h + 4, (g) => {
    g.fillStyle = '#fbf7ec'; g.strokeStyle = INK; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(6, 6); g.lineTo(w, 3); g.lineTo(w + 3, h); g.lineTo(3, h + 3); g.closePath(); g.fill(); g.stroke();
    inkText(g, txt, w / 2 + 4, h / 2 + 12, size, 'center');
  });
  const k = uiK() * Math.min(1, (VIEW.w - 30) / (w * uiK()));
  c.save(); c.globalAlpha = a;
  c.translate(VIEW.w / 2, VIEW.h - bar - 8 + (1 - a) * 12); c.scale(k, k);
  blit(c, e, 0, 0);
  c.restore();
}

/** Thẻ tiêu đề cuối phim. */
function titleCard(c, t) {
  const a = seg(t, 10.8, 11.2), k = uiK();
  if (a <= 0) return;
  c.save();
  c.globalAlpha = a * 0.55; c.fillStyle = '#070a20'; c.fillRect(0, 0, VIEW.w, VIEW.h);
  c.globalAlpha = a;
  c.translate(VIEW.w / 2, VIEW.h / 2 - 20); c.scale(k * (0.85 + 0.15 * ease(a)), k * (0.85 + 0.15 * ease(a))); c.rotate(-0.03);
  inkText(c, 'Lấy lại sách phép!', 0, 0, 64, 'center');
  const p = ease(seg(t, 11.1, 11.8));   // nét cọ gạch chân
  c.strokeStyle = '#d8430f'; c.lineWidth = 9; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-250, 24);
  for (let i = 1; i <= 20 * p; i++) c.lineTo(-250 + i * 25, 24 + Math.sin(i * 0.9) * 5);
  c.stroke();
  if (t > 11.5) { c.globalAlpha = a * seg(t, 11.5, 11.8); inkText(c, 'Trước tiên: học vẽ bùa nhé!', 0, 82, 28, 'center'); }
  c.restore();
}

/**
 * Vẽ 1 khung hình của phim tại thời điểm t.
 * @param {CanvasRenderingContext2D} c
 * @param {import('../engine/assets.js').Assets} A
 * @param {number} t giây
 * @param {boolean} low máy yếu: bỏ rung/nháy
 */
export function drawCutscene(c, A, t, low = false) {
  c.clearRect(0, 0, VIEW.w, VIEW.h);

  // ---- máy quay: zoom vào Cún lúc nổi giận ----
  const z = 1 + 0.22 * ease(seg(t, 8.3, 9.0)) * (1 - ease(seg(t, 10.5, 11.0)));
  const shake = low ? 0 : (t > 5.9 && t < 6.4 ? (6.4 - t) * 30 : t > 2.6 && t < 3.0 ? 8 : 0);
  c.save();
  c.translate(VIEW.ox, VIEW.oy);
  c.translate(CX, GY - 120); c.scale(z, z); c.translate(-CX, -(GY - 120));
  if (shake) c.translate((Math.sin(t * 90) * shake) | 0, (Math.cos(t * 77) * shake) | 0);

  // ---- Cún ----
  const anim = t < 2.6 ? ['idle', 0] : t < 5.9 ? ['alert', 2.6] : t < 7.0 ? ['hit', 5.9] : t < 8.3 ? ['lose', 7.0] : ['wave', 8.3];
  c.fillStyle = 'rgba(0,0,0,.28)';
  c.beginPath(); c.ellipse(CX, GY + 2, 55, 9, 0, 0, TAU); c.fill();
  drawSprite(c, A, /** @type {string} */ (anim[0]), t - /** @type {number} */ (anim[1]), CX, GY, t < 5.9);

  // ma vào/ra từ ngoài mép màn hình THẬT (màn càng rộng càng phải xa hơn)
  const E = edges(), BOSS_IN = [E.r + 200, E.t - 160], BOSS_OUT = [E.r + 240, E.t - 140];

  // ---- ma trùm (dùng để tính vị trí cuốn sách khi bị cướp) ----
  let bx = BOSS_IN[0], by = BOSS_IN[1];
  if (t >= 4.4 && t < 5.6) { const k = ease(seg(t, 4.4, 5.6)); bx = lerp(BOSS_IN[0], BOSS_HOVER[0], k); by = lerp(BOSS_IN[1], BOSS_HOVER[1], k) + Math.sin(k * Math.PI) * -40; }
  else if (t >= 5.6 && t < 5.9) { const k = seg(t, 5.6, 5.9) ** 2; bx = lerp(BOSS_HOVER[0], BOSS_GRAB[0], k); by = lerp(BOSS_HOVER[1], BOSS_GRAB[1], k); }
  else if (t >= 5.9) { const k = ease(seg(t, 6.1, 7.9)); bx = lerp(BOSS_GRAB[0], BOSS_OUT[0], k); by = lerp(BOSS_GRAB[1], BOSS_OUT[1], k) - Math.sin(k * Math.PI) * 60; }

  // ---- cuốn sách ----
  if (t < 5.9) book(c, BOOK.x, BOOK.y + Math.sin(t * 2) * 6, t, 1 - seg(t, 2.6, 3.2) * 0.6);
  else if (t < 8.0) book(c, bx - 18, by + 62, t * 3, 0.3);

  // ---- lũ ma ----
  MINIONS.forEach(([side, tx, ty, sc], i) => {
    const t0 = 3.0 + i * 0.16, t1 = 7.1 + i * 0.12;
    if (t < t0) return;
    const sx = side < 0 ? E.l - 170 : E.r + 170, sy = ty + 60;
    let x, y, vx;
    if (t < t1) {
      const k = ease(seg(t, t0, t0 + 0.9));
      x = lerp(sx, tx, k); y = lerp(sy, ty, k) + Math.sin(t * 3 + i) * 8 - Math.sin(k * Math.PI) * 50; vx = k < 1 ? -side : Math.cos(t * 1.5 + i);
    } else {
      const k = ease(seg(t, t1, t1 + 1.3));
      x = lerp(tx, BOSS_OUT[0], k); y = lerp(ty, BOSS_OUT[1] + i * 25, k); vx = 1;
    }
    frame(c, A, 'ghost', t + i * 0.13, x, y, sc, vx > 0);
    if ((i === 0 || i === 4) && t > 3.9 && t < 5.4) speech(c, 'Hù!', x, y - 50, fadeIn(t, 3.9, 5.4), 26, i ? 10 : -10);
  });
  if (t >= 4.4 && t < 8.0) frame(c, A, 'boss', t, bx, by, 1.55, t >= 5.9);
  if (t > 6.2 && t < 7.6) speech(c, 'Hô hô hô!', Math.min(bx, E.r - 90), by - 80, fadeIn(t, 6.2, 7.6), 28);
  if (t > 3.0 && t < 5.4) speech(c, '!?', CX + 45, GY - 185, fadeIn(t, 3.0, 4.2), 32);
  if (t > 8.6 && t < 10.7) speech(c, 'Trả sách đây!!', CX + 30, GY - 190, fadeIn(t, 8.6, 10.7), 34, -16);
  c.restore();

  // ---- lớp phủ: đêm tối, đèn chớp ----
  let dark = 0.18;
  if (t > 2.6 && t < 3.3 && !low) dark = Math.sin(t * 55) > 0 ? 0.62 : 0.05;
  if (t > 5.9 && t < 6.05) dark = -0.5;   // lóe sáng lúc cướp sách
  c.fillStyle = dark >= 0 ? `rgba(6,6,30,${dark})` : `rgba(255,255,235,${-dark})`;
  c.fillRect(0, 0, VIEW.w, VIEW.h);

  // ---- khung phim: 2 dải đen trên/dưới ----
  const bar = 44 * uiK() * ease(seg(t, 0, 0.5)) * (1 - ease(seg(t, DURATION - 0.6, DURATION)));
  c.fillStyle = '#05050f';
  c.fillRect(0, 0, VIEW.w, bar); c.fillRect(0, VIEW.h - bar, VIEW.w, bar);

  caption(c, 'Đêm Halloween, Cún đang ôn bùa trong thư viện…', fadeIn(t, 0.4, 2.5), bar);
  caption(c, 'Bỗng lũ ma ùa vào!', fadeIn(t, 3.0, 5.4), bar);
  caption(c, 'Ma trùm cướp mất cuốn sách phép!', fadeIn(t, 6.0, 8.1), bar);
  titleCard(c, t);
  if (t > DURATION - 0.4) { c.fillStyle = `rgba(7,10,32,${seg(t, DURATION - 0.4, DURATION)})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
}
