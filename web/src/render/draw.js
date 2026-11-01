// @ts-check
// Chỉ VẼ: đọc trạng thái (sim + hiệu ứng) và vẽ lên canvas. Không thay đổi trạng thái game.
// Ảnh nền là CSS phía sau canvas trong suốt -> trình duyệt tự ghép, không tốn công vẽ lại mỗi khung.
import { W, GY, CX, CY, GLYPH, BAL, BOSSES, hasSpell } from '../core/config.js';
import { INK, ink, inkStroke, inkText, inkHeart, bubble } from './ink.js';
import { cached, blit, measure } from './cache.js';
import { FONT } from '../engine/assets.js';
import { drawSigil, drawBeam, drawArea } from './sigil.js';
import { VIEW, uiK, safeCx } from './view.js';
import { drawDemo, drawBanner } from './guide.js';

const TAU = Math.PI * 2;
/** Tuỳ chọn vẽ (chỉ đổi qua ?debug, vd khi quay video giới thiệu): hud = false -> ẩn máu/điểm/tiêu đề. */
export const drawOpts = { hud: true };

/** Số khung đang chạy của sprite sau `elapsed` giây (lặp hoặc dừng ở khung cuối). */
export function frameOf(s, elapsed) {
  return s.loop ? (((elapsed * s.fps) | 0) % s.n + s.n) % s.n : Math.max(0, Math.min(s.n - 1, (elapsed * s.fps) | 0));
}

/**
 * Vẽ khung f của sprite. anchor 'b': chân tại (x, y) · 'c': tâm tại (x, y).
 * Ảnh có thể lưu nét hơn cỡ hiển thị (s.k < 1).
 */
export function blitSprite(c, A, name, f, x, y, sc = 1, flip = false, anchor = 'b') {
  const s = A.sprites[name];
  if (!s?.img) return null;
  const k = (s.k || 1) * sc, w = s.w * k, h = s.h * k;
  const oy = anchor === 'b' ? -h : -h / 2;
  if (flip) {
    c.save(); c.translate(x, y); c.scale(-1, 1);
    c.drawImage(s.img, f * s.w, 0, s.w, s.h, -w / 2, oy, w, h);
    c.restore();
  } else c.drawImage(s.img, f * s.w, 0, s.w, s.h, x - w / 2, y + oy, w, h);
  return { w, h };
}

/** Vẽ sprite theo thời gian; chân nhân vật neo tại (x, y). */
export function drawSprite(c, A, name, elapsed, x, y, flip = false, scale = 1) {
  const s = A.sprites[name];
  if (!s?.img) return;
  blitSprite(c, A, name, frameOf(s, elapsed), x, y, scale, flip, 'b');
}

/** Sprite theo thời gian, tâm tại (x, y). */
export function drawCentered(c, A, name, elapsed, x, y, sc = 1, flip = false) {
  const s = A.sprites[name];
  if (!s?.img) return null;
  return blitSprite(c, A, name, frameOf(s, elapsed), x, y, sc, flip, 'c');
}

/** Độ hiện của ma tàng hình (0.12 .. 1) theo thời gian. */
export const invAlpha = (g, t) => {
  const v = Math.sin((t / BAL.invPeriod) * Math.PI * 2 + g.id * 1.7);
  return 0.12 + 0.88 * Math.max(0, Math.min(1, v * 1.6 + 0.35));
};

function drawGhost(c, A, g, t, st) {
  const y = g.y + Math.sin(t * 3 + g.id) * 6;
  if (g.heal) {
    const im = A.img.ghost_heart;
    if (im) c.drawImage(im, g.x - im.width / 2, y - im.height / 2);
    c.strokeStyle = 'rgba(255,107,154,.75)'; c.lineWidth = 3;
    c.beginPath(); c.arc(g.x, y, 44 + Math.sin(t * 5) * 4, 0, TAU); c.stroke();
    bubble(c, g.x, y - 58, 19, GLYPH.HEART, '#ff4f8b');
    return;
  }
  let box = null, alpha = 1;
  if (g.boss) {
    const B = BOSSES[g.kind] || BOSSES.book;
    let name = B.fly, el = t;
    if (g.hitT != null && st - g.hitT < 0.4) { name = B.hit; el = st - g.hitT; }
    else if (B.attack && g.atk != null && st - g.atk < 0.7) { name = B.attack; el = st - g.atk; }
    if (B.king && g.ph === 2 && name === B.fly) name = 'king_laugh';   // pha 2: Vua Mực cười khoái trá
    box = drawCentered(c, A, A.sprites[name]?.img ? name : B.fly, el, g.x, y, 1, false);
    if (!box) {   // sprite boss chưa tải xong: dùng tạm boss cũ
      const gs = A.sprites.boss;
      if (gs?.img) { const f = ((t * gs.fps) | 0) % gs.n; c.drawImage(gs.img, f * gs.w, 0, gs.w, gs.h, g.x - gs.w * 1.2, y - gs.h * 1.2, gs.w * 2.4, gs.h * 2.4); box = { w: gs.w * 2.4, h: gs.h * 2.4 }; }
    }
  } else if (g.kind === 'knight' && A.sprites.knight_fly?.img) {
    if (!g.brk) box = drawCentered(c, A, 'knight_fly', t + g.id * 0.13, g.x, y, g.sz, g.vx < 0);
    else {
      const s = A.sprites.knight_break, el = st - g.brk;
      box = blitSprite(c, A, 'knight_break', el < 0.4 ? frameOf(s, el) : 3, g.x, y, g.sz, g.vx < 0, 'c');
    }
  } else {
    if (g.kind === 'inv') { alpha = invAlpha(g, t); c.globalAlpha = alpha; }
    const gs = A.sprites.ghost;
    if (!gs?.img) return;
    const sc = g.sz;
    const f = (((t + g.id * 0.13) * gs.fps) | 0) % gs.n;
    const w = gs.w * sc, h = gs.h * sc;
    if (g.vx > 0) {   // ma vẽ quay trái; bay sang phải thì lật
      c.save(); c.translate(g.x, y); c.scale(-1, 1);
      c.drawImage(gs.img, f * gs.w, 0, gs.w, gs.h, -w / 2, -h / 2, w, h);
      c.restore();
    } else c.drawImage(gs.img, f * gs.w, 0, gs.w, gs.h, g.x - w / 2, y - h / 2, w, h);
    box = { w, h };
    c.globalAlpha = 1;
  }
  if (!box) return;
  const top = y - box.h / 2 - 4;
  if (g.boss) {   // boss: cả chuỗi bùa, bùa hiện tại tô vàng to hơn
    // Boss to, xuất hiện cao trên mép màn -> kẹp dãy bùa xuống dưới dòng tiêu đề để luôn nhìn thấy ngay từ đầu.
    const by = Math.max(top - 6, VIEW.sy - VIEW.oy + 82 * uiK());
    // Boss lướt vào từ mép phải: dãy bùa cũng kẹp vào trong màn theo chiều ngang (chừa chỗ nút tạm dừng)
    const n = g.seq.length, gap = 40, half = ((n - 1) * gap) / 2;
    const cxRow = Math.min(Math.max(g.x, VIEW.sx - VIEW.ox + half + 30), VIEW.sx + VIEW.sw - VIEW.ox - half - 40);
    const x0 = cxRow - half;
    for (let i = 0; i < n; i++) {
      const done = i < g.i, cur = i === g.i;
      bubble(c, x0 + i * gap, by, cur ? 19 : 15, GLYPH[g.seq[i]], done ? '#aaa' : INK, cur ? '#ffe066' : done ? '#ddd' : '#fff');
    }
  } else if (alpha > 0.45) {   // ma tàng hình: lúc ẩn thì ký hiệu cũng ẩn
    const r = Math.round(19 * Math.min(1.35, uiK()) * (g.kind === 'swarm' ? 0.85 : 1));   // màn nhỏ: ký hiệu to hơn cho dễ đọc
    c.globalAlpha = alpha;
    const sym = g.seq[g.i];
    bubble(c, g.x, top - r + 7, r, GLYPH[sym], sym === 'LIGHTNING' ? '#d99a00' : INK, sym === 'LIGHTNING' ? '#fff3b0' : '#fff');
    const left = g.seq.length - g.i - 1;
    if (left > 0) inkText(c, '+' + left, g.x + 22, top - 2, 16);
    c.globalAlpha = 1;
  }
}

/** Đồ boss ném (sprite) hoặc lửa xanh (vẽ bằng code). */
function drawDrop(c, A, s, t) {
  if (s.ch === 'flame') {
    const fl = 1 + Math.sin(t * 30 + s.x) * 0.08;
    const g = c.createRadialGradient(s.x, s.y + 4, 2, s.x, s.y, 30);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.35, 'rgba(110,190,255,.9)'); g.addColorStop(1, 'rgba(40,90,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(s.x, s.y - 34 * fl);
    c.bezierCurveTo(s.x + 22, s.y - 8, s.x + 18, s.y + 18, s.x, s.y + 18);
    c.bezierCurveTo(s.x - 18, s.y + 18, s.x - 22, s.y - 8, s.x, s.y - 34 * fl);
    c.fill();
    return;
  }
  if (A.sprites[s.ch]?.img) { drawCentered(c, A, s.ch, t + s.x * 0.01, s.x, s.y, 1); return; }
  const e = cached('sym|pumpkin', 52, 52, 26, 40, (g) => {   // chưa tải sprite: quả bí vẽ tay
    g.fillStyle = '#ff9a3c'; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.arc(26, 27, 21, 0, Math.PI * 2); g.fill(); g.stroke();
  });
  blit(c, e, s.x, s.y);
}

/** Chỗ đứng của bạn đồng hành trong các đoạn phim (đoạn kết). */
export const PAL_POS = { mun: [CX - 100, GY], frog: [CX + 108, GY], bat: [CX - 160, GY - 150] };
const PAL_FACE = { mun: 'mun_idle', frog: 'frog_idle', bat: 'bat_fly' };
export const PAL_NAME = { mun: 'Mun', frog: 'Ộp', bat: 'Bin' };

/** Vị trí biểu tượng bạn đồng hành thứ i (tọa độ khung nhìn, góc dưới trái) + bán kính. */
export function palIcon(i) {
  const k = uiK(), r = 34 * k;   // ≥ ~48px chạm được trên điện thoại
  return { x: VIEW.sx + 16 * k + r + i * (r * 2 + 14 * k), y: VIEW.sy + VIEW.sh - 16 * k - r, r };
}

/** Biểu tượng bạn đồng hành (góc dưới trái): sẵn sàng thì viền vàng nhấp nháy, đang hồi thì xám + vòng đếm giờ. */
/**
 * Vẽ 1 biểu tượng bạn đồng hành tại (x, y) bán kính r.
 * cd: 0 = sẵn sàng, (0..1] = phần hồi chiêu còn lại · glow: 0..1 ửng sáng (vừa nhận được / bạn mới)
 */
export function palBadge(c, A, who, x, y, r, t, cd = 0, glow = 0) {
  const ready = cd <= 0;
  c.save();
  if (glow > 0) {   // quầng sáng vàng tỏa ra + tia lấp lánh
    const g = c.createRadialGradient(x, y, r * 0.6, x, y, r * 2.4);
    g.addColorStop(0, `rgba(255,236,140,${0.75 * glow})`); g.addColorStop(1, 'rgba(255,236,140,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.4, 0, TAU); c.fill();
    c.strokeStyle = `rgba(255,255,255,${0.9 * glow})`; c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + t * 1.2, r0 = r * 1.25, r1 = r * (1.6 + 0.25 * Math.sin(t * 8 + i));
      c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); c.stroke();
    }
  }
  c.fillStyle = ready ? '#fffbe8' : '#d9d9e6'; c.strokeStyle = INK; c.lineWidth = 3;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.save(); c.clip();
  const s = A.sprites[PAL_FACE[who]];
  if (s?.img) {
    const sc = (r * 2.1) / (s.h * (s.k || 1));
    c.globalAlpha = ready ? 1 : 0.45;
    blitSprite(c, A, PAL_FACE[who], 0, x, y + r * 1.05, sc, false, 'b');
    c.globalAlpha = 1;
  }
  c.restore();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  if (ready) {   // sẵn sàng: viền vàng phập phồng
    c.strokeStyle = '#ffc400'; c.lineWidth = 4 + Math.sin(t * 6) * 1.5 + glow * 3;
    c.beginPath(); c.arc(x, y, r + 5, 0, TAU); c.stroke();
  } else {   // đang hồi: vòng đếm giờ
    c.strokeStyle = '#1fa8e8'; c.lineWidth = 5;
    c.beginPath(); c.arc(x, y, r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd)); c.stroke();
  }
  c.restore();
  inkText(c, PAL_NAME[who], x, y + r + 2, 15 * uiK(), 'center');
}

/** Biểu tượng bạn đồng hành lúc chơi (góc dưới trái). newPal: bạn vừa nhận ở màn trước -> ửng sáng + chữ "Mới!" vài giây đầu màn. */
function drawPalIcons(c, A, pals, t, newPal) {
  pals.forEach((p, i) => {
    const { x, y, r } = palIcon(i);
    const glow = newPal && newPal.who === p.who ? newPal.a : 0;
    palBadge(c, A, p.who, x, y, r, t, p.cd > 0 ? p.cd / p.max : 0, glow);
    if (glow > 0.05) {
      c.save(); c.globalAlpha = Math.min(1, glow * 2);
      inkText(c, 'Mới! Chạm để gọi', x - r, y - r - 12 - Math.sin(t * 5) * 3, 17 * uiK(), 'left', '#d8430f');
      c.restore();
    }
  });
}

/** Vòm lá chắn nét mực quanh nhân vật; nhấp nháy trong giây cuối. */
function drawShield(c, left, t) {
  if (left < 1 && Math.sin(t * 30) > 0) return;
  const r = BAL.shieldR, y = CY - 10;
  c.save();
  c.globalAlpha = 0.16; c.fillStyle = '#14a89c';
  c.beginPath(); c.arc(CX, y, r, 0, TAU); c.fill();
  c.globalAlpha = 0.95; c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i <= 48; i++) {   // vòng run tay, xoay chậm
    const a = (i / 48) * TAU + t * 0.6, rr = r + Math.sin(i * 2.7 + t * 4) * 3;
    i ? c.lineTo(CX + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(CX + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.strokeStyle = '#fff'; c.lineWidth = 9; c.stroke();
  c.strokeStyle = '#14a89c'; c.lineWidth = 4; c.stroke();
  if (!ink.low) {   // các nét gạch ngắn như bùa vẽ tay
    c.strokeStyle = INK; c.lineWidth = 2.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU - t * 0.9;
      c.beginPath(); c.moveTo(CX + Math.cos(a) * (r - 12), y + Math.sin(a) * (r - 12)); c.lineTo(CX + Math.cos(a) * (r + 10), y + Math.sin(a) * (r + 10)); c.stroke();
    }
  }
  c.restore();
}

function drawFx(c, f) {
  const k = f.a, al = 1 - k;
  c.lineCap = c.lineJoin = 'round';
  if (f.t === 'ring') {
    c.globalAlpha = al;
    c.beginPath(); c.arc(f.x, f.y, 14 + k * 70, 0, TAU);
    c.strokeStyle = '#fff'; c.lineWidth = 9; c.stroke();
    c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
    c.globalAlpha = 1;
  } else if (f.t === 'beam') {
    drawBeam(c, f);
  } else if (f.t === 'area') {
    drawArea(c, f);
  } else if (f.t === 'bolt') {
    c.globalAlpha = al;
    c.beginPath();
    f.p.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    for (const [col, w] of [['#fff', 12], ['#ffd23f', 7], [INK, 3]]) { c.strokeStyle = col; c.lineWidth = w; c.stroke(); }
    c.globalAlpha = 1;
  } else if (f.t === 'sigil') {
    drawSigil(c, f);
  } else if (f.t === 'poof' && f.A) {
    const s = f.A.sprites.fx_poof;
    if (s?.img) blitSprite(c, f.A, 'fx_poof', Math.min(s.n - 1, (k * s.n) | 0), f.x, f.y, f.sc || 1, false, 'c');
  } else if (f.t === 'cameo' && f.A) {   // bạn đồng hành hiện ra chốc lát rồi biến mất
    const s = f.A.sprites[f.name];
    if (s?.img) {
      c.globalAlpha = Math.min(1, k * 8, (1 - k) * 5);
      const pop = 0.7 + 0.3 * Math.min(1, k * 6);
      blitSprite(c, f.A, f.name, Math.min(s.n - 1, (k * s.n) | 0), f.x, f.y, (f.sc || 1) * pop, !!f.flip, 'c');
      c.globalAlpha = 1;
    }
  } else if (f.t === 'star') {   // Mèo Mun phóng sao tới con ma
    const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 60;
    c.save(); c.translate(x, y); c.rotate(k * 9);
    c.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 16, a = (i / 10) * TAU - Math.PI / 2; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath(); c.fillStyle = '#ffe066'; c.fill(); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
    c.restore();
  } else if (f.t === 'tongue') {   // Ếch Ộp lè lưỡi
    const r = k < 0.5 ? k * 2 : (1 - k) * 2;
    c.strokeStyle = INK; c.lineWidth = 11; c.beginPath(); c.moveTo(f.x0, f.y0); c.lineTo(f.x0 + (f.x1 - f.x0) * r, f.y0 + (f.y1 - f.y0) * r); c.stroke();
    c.strokeStyle = '#ff7aa8'; c.lineWidth = 6; c.stroke();
  } else if (f.t === 'sonic') {   // Dơi Bin hét: vòng sóng âm lan ra
    c.strokeStyle = '#fff'; c.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const kk = k - i * 0.15; if (kk <= 0) continue;
      c.globalAlpha = Math.max(0, 1 - kk);
      c.beginPath(); c.arc(f.x, f.y, 30 + kk * 520, 0, TAU); c.stroke();
    }
    c.globalAlpha = 1;
  }
}

function drawToast(c, o, i) {
  const big = o.kind === 'level' || o.kind === 'boss';
  const size = big ? 34 : 22;
  const a = Math.min(1, o.t * 5, (o.life - o.t) * 3);
  const e = cached(`toast|${o.kind}|${o.txt}`, measure(`bold ${size}px ${FONT}`, o.txt) + 48, size * 1.9, 0, 0, (g) => {
    const w = measure(`bold ${size}px ${FONT}`, o.txt) + 40, h = size * 1.7;
    g.fillStyle = o.kind === 'boss' ? '#ffe066' : o.kind === 'warn' ? '#fff4d6' : '#fff';
    g.strokeStyle = INK; g.lineWidth = 4;
    g.beginPath(); g.moveTo(6, 4); g.lineTo(w, 2); g.lineTo(w + 2, h); g.lineTo(4, h + 2); g.closePath();   // khung hơi méo như cắt giấy
    g.fill(); g.stroke();
    inkText(g, o.txt, w / 2 + 3, h / 2 + size * 0.38, size, 'center');
  });
  e.ox = e.w / 2; e.oy = e.h / 2;
  // Từ ĐÁY màn hình lên: ma bay tới từ phía trên nên đáy hầu như trống -> không che ký hiệu trên đầu ma.
  const k = uiK();
  c.save(); c.translate(safeCx(), VIEW.sy + VIEW.sh - 8 * k); c.scale(k, k);
  c.globalAlpha = a * 0.95;
  blit(c, e, 0, -e.h / 2 - i * 50 + (1 - a) * 16);
  c.restore();
}

function drawHud(c, sim, title = true) {
  const k = uiK();
  c.save(); c.translate(VIEW.sx, VIEW.sy); c.scale(k, k);
  for (let i = 0; i < BAL.hp; i++) inkHeart(c, 36 + i * 40, 38, 16, i < sim.hp ? '#ff6b9a' : 'rgba(255,255,255,.3)');
  inkText(c, String(sim.score), 22, 92, 30);
  if (title) inkText(c, `Màn ${sim.level} · Đợt ${sim.wave}/${sim.nWaves}`, VIEW.sw / 2 / k, 40, 24, 'center');
  if (hasSpell(sim.spellLv, 'LIGHTNING')) {
    const r = 1 - sim.boltCd / BAL.boltCd;   // thanh hồi chiêu sét
    c.fillStyle = '#fff'; c.fillRect(56, 108, 120, 14);
    c.fillStyle = r >= 1 ? '#ffc400' : '#9bb'; c.fillRect(56, 108, 120 * r, 14);
    c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(56, 108, 120, 14);
    inkText(c, '⚡', 24, 124, 20, 'left', '#d99a00');
  }
  // lá chắn / đồng hồ cát: còn / đang dùng (đếm giờ) / đã dùng (gạch chéo)
  const icon = (sx, on, used, left, col, glyph) => {
    const sy = 115;
    c.globalAlpha = used ? 0.45 : 1;
    c.fillStyle = on ? '#fff3c4' : used ? '#ddd' : '#fff'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.arc(sx, sy, 13, 0, TAU); c.fill(); c.stroke();
    inkText(c, glyph, sx, sy + 6, 16, 'center', col);
    if (on) { c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.arc(sx, sy, 18, -Math.PI / 2, -Math.PI / 2 + TAU * left); c.stroke(); }
    if (used) { c.strokeStyle = '#e2283c'; c.lineWidth = 3; c.beginPath(); c.moveTo(sx - 11, sy + 11); c.lineTo(sx + 11, sy - 11); c.stroke(); }
    c.globalAlpha = 1;
  };
  if (hasSpell(sim.spellLv, 'SHIELD')) icon(200, sim.shield > 0, sim.shieldUsed && sim.shield <= 0, sim.shield / BAL.shieldSec, '#14a89c', '◯');
  if (hasSpell(sim.spellLv, 'HOURGLASS')) icon(240, sim.slow > 0, sim.slowUsed && sim.slow <= 0, sim.slow / BAL.slowSec, '#c97a12', '⧗');
  c.globalAlpha = 1;
  c.restore();
}

function drawPanel(c, msg) {
  const k = uiK(), w = Math.ceil(VIEW.w / k);
  const e = cached(`msg|${w}|${msg.a}|${msg.b}`, w + 8, 160, 4, 0, (g) => {
    g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(0, 4, w + 8, 150);
    g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(0, 4, w + 8, 150);
    inkText(g, msg.a, w / 2 + 4, 76, 48, 'center');
    inkText(g, msg.b, w / 2 + 4, 126, 24, 'center');
  });
  c.save(); c.translate(0, VIEW.sy + VIEW.sh / 2); c.scale(k, k);
  blit(c, e, 0, -80);
  c.restore();
}

/** Đồng hồ cát: màn hình ngả màu cát, mặt đồng hồ mờ quay chậm ở giữa. */
function drawSlow(c, left, t) {
  const a = Math.min(1, left * 2, (BAL.slowSec - left) * 4);
  c.fillStyle = `rgba(255,196,110,${0.13 * a})`; c.fillRect(0, 0, VIEW.w, VIEW.h);
  c.save(); c.globalAlpha = 0.22 * a; c.translate(safeCx(), VIEW.sy + VIEW.sh * 0.42); c.rotate(Math.sin(t * 0.8) * 0.1);
  inkText(c, '⧗', 0, 40, 130, 'center', '#c97a12');
  c.restore();
}

/** Vua Mực tắt đèn: tối đen, chỉ còn đôi mắt Cún sáng + dấu "?" (giống hiệu ứng trong bản Doodle). */
function drawDark(c, A, left, dogX) {
  const a = Math.min(1, left * 6, (BAL.darkSec - left) * 8);
  c.fillStyle = `rgba(2,2,8,${0.95 * a})`; c.fillRect(0, 0, VIEW.w, VIEW.h);
  const s = A.sprites.fx_eyes;
  if (!s?.img || a < 0.6) return;
  const el = BAL.darkSec - left, f = el % 1.1 > 0.95 ? 2 : 0;   // chớp mắt
  c.save(); c.translate(VIEW.ox, VIEW.oy);
  blitSprite(c, A, 'fx_eyes', f, dogX, GY - 70, 0.55, false, 'c');
  c.restore();
}

/** Đèn sân khấu lúc vào màn: cả màn tối, một luồng sáng chiếu xuống Cún. a: độ đậm 0..1 */
function drawSpot(c, dogX, a) {
  const x = dogX + VIEW.ox, top = 0, bot = GY + VIEW.oy + 12;
  const wt = 40, wb = 150;
  c.save();
  c.beginPath(); c.rect(0, 0, VIEW.w, VIEW.h);
  c.moveTo(x - wt, top); c.lineTo(x + wt, top); c.lineTo(x + wb, bot); c.ellipse(x, bot, wb, 26, 0, 0, Math.PI); c.lineTo(x - wt, top);
  c.fillStyle = `rgba(4,6,22,${0.82 * a})`; c.fill('evenodd');
  const g = c.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, `rgba(255,250,215,${0.35 * a})`); g.addColorStop(1, `rgba(255,250,215,${0.08 * a})`);
  c.beginPath(); c.moveTo(x - wt, top); c.lineTo(x + wt, top); c.lineTo(x + wb, bot); c.ellipse(x, bot, wb, 26, 0, 0, Math.PI); c.closePath();
  c.fillStyle = g; c.fill();
  c.restore();
}

/**
 * Thẻ giới thiệu bài học: "Cô Cú dạy bùa mới!" + lời dặn bước đầu, hiện to giữa màn hình (màn hình tối),
 * rồi THU LÊN mép trên, đúng chỗ băng lời dặn sẽ hiện -> người chơi hiểu chuyện gì đang diễn ra.
 * @param {{k:number, say:string, sub:string, level:number}} L  k: tiến độ 0..1
 */
function drawLessonCard(c, A, L, t) {
  const k = L.k, ease = (q) => (q < 0.5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2);
  const inA = Math.min(1, k / 0.12), mv = ease(Math.max(0, (k - 0.72) / 0.28));
  c.fillStyle = `rgba(4,6,22,${0.7 * inA * (1 - mv)})`; c.fillRect(0, 0, VIEW.w, VIEW.h);
  const u = uiK(), cx = safeCx();
  const y0 = VIEW.sy + VIEW.sh * 0.5, y1 = VIEW.sy + 34 * u;
  const y = y0 + (y1 - y0) * mv, sc = u * (1.25 - 0.25 * mv) * (0.9 + 0.1 * inA);
  c.save();
  c.globalAlpha = inA;
  // cô Cú + dòng tiêu đề nhỏ (mờ dần khi thu lên)
  c.save(); c.globalAlpha = inA * (1 - mv);
  const owl = A.sprites.owl_talk;
  if (owl?.img) blitSprite(c, A, 'owl_talk', ((t * owl.fps) | 0) % owl.n, cx, y - 66 * u, 1.05 * u, false, 'b');
  inkText(c, `Trang ${L.level - 1} · Cô Cú dạy bùa mới!`, cx, y - 30 * u, 22 * u, 'center', '#d8430f');
  c.restore();
  c.translate(cx, y); c.scale(sc, sc);
  inkText(c, L.say, 0, 12, 34, 'center');
  c.globalAlpha = inA * (1 - mv);
  if (L.sub) inkText(c, L.sub, 0, 46, 18, 'center');
  c.restore();
}

/** Độ dày nét theo thiết bị: cảm ứng cần nét dày ≥ ~7px THẬT trên màn hình để thấy rõ dưới ngón tay. */
const strokeK = (touch) => (touch ? Math.max(1, 0.7 / VIEW.s) : 1);

/**
 * @param {CanvasRenderingContext2D} c
 * @param {import('../engine/assets.js').Assets} A
 * @param {any} v trạng thái cần vẽ (xem game/session.js -> view())
 */
export function draw(c, A, v) {
  const { sim, t, trail, dog, fx } = v;
  c.clearRect(0, 0, VIEW.w, VIEW.h);
  c.save();
  c.translate(VIEW.ox, VIEW.oy);   // thế giới 960x540 nằm giữa khung nhìn, bám đáy
  if (fx.shake > 0 && !ink.low) c.translate((Math.random() - 0.5) * fx.shake * 26, (Math.random() - 0.5) * fx.shake * 26);

  const lift = Math.min(1, -(dog.dy || 0) / 260);   // bay càng cao bóng càng nhỏ, mờ
  c.fillStyle = `rgba(0,0,0,${0.28 * (1 - lift * 0.8)})`;   // bóng dưới chân
  c.beginPath(); c.ellipse(dog.x, GY + 2, 55 * (1 - lift * 0.6), 9 * (1 - lift * 0.6), 0, 0, TAU); c.fill();

  for (const s of sim.syms) {   // ký tự boss thả: vòng đỏ = sẽ trúng nhân vật
    const danger = Math.abs(s.x - CX) < BAL.symHitR;
    if (s.w > 0) {   // báo trước: vòng nhấp nháy + dấu "!" trên mặt đất, ký tự chưa rơi
      const blink = 0.45 + 0.55 * Math.abs(Math.sin(t * 12));
      c.strokeStyle = danger ? `rgba(255,60,80,${blink})` : `rgba(255,255,255,${blink * 0.7})`; c.lineWidth = 4;
      c.beginPath(); c.ellipse(s.x, GY + 4, 34, 9, 0, 0, TAU); c.stroke();
      if (danger) inkText(c, '!', s.x, GY - 8, 26, 'center', '#e2283c');
      continue;
    }
    c.strokeStyle = danger ? 'rgba(255,60,80,.85)' : 'rgba(255,255,255,.3)'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(s.x, GY + 4, 30, 7, 0, 0, TAU); c.stroke();
    drawDrop(c, A, s, t);
  }
  for (const g of sim.ghosts) drawGhost(c, A, g, t, sim.t);
  if (v.owl) drawSprite(c, A, v.owl.a, t - v.owl.t0, VIEW.sx - VIEW.ox + 95, GY, false);   // Cô Cú dạy bùa (góc trái)
  if (v.broom && v.broom.x > dog.x + 40) drawCentered(c, A, 'broom_idle', t, v.broom.x - 6, v.broom.y + 4, 1.6, true);   // chổi đã rời Cún
  drawSprite(c, A, dog.state, t - dog.t0, dog.x, GY + (dog.dy || 0), dog.flip);
  if (v.broom && v.broom.x <= dog.x + 40) drawCentered(c, A, 'broom_idle', t, v.broom.x - 6, v.broom.y + 4, 1.6, true);   // Cún đang ngồi trên chổi
  if (sim.shield > 0) drawShield(c, sim.shield, t);
  for (const f of fx.list) drawFx(c, f);
  for (const p of fx.parts) {
    const a = Math.min(1, (p.l / p.m) * 1.6);
    c.globalAlpha = a;
    if (p.ch === '♥') inkHeart(c, p.x, p.y, p.sz, '#ff6b9a');
    else if (p.ch) inkText(c, p.ch, p.x, p.y, p.sz, 'center');
    else { c.fillStyle = p.col; c.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); }   // hình vuông rẻ hơn hình tròn
  }
  c.globalAlpha = 1;
  if (v.guide?.demo) drawDemo(c, v.guide.demo);   // màn tập: bàn tay vẽ mẫu (dưới nét của người chơi)
  inkStroke(c, trail.pts, trail.down ? 1 : trail.fade * 4, strokeK(trail.touch));
  c.restore();

  if (sim.slow > 0) drawSlow(c, sim.slow, t);
  if (sim.dark > 0) drawDark(c, A, sim.dark, dog.x);
  if (v.spot > 0) drawSpot(c, dog.x, v.spot);
  if (fx.flash > 0) { c.fillStyle = `rgba(255,255,230,${fx.flash * 2})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (fx.red > 0) { c.strokeStyle = `rgba(255,40,60,${fx.red * 1.6})`; c.lineWidth = 46; c.strokeRect(VIEW.sx, VIEW.sy, VIEW.sw, VIEW.sh); }
  if (drawOpts.hud) drawHud(c, sim, !v.guide && !v.lessonCard && sim.level > 0);
  if (drawOpts.hud && v.pals && sim.pals.length) drawPalIcons(c, A, sim.pals, t, v.newPal);
  if (v.guide) drawBanner(c, v.guide.say, v.guide.sub, v.guide.a);
  if (v.lessonCard) drawLessonCard(c, A, v.lessonCard, t);
  fx.toasts.forEach((o, i, all) => drawToast(c, o, all.length - 1 - i));   // mới nhất nằm dưới cùng
  if (v.msg) drawPanel(c, v.msg);
  if (v.fade > 0) { c.fillStyle = `rgba(4,6,22,${Math.min(1, v.fade)})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }   // chuyển cảnh: tối dần / sáng dần
}
