// @ts-check
// Các đoạn phim giữa màn của cốt truyện "Cuốn Sách Mực" (vẽ bằng canvas từ sprite):
//   drawPage    hạ boss màn 1–4: trang sách rơi, Cún bắt lấy -> Vua Mực ở cửa sổ (hoặc bức vẽ của Mực Con)
//               -> thẻ "Bạn học được bùa mới!" -> thẻ "Bạn đồng hành mới!" -> Cún chạy sang PHẢI, màn hình tối dần
//               (rồi Session mở bài học của Cô Cú, xong mới cho Cún chạy từ TRÁI vào giữa để chơi màn sau)
//               màn 4: trang trống phát sáng -> chổi bay tới, Cún cưỡi chổi bay lên phải -> tối
//   drawEnding  sau phép tối thượng: lớp mực tan, Vua Mực teo lại thành Mực Con -> làm bạn -> sách lành lại
//   drawTbc     "Còn tiếp…": trang thứ 6 bay về phía mặt trăng
import { CX, GY } from '../core/config.js';
import { INK, inkText, inkStroke } from './ink.js';
import { drawSprite, drawCentered, blitSprite, PAL_POS } from './draw.js';
import { VIEW, uiK, edges } from './view.js';
import { seg, ease, lerp, fadeIn, speech, caption, bigTitle, bars, book } from './cutscene.js';

const TAU = Math.PI * 2;

// ---- nét mẫu (khung 100x100 quanh tâm) cho thẻ "học bùa mới" ----
const circle = Array.from({ length: 33 }, (_, i) => [Math.cos(-Math.PI / 2 - (i / 32) * TAU) * 42, Math.sin(-Math.PI / 2 - (i / 32) * TAU) * 42]);
const zig = [[-30, -45], [28, -18], [-28, 10], [30, 40]];
const bowtie = [[-32, -40], [32, -40], [-32, 40], [32, 40], [-32, -40]];
const dense = (p) => p.slice(1).flatMap((q, i) => Array.from({ length: 10 }, (_, k) => [p[i][0] + ((q[0] - p[i][0]) * k) / 10, p[i][1] + ((q[1] - p[i][1]) * k) / 10])).concat([p[p.length - 1]]);

/**
 * Thông tin đoạn chuyển màn sau khi hạ boss màn l.
 * @type {Record<number, {page:string, head:string, title:string, how:string, path:number[][]|null, pal?:string, palSay?:string, king?:string, kingSay?:string, drawing?:boolean, broom?:boolean, dur:number}>}
 */
export const PAGE_INFO = {
  1: { page: 'page_bolt', head: 'Bạn học được bùa mới!', title: 'Bùa SÉT', how: 'Vẽ zig-zag: mọi con ma mất 1 bùa', path: dense(zig),
    pal: 'mun', palSay: 'Mèo Mun: phóng sao xóa 1 ký hiệu', king: 'king_laugh', kingSay: 'Hô hô! Còn 4 trang nữa cơ!', dur: 10.4 },
  2: { page: 'page_shield', head: 'Bạn học được bùa mới!', title: 'LÁ CHẮN', how: 'Vẽ vòng tròn quanh Cún', path: circle,
    pal: 'frog', palSay: 'Ếch Ộp: nhảy ra nuốt trọn 1 con ma', king: 'king_hit', kingSay: 'Hừm… nhóc này giỏi đấy!', dur: 10.4 },
  3: { page: 'page_hourglass', head: 'Bạn học được bùa mới!', title: 'ĐỒNG HỒ CÁT', how: 'Vẽ 2 tam giác chạm đỉnh: ma chậm lại', path: dense(bowtie),
    pal: 'bat', palSay: 'Dơi Bin: hét đẩy lùi cả đám ma', drawing: true, dur: 10.4 },
  4: { page: 'page_blank', head: 'Trang thứ 4… trống trơn?', title: 'Nó đang phát sáng!', how: 'Trang trống chỉ đường lên mái tháp', path: null,
    broom: true, dur: 8.2 },
};
/** Mốc các phần của đoạn chuyển màn (giây). */
const P = { fall: 1.8, caught: 2.8, beat: 2.9, card: 4.6, palCard: 7.1, run: 9.2, fade: 9.7 };
const P4 = { card: 2.9, broom: 5.4, fly: 6.5, fade: 7.5 };

/** Khung cửa sổ tròn ở góc phải trên: Vua Mực theo dõi từ xa. */
function kingWindow(c, A, name, t, a, say) {
  if (a <= 0) return;
  const E = edges(), x = E.r - 120, y = E.t + 120, r = 82;
  c.save(); c.globalAlpha = a;
  c.fillStyle = '#0b0f2e'; c.strokeStyle = INK; c.lineWidth = 6;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.save(); c.clip();
  c.fillStyle = 'rgba(255,250,215,.85)'; c.beginPath(); c.arc(x + 30, y - 30, 26, 0, TAU); c.fill();   // trăng
  drawCentered(c, A, name, t, x - 6, y + 14, 0.6);
  c.restore();
  c.strokeStyle = '#fff'; c.lineWidth = 9; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
  c.restore();
  if (say) speech(c, say, x - 150, y + 70, a, 22, 40);
}

/** Bạn đồng hành đã có (đứng xem, vui mừng khi Cún bắt được trang). */
function friends(c, A, list, t, cheer) {
  for (const who of list) {
    const [x, y] = PAL_POS[who];
    const name = cheer ? { mun: 'mun_cheer', frog: 'frog_cheer', bat: 'bat_cheer' }[who] : { mun: 'mun_idle', frog: 'frog_idle', bat: 'bat_fly' }[who];
    if (who === 'bat') drawCentered(c, A, name, t, x, y + Math.sin(t * 2.4) * 8);
    else drawSprite(c, A, name, t, x, y, who !== 'mun');
  }
}

/** Thẻ "học bùa mới": cuốn sách rách mở ra, trang mới nằm bên phải, bên trái vẽ mẫu ký hiệu (tọa độ khung nhìn). */
function learnCard(c, A, info, t, a) {
  if (a <= 0) return;
  c.fillStyle = `rgba(7,10,32,${0.6 * a})`; c.fillRect(0, 0, VIEW.w, VIEW.h);
  const k = Math.min(uiK(), (VIEW.h - 20) / 330);
  c.save(); c.globalAlpha = a;
  c.translate(VIEW.w / 2, VIEW.h / 2); c.scale(k * (0.85 + 0.15 * ease(a)), k * (0.85 + 0.15 * ease(a)));
  inkText(c, info.head, 0, -128, 40, 'center');
  blitSprite(c, A, 'spellbook_torn', 0, 0, 10, 1.75, false, 'c');
  // trang mới bay lơ lửng trên trang phải, phát sáng
  c.fillStyle = 'rgba(255,240,160,.35)'; c.beginPath(); c.arc(70, 4, 62 + Math.sin(t * 5) * 5, 0, TAU); c.fill();
  drawCentered(c, A, info.page, t, 70, 4 + Math.sin(t * 2.5) * 4, 1.15);
  if (info.path) {   // trang trái: bàn tay mực vẽ mẫu, lặp lại
    const p = ((t * 0.7) % 1.25) / 1;
    const n = Math.max(2, Math.floor(info.path.length * Math.min(1, p)));
    inkStroke(c, info.path.slice(0, n).map(([x, y]) => [x * 0.95 - 70, y * 0.95 + 6]), 1, 0.7);
  }
  inkText(c, info.title, 0, 128, 42, 'center', '#d8430f');
  inkText(c, info.how, 0, 168, 24, 'center');
  c.restore();
}

/** Thẻ "Bạn đồng hành mới!": nhân vật cỡ to + kỹ năng + cách gọi (chạm biểu tượng góc dưới trái). */
function palCard(c, A, who, say, t, a) {
  if (a <= 0) return;
  c.fillStyle = `rgba(7,10,32,${0.6 * a})`; c.fillRect(0, 0, VIEW.w, VIEW.h);
  const k = Math.min(uiK(), (VIEW.h - 20) / 330);
  c.save(); c.globalAlpha = a;
  c.translate(VIEW.w / 2, VIEW.h / 2); c.scale(k * (0.85 + 0.15 * ease(a)), k * (0.85 + 0.15 * ease(a)));
  inkText(c, 'Bạn đồng hành mới!', 0, -128, 40, 'center');
  c.fillStyle = 'rgba(255,240,160,.3)'; c.beginPath(); c.arc(0, 10, 92, 0, TAU); c.fill();
  const name = { mun: 'mun_cheer', frog: 'frog_cheer', bat: 'bat_cheer' }[who];
  if (who === 'bat') drawCentered(c, A, name, t, 0, 10, 1.9);
  else drawSprite(c, A, name, t, 0, 90, false, 1.9);
  inkText(c, say, 0, 136, 30, 'center', '#d8430f');
  inkText(c, 'Chạm biểu tượng ở góc dưới trái để gọi bạn ấy giúp', 0, 172, 22, 'center');
  c.restore();
}

/**
 * Đoạn chuyển màn sau khi hạ boss màn ps.level.
 * @param {CanvasRenderingContext2D} c
 * @param {import('../engine/assets.js').Assets} A
 * @param {{t:number, level:number, bx:number, by:number, pals:string[]}} ps
 */
export function drawPage(c, A, ps) {
  const info = PAGE_INFO[ps.level], t = ps.t, E = edges();
  c.clearRect(0, 0, VIEW.w, VIEW.h);
  c.save();
  c.translate(VIEW.ox, VIEW.oy);
  const catchY = GY - 150;

  // Cún: bắt trang -> đứng xem -> chạy sang phải (màn 4: cưỡi chổi bay lên phải)
  if (!info.broom) {
    let x = CX, name = 'idle', el = t;
    if (t >= P.fall && t < P.caught + 0.4 && A.sprites.dog_page?.img) { name = 'dog_page'; el = t - P.fall; }
    else if (t >= P.caught + 0.4 && t < P.card) name = info.king ? 'alert' : 'idle';
    else if (t >= P.run) { name = 'run'; x = lerp(CX, E.r + 160, ease(seg(t, P.run, P.run + 1.1))); }
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x, GY + 2, 55, 9, 0, 0, TAU); c.fill();
    drawSprite(c, A, name, el, x, GY);
  } else {
    let bx = CX, by = GY - 18;
    if (t < P4.fly) { const k = ease(seg(t, P4.broom, P4.broom + 0.8)); bx = lerp(E.l - 120, CX, k); by = lerp(GY - 150, GY - 18, k); }
    else { const k = ease(seg(t, P4.fly, P4.fly + 1.4)); bx = lerp(CX, E.r + 220, k * k); by = lerp(GY - 18, E.t - 140, k) + Math.sin(t * 6) * 4; }
    const onBroom = t >= P4.broom + 0.9;
    if (!onBroom) {
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(CX, GY + 2, 55, 9, 0, 0, TAU); c.fill();
      if (t >= P.fall && t < P.caught + 0.4 && A.sprites.dog_page?.img) drawSprite(c, A, 'dog_page', t - P.fall, CX, GY);
      else drawSprite(c, A, t > P4.broom ? 'alert' : 'idle', t, CX, GY);
    } else drawSprite(c, A, 'wave', t, bx, by + 6);
    if (t > P4.broom) drawCentered(c, A, 'broom_idle', t, bx - 6, by + 4, 1.6, true);
  }

  // trang sách rơi lắc lư từ chỗ boss gục xuống tay Cún
  if (t < P.fall + 0.2) {
    const k = seg(t, 0, P.fall);
    const x = lerp(ps.bx, CX + 10, ease(k)) + Math.sin(t * 5) * 30 * (1 - k), y = lerp(ps.by, catchY, ease(k));
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * 4) * 0.4 * (1 - k));
    c.fillStyle = 'rgba(255,240,170,.45)'; c.beginPath(); c.arc(0, 0, 50 + Math.sin(t * 8) * 4, 0, TAU); c.fill();
    drawCentered(c, A, info.page, t, 0, 0, 1);
    c.restore();
    c.fillStyle = '#fff6b0';
    for (let i = 0; i < 6; i++) { const q = (t * 1.3 + i / 6) % 1; c.globalAlpha = 1 - q; c.fillRect(x + Math.sin(i * 5 + t) * 30, y - 20 - q * 60, 4, 4); }
    c.globalAlpha = 1;
  }

  // màn 3: bức vẽ vụng về của Mực Con rơi ra
  if (info.drawing && t > P.beat && t < P.card + 0.4) {
    const k = ease(seg(t, P.beat, P.beat + 0.9));
    const x = CX + 190, y = lerp(-80, 250, k);
    c.save(); c.globalAlpha = 1 - seg(t, P.card, P.card + 0.4);
    c.translate(x, y); c.rotate(0.12 - (1 - k) * 0.6);
    c.fillStyle = '#fbf7ec'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.moveTo(-62, -52); c.lineTo(60, -56); c.lineTo(66, 54); c.lineTo(-58, 58); c.closePath(); c.fill(); c.stroke();
    blitSprite(c, A, 'ink_draw', 2, 0, 4, 0.75, false, 'c');
    c.restore();
  }
  c.restore();

  // ---- lớp trên (tọa độ khung nhìn) ----
  if (info.king) kingWindow(c, A, info.king, t, fadeIn(t, P.beat, P.card), info.kingSay);
  if (info.drawing) caption(c, 'Một bức vẽ vụng về rơi ra… của ai nhỉ?', fadeIn(t, P.beat + 0.6, P.card), 0);
  if (info.broom) {
    learnCard(c, A, info, t - P4.card, fadeIn(t, P4.card, P4.broom));
    caption(c, 'Trang trống chỉ đường lên mái tháp…', fadeIn(t, P4.broom, info.dur), 0);
  } else {
    learnCard(c, A, info, t - P.card, fadeIn(t, P.card, P.palCard));
    if (info.pal) palCard(c, A, info.pal, info.palSay, t - P.palCard, fadeIn(t, P.palCard, P.run));
  }
  const f0 = info.broom ? P4.fade : P.fade, fade = seg(t, f0, info.dur);   // cuối đoạn: tối dần
  if (fade > 0) { c.fillStyle = `rgba(4,6,22,${fade})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (t > 1.0 && fade < 0.5) inkText(c, 'Chạm để tiếp ▸', VIEW.w - 14 * uiK(), VIEW.h - 14 * uiK(), 18 * uiK(), 'right');
}

export const ENDING_DUR = 13.5;
/** @type {[number, string][]} */
export const ENDING_CUES = [[0.4, 'shrink'], [5.2, 'cheer'], [9.6, 'title'], [11.0, 'restore']];

/**
 * Đoạn kết sau phép tối thượng (nền mái tháp).
 * @param {CanvasRenderingContext2D} c @param {import('../engine/assets.js').Assets} A
 * @param {{t:number, bx:number, by:number, pals:string[]}} es
 */
export function drawEnding(c, A, es) {
  const t = es.t;
  c.clearRect(0, 0, VIEW.w, VIEW.h);
  c.save();
  c.translate(VIEW.ox, VIEW.oy);
  const kx = Math.min(es.bx, CX + 230), ky = Math.min(es.by, 230);
  const ix = CX + 150, iy = GY - 60;   // chỗ Mực Con đứng

  // mây mực tan dần quanh Vua Mực
  if (t < 3.6) {
    const a = 1 - seg(t, 1.5, 3.6);
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * TAU + t * 0.6, r = 50 + seg(t, 0, 3.6) * 120;
      c.fillStyle = `rgba(20,16,70,${0.55 * a})`;
      c.beginPath(); c.arc(kx + Math.cos(ang) * r, ky + Math.sin(ang) * r * 0.7, 34 - seg(t, 0, 3.6) * 20, 0, TAU); c.fill();
    }
    if (t > 0.3) drawCentered(c, A, 'king_shrink', (t - 0.3) * 0.62, kx, ky, 1);   // 6 khung trong ~3 giây
  } else {
    const k = ease(seg(t, 3.6, 4.8)), x = lerp(kx, ix, k), y = lerp(ky, iy, k) + Math.sin(t * 2.2) * 5;
    const name = t < 5.6 ? 'ink_shy' : t < 7.4 ? 'ink_smile' : t < 9.4 ? 'ink_draw' : 'ink_smile';
    drawCentered(c, A, name, t - (t < 7.4 ? 3.6 : 7.4), x, y, 1.15, true);
  }

  // Cún: chạy tới làm bạn
  const dx = t < 5.2 ? CX - 60 : lerp(CX - 60, CX + 40, ease(seg(t, 5.2, 6.0)));
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(dx, GY + 2, 55, 9, 0, 0, TAU); c.fill();
  drawSprite(c, A, t < 5.2 ? 'alert' : t < 6.0 ? 'run' : t < 9.4 ? 'wave' : 'win', t, dx, GY);
  // bạn đồng hành + Cô Cú bay tới
  friends(c, A, es.pals.filter((p) => p !== 'bat'), t, t > 7.4);
  if (es.pals.includes('bat')) drawCentered(c, A, t > 7.4 ? 'bat_cheer' : 'bat_fly', t, CX - 160, GY - 150 + Math.sin(t * 2.4) * 8);
  if (t > 7.0) {
    const k = ease(seg(t, 7.0, 8.2)), E = edges();
    drawCentered(c, A, 'owl_cheer', t, lerp(E.l - 120, CX - 250, k), lerp(E.t + 40, GY - 210, k) + Math.sin(t * 3) * 8, 1);
  }
  // sách lành lại: 4 trang bay về ghép vào sách
  if (t > 9.4) {
    const k = seg(t, 9.6, 11.0), bx = CX, by = 150;
    book(c, bx, by, t, 0.4 + 0.6 * k, 1.6);
    ['page_bolt', 'page_shield', 'page_hourglass', 'page_blank', 'page_star'].forEach((p, i) => {
      const a = (i / 5) * TAU + t * 1.5, r = 220 * (1 - ease(k));
      if (k < 1) drawCentered(c, A, p, t, bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.55, 0.6 + 0.4 * (1 - k));
    });
  }
  c.restore();

  // trắng xóa từ đoạn kết tan dần
  if (t < 1) { c.fillStyle = `rgba(255,255,255,${1 - seg(t, 0, 1)})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (t > 11 && t < 11.6) { c.fillStyle = `rgba(255,250,220,${0.6 * (1 - seg(t, 11, 11.6))})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
  c.save(); c.translate(VIEW.ox, VIEW.oy);
  speech(c, 'Xin lỗi… tớ chỉ muốn vẽ đẹp thôi…', ix - 20, iy - 70, fadeIn(t, 4.4, 6.2), 20, 20);
  speech(c, 'Cùng vẽ với tớ nhé!', CX + 40, GY - 175, fadeIn(t, 6.2, 8.0), 24, -10);
  c.restore();
  const bar = bars(c, t, ENDING_DUR + 5);
  caption(c, 'Lớp mực tan đi…', fadeIn(t, 0.6, 3.5), bar);
  caption(c, 'Vua Mực hóa ra là Mực Con, cậu học trò bị bỏ quên', fadeIn(t, 3.7, 7.0), bar);
  caption(c, 'Sách Phép Gốc đã lành lại!', fadeIn(t, 10.6, ENDING_DUR), bar);
}

export const TBC_DUR = 8.5;
/**
 * "Còn tiếp…": trang thứ 6 lấp lánh bay về phía mặt trăng.
 * @param {CanvasRenderingContext2D} c @param {import('../engine/assets.js').Assets} A @param {number} t
 */
export function drawTbc(c, A, t) {
  c.clearRect(0, 0, VIEW.w, VIEW.h);
  c.fillStyle = 'rgba(5,7,25,.35)'; c.fillRect(0, 0, VIEW.w, VIEW.h);
  const mx = VIEW.w * 0.42, my = VIEW.h * 0.22;   // mặt trăng trong ảnh nền mái tháp
  c.save(); c.translate(VIEW.ox, VIEW.oy);
  book(c, CX, GY - 30, t, 1, 1.3);
  drawSprite(c, A, 'idle', t, CX - 140, GY);
  drawSprite(c, A, 'owl_idle', t, CX + 170, GY);
  c.restore();
  const k = ease(seg(t, 0.8, 5.5));
  const sx = CX + VIEW.ox, sy = GY - 60 + VIEW.oy;
  const x = lerp(sx, mx, k) + Math.sin(t * 3) * 30 * (1 - k), y = lerp(sy, my, k);
  if (t > 0.6 && k < 1) {
    c.fillStyle = 'rgba(255,240,170,.4)'; c.beginPath(); c.arc(x, y, 46 * (1 - 0.6 * k), 0, TAU); c.fill();
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * 4) * 0.3);
    drawCentered(c, A, 'page_blank', t, 0, 0, 1.1 * (1 - 0.7 * k));
    c.restore();
    c.fillStyle = '#fff6b0';
    for (let i = 0; i < 10; i++) { const q = (t * 1.1 + i / 10) % 1; c.globalAlpha = (1 - q) * (1 - k); c.fillRect(x + Math.sin(i * 7 + t) * 26, y + q * 70, 3, 3); }
    c.globalAlpha = 1;
  }
  if (k >= 1) {   // lóe sáng ở mặt trăng
    const a = 1 - seg(t, 5.5, 6.4);
    c.fillStyle = `rgba(255,255,230,${0.8 * a})`; c.beginPath(); c.arc(mx, my, 30 + 60 * (1 - a), 0, TAU); c.fill();
  }
  bigTitle(c, 'Trang thứ 6…?', '', fadeIn(t, 2.2, 5.0), ease(seg(t, 2.5, 3.2)), VIEW.h * 0.62);
  bigTitle(c, 'Còn tiếp…', 'Cảm ơn bạn đã chơi Doodle Dog!', fadeIn(t, 5.1, TBC_DUR + 9), ease(seg(t, 5.3, 6.0)), VIEW.h * 0.6);
}
