// @ts-check
// Phim mở đầu "Cuốn Sách Mực" (~14 giây), vẽ hoàn toàn bằng canvas từ sprite -> không tốn dung lượng video.
// Kịch bản theo mốc thời gian (giây):
//   0.0  Toàn cảnh Học viện Bút Mực trong đêm Halloween (ảnh lâu đài, máy quay đẩy chậm)
//   2.6  Thư viện: Cún ôn bùa bên Sách Phép Gốc, Cô Cú dặn dò
//   5.3  Sấm! Tắt đèn: tối đen chỉ còn đôi mắt Cún + "??" (học từ bản Doodle)
//   6.6  Đèn sáng: Vua Mực đã ở đó, cười "Hô hô hô!" -> 7.9 cướp sách
//   8.6  Xé sách: 5 trang bay ra 5 hướng · 10.2 bay mất
//  11.0  Cô Cú: "Phải lấy lại từng trang!" · Cún: "Để con!!"
//  12.4  Tiêu đề -> sang màn tập
// Sửa kịch bản: chỉnh các mốc trong drawCutscene() và CUES.
import { CX, GY } from '../core/config.js';
import { INK, inkText } from './ink.js';
import { cached, blit, measure } from './cache.js';
import { FONT } from '../engine/assets.js';
import { drawSprite, drawCentered, blitSprite } from './draw.js';
import { VIEW, uiK, edges, safeEdges, safeCx } from './view.js';

export const DURATION = 14;
const TAU = Math.PI * 2;
export const clamp01 = (v) => Math.max(0, Math.min(1, v));
/** Tiến độ 0..1 trong khoảng [a, b]. */
export const seg = (t, a, b) => clamp01((t - a) / (b - a));
export const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
export const lerp = (a, b, k) => a + (b - a) * k;
/** Hiện dần trong 0.3s đầu, mờ dần 0.3s cuối của khoảng [a, b]. */
export const fadeIn = (t, a, b) => (t < a || t > b ? 0 : Math.min(1, (t - a) / 0.3, (b - t) / 0.3));

/** Âm thanh theo mốc: [giây, tên]. Session đổi tên thành tiếng thật. */
/** @type {[number, string][]} */
export const CUES = [[5.3, 'thunder'], [6.7, 'laugh'], [8.0, 'grab'], [9.4, 'rip'], [10.2, 'whoosh'], [11.7, 'angry'], [12.4, 'title']];

const BOOK = { x: CX - 95, y: 300 };
const OWL_X = CX - 270;
/** 5 trang bay ra 5 hướng: [sprite, hướng x, hướng y] @type {[string, number, number][]} */
const PAGES = [['page_bolt', -1, -0.6], ['page_shield', -0.7, -1], ['page_hourglass', 0.15, -1.1], ['page_blank', 0.8, -0.9], ['page_star', 1, -0.4]];

/** Cuốn sách phép mở, phát sáng, viền mực. */
export function book(c, x, y, t, glow, sc = 1) {
  c.save();
  c.translate(x, y); c.scale(sc, sc); c.rotate(Math.sin(t * 1.7) * 0.07);
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
      c.fillRect(x + Math.sin(i * 7.3 + t) * 34 * sc - 2, y - 10 - k * 70 * sc, 4, 4);
    }
    c.globalAlpha = 1;
  }
}

/** Bong bóng thoại kiểu truyện tranh, đuôi chỉ xuống (tọa độ thế giới). */
export function speech(c, txt, x, y, a, size = 26, tail = 0) {
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
  // kẹp vào trong khung nhìn để bóng thoại không bị cắt ở mép
  const E = safeEdges(), half = (w + 8) / 2;
  x = Math.max(E.l + half + 6, Math.min(E.r - half - 6, x));
  y = Math.max(y, E.t + h + 30 + 48 * uiK());   // chừa chỗ nút Bỏ qua / tạm dừng ở mép trên
  c.save(); c.globalAlpha = a;
  c.translate(x, y); c.scale(0.7 + 0.3 * Math.min(1, a * 1.5), 0.7 + 0.3 * Math.min(1, a * 1.5));
  blit(c, e, 0, 0);
  c.restore();
}

/** Khung lời dẫn trên giấy, phía dưới màn hình (tọa độ khung nhìn). */
export function caption(c, txt, a, bar = 0) {
  if (a <= 0) return;
  const size = 24, w = measure(`bold ${size}px ${FONT}`, txt) + 50, h = 50;
  const e = cached(`cap|${txt}`, w + 8, h + 8, (w + 8) / 2, h + 4, (g) => {
    g.fillStyle = '#fbf7ec'; g.strokeStyle = INK; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(6, 6); g.lineTo(w, 3); g.lineTo(w + 3, h); g.lineTo(3, h + 3); g.closePath(); g.fill(); g.stroke();
    inkText(g, txt, w / 2 + 4, h / 2 + 12, size, 'center');
  });
  const k = uiK() * Math.min(1, (VIEW.sw - 30) / (w * uiK()));
  c.save(); c.globalAlpha = a;
  c.translate(safeCx(), Math.min(VIEW.h - bar, VIEW.sy + VIEW.sh) - 8 + (1 - a) * 12); c.scale(k, k);
  blit(c, e, 0, 0);
  c.restore();
}

/** Chữ to giữa màn hình kèm nét cọ gạch chân (tọa độ khung nhìn). a: độ hiện, p: tiến độ nét cọ */
export function bigTitle(c, txt, sub, a, p, y = VIEW.sy + VIEW.sh / 2 - 20) {
  if (a <= 0) return;
  const k = uiK();
  c.save();
  c.globalAlpha = a;
  c.translate(safeCx(), y); c.scale(k * (0.85 + 0.15 * ease(a)), k * (0.85 + 0.15 * ease(a))); c.rotate(-0.03);
  inkText(c, txt, 0, 0, 60, 'center');
  const L = measure(`bold 60px ${FONT}`, txt) / 2 + 10;
  c.strokeStyle = '#d8430f'; c.lineWidth = 9; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-L, 24);
  for (let i = 1; i <= 20 * p; i++) c.lineTo(-L + (i * 2 * L) / 20, 24 + Math.sin(i * 0.9) * 5);
  c.stroke();
  if (sub) inkText(c, sub, 0, 80, 28, 'center');
  c.restore();
}

/** Dải đen điện ảnh trên/dưới; trả về độ cao dải. */
export function bars(c, t, dur) {
  const bar = 44 * uiK() * ease(seg(t, 0, 0.5)) * (1 - ease(seg(t, dur - 0.6, dur)));
  c.fillStyle = '#05050f';
  c.fillRect(0, 0, VIEW.w, bar); c.fillRect(0, VIEW.h - bar, VIEW.w, bar);
  return bar;
}

/** Ảnh phủ kín khung nhìn (kiểu background-size: cover), có thể đẩy máy quay vào (zoom). */
export function cover(c, img, zoom = 1, alpha = 1) {
  if (!img || alpha <= 0) return;
  const s = Math.max(VIEW.w / img.width, VIEW.h / img.height) * zoom;
  c.globalAlpha = alpha;
  c.drawImage(img, (VIEW.w - img.width * s) / 2, (VIEW.h - img.height * s) / 2, img.width * s, img.height * s);
  c.globalAlpha = 1;
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
  const E = edges();

  // ---- máy quay: zoom vào Cún lúc nổi giận ----
  const z = 1 + 0.18 * ease(seg(t, 11.2, 11.8)) * (1 - ease(seg(t, 12.2, 12.6)));
  const shake = low ? 0 : (t > 9.4 && t < 9.9 ? (9.9 - t) * 30 : t > 5.3 && t < 5.6 ? 8 : 0);
  c.save();
  c.translate(VIEW.ox, VIEW.oy);
  c.translate(CX, GY - 120); c.scale(z, z); c.translate(-CX, -(GY - 120));
  if (shake) c.translate((Math.sin(t * 90) * shake) | 0, (Math.cos(t * 77) * shake) | 0);

  // ---- Cô Cú ----
  const owl = t < 3.4 ? 'owl_idle' : t < 5.3 ? 'owl_talk' : t < 11.0 ? 'owl_panic' : t < 12.0 ? 'owl_point' : 'owl_talk';
  drawSprite(c, A, owl, t, OWL_X, GY, false);
  if (t > 3.5 && t < 5.2) speech(c, 'Ôn bài chăm chỉ nhé, Cún!', OWL_X + 40, GY - 150, fadeIn(t, 3.5, 5.2), 22, -20);
  if (t > 11.0 && t < 12.4) speech(c, 'Phải lấy lại từng trang!', OWL_X + 50, GY - 140, fadeIn(t, 11.0, 12.4), 24, -24);

  // ---- Cún ----
  const anim = t < 5.3 ? ['idle', 0] : t < 7.9 ? ['alert', 5.3] : t < 9.0 ? ['hit', 7.9] : t < 11.4 ? ['lose', 9.0] : ['wave', 11.4];
  c.fillStyle = 'rgba(0,0,0,.28)';
  c.beginPath(); c.ellipse(CX, GY + 2, 55, 9, 0, 0, TAU); c.fill();
  drawSprite(c, A, /** @type {string} */ (anim[0]), t - /** @type {number} */ (anim[1]), CX, GY, t < 7.9);
  if (t > 6.7 && t < 7.8) speech(c, '!?', CX + 45, GY - 185, fadeIn(t, 6.7, 7.8), 32);
  if (t > 11.6 && t < 12.6) speech(c, 'Để con!!', CX + 30, GY - 190, fadeIn(t, 11.6, 12.6), 34, -16);

  // ---- Vua Mực ----
  const HOVER = [BOOK.x + 40, 175], GRAB = [BOOK.x + 20, 230], RIP = [CX + 150, 170], OUT = [E.r + 260, E.t - 120];
  let kx = HOVER[0], ky = HOVER[1], kAnim = 'king_laugh', kt = t;
  if (t < 7.9) { kx = HOVER[0]; ky = HOVER[1] + Math.sin(t * 2) * 6; }
  else if (t < 8.6) { const k = ease(seg(t, 7.9, 8.3)); kx = lerp(HOVER[0], GRAB[0], k); ky = lerp(HOVER[1], GRAB[1], k); kAnim = 'king_carry'; }
  else if (t < 10.2) { const k = ease(seg(t, 8.6, 9.1)); kx = lerp(GRAB[0], RIP[0], k); ky = lerp(GRAB[1], RIP[1], k); kAnim = 'king_rip'; kt = t - 8.6; }
  else { const k = ease(seg(t, 10.2, 11.2)); kx = lerp(RIP[0], OUT[0], k); ky = lerp(RIP[1], OUT[1], k); kAnim = 'king_carry'; }
  // sách: trên bàn -> trong tay Vua Mực
  if (t < 8.0) book(c, BOOK.x, BOOK.y + Math.sin(t * 2) * 6, t, 1 - seg(t, 5.3, 5.9) * 0.6);
  if (t >= 6.6) drawCentered(c, A, kAnim, kt, kx, ky, 1, false);
  if (t > 6.8 && t < 7.9) speech(c, 'Hô hô hô! Sách này của ta!', kx + 40, ky - 110, fadeIn(t, 6.8, 7.9), 24, -18);

  // ---- 5 trang sách bay ra 5 hướng ----
  if (t > 9.4 && t < 11.2) {
    const k = seg(t, 9.4, 11.2);
    PAGES.forEach(([name, dx, dy], i) => {
      const x = RIP[0] + dx * 700 * ease(k), y = RIP[1] + dy * 420 * ease(k) + Math.sin(k * 12 + i) * 10;
      c.save(); c.globalAlpha = 1 - seg(t, 10.7, 11.2);
      c.fillStyle = 'rgba(255,240,170,.35)'; c.beginPath(); c.arc(x, y, 40, 0, TAU); c.fill();
      c.translate(x, y); c.rotate(k * 8 * (i % 2 ? 1 : -1));
      drawCentered(c, A, name, t, 0, 0, 0.8);
      c.restore();
    });
  }
  c.restore();

  // ---- lớp phủ: đêm tối, chớp sấm, tắt đèn ----
  let dark = 0.18;
  if (t > 5.3 && t < 5.5 && !low) dark = Math.sin(t * 55) > 0 ? 0.62 : 0.05;
  c.fillStyle = dark >= 0 ? `rgba(6,6,30,${dark})` : `rgba(255,255,235,${-dark})`;
  c.fillRect(0, 0, VIEW.w, VIEW.h);
  if (t > 9.4 && t < 9.55) { c.fillStyle = 'rgba(255,255,235,.5)'; c.fillRect(0, 0, VIEW.w, VIEW.h); }   // lóe sáng lúc xé
  if (t >= 5.5 && t < 6.6) {   // tắt đèn: chỉ còn đôi mắt
    c.fillStyle = '#020208'; c.fillRect(0, 0, VIEW.w, VIEW.h);
    const s = A.sprites.fx_eyes;
    if (s?.img) {
      c.save(); c.translate(VIEW.ox, VIEW.oy);
      blitSprite(c, A, 'fx_eyes', t > 6.15 && t < 6.3 ? 2 : t > 6.3 ? 1 : 0, CX, GY - 70, 0.6, false, 'c');
      c.restore();
    }
  }

  // ---- cảnh mở đầu: toàn cảnh học viện, mờ dần sang thư viện ----
  if (t < 3.0) {
    cover(c, A.img.splash, 1 + 0.06 * t, 1 - seg(t, 2.6, 3.0));
    c.fillStyle = `rgba(6,8,30,${0.25 * (1 - seg(t, 2.6, 3.0))})`; c.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  const bar = bars(c, t, DURATION);
  caption(c, 'Đêm Halloween ở Học viện Bút Mực…', fadeIn(t, 0.4, 2.7), bar);
  caption(c, 'Cún ôn bùa bên Sách Phép Gốc', fadeIn(t, 3.0, 5.2), bar);
  caption(c, 'Vua Mực cướp sách và xé ra 5 trang!', fadeIn(t, 8.4, 10.8), bar);
  const ta = seg(t, 12.4, 12.8);
  if (ta > 0) {
    c.fillStyle = `rgba(7,10,32,${ta * 0.55})`; c.fillRect(0, 0, VIEW.w, VIEW.h);
    bigTitle(c, 'Lấy lại 5 trang sách phép!', t > 13 ? 'Trước tiên: học vẽ bùa nhé!' : '', ta, ease(seg(t, 12.7, 13.3)));
  }
  if (t > DURATION - 0.4) { c.fillStyle = `rgba(7,10,32,${seg(t, DURATION - 0.4, DURATION)})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
}
