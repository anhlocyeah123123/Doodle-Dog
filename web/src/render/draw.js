// @ts-check
// Chỉ VẼ: đọc trạng thái (sim + hiệu ứng) và vẽ lên canvas. Không thay đổi trạng thái game.
// Ảnh nền là CSS phía sau canvas trong suốt -> trình duyệt tự ghép, không tốn công vẽ lại mỗi khung.
import { GY, CX, GLYPH, BAL } from '../core/config.js';
import { INK, ink, inkStroke, inkText, inkHeart, bubble } from './ink.js';
import { cached, blit, measure } from './cache.js';
import { FONT } from '../engine/assets.js';
import { drawSigil, drawBeam, drawArea } from './sigil.js';
import { VIEW, uiK } from './view.js';
import { drawDemo, drawBanner } from './guide.js';

const TAU = Math.PI * 2;

/** Vẽ 1 frame của dải sprite; chân nhân vật neo tại (x, y). */
export function drawSprite(c, A, name, elapsed, x, y, flip = false, scale = 1) {
  const s = A.sprites[name];
  if (!s?.img) return;
  const f = s.loop ? ((elapsed * s.fps) | 0) % s.n : Math.min(s.n - 1, (elapsed * s.fps) | 0);
  const w = s.w * scale, h = s.h * scale;
  if (flip) {
    c.save(); c.translate(x, y); c.scale(-1, 1);
    c.drawImage(s.img, f * s.w, 0, s.w, s.h, -w / 2, -h, w, h);
    c.restore();
  } else {
    c.drawImage(s.img, f * s.w, 0, s.w, s.h, x - w / 2, y - h, w, h);
  }
}

function drawGhost(c, A, g, t) {
  const y = g.y + Math.sin(t * 3 + g.id) * 6;
  if (g.heal) {
    const im = A.img.ghost_heart;
    if (im) c.drawImage(im, g.x - im.width / 2, y - im.height / 2);
    c.strokeStyle = 'rgba(255,107,154,.75)'; c.lineWidth = 3;
    c.beginPath(); c.arc(g.x, y, 44 + Math.sin(t * 5) * 4, 0, TAU); c.stroke();
    bubble(c, g.x, y - 58, 19, GLYPH.HEART, '#ff4f8b');
    return;
  }
  const gs = A.sprites[g.boss ? 'boss' : 'ghost'];
  if (!gs?.img) return;
  const sc = g.boss ? 2.4 : g.sz;
  const f = (((t + g.id * 0.13) * gs.fps) | 0) % gs.n;
  const w = gs.w * sc, h = gs.h * sc;
  if (g.vx > 0) {   // ma vẽ quay trái; bay sang phải thì lật
    c.save(); c.translate(g.x, y); c.scale(-1, 1);
    c.drawImage(gs.img, f * gs.w, 0, gs.w, gs.h, -w / 2, -h / 2, w, h);
    c.restore();
  } else {
    c.drawImage(gs.img, f * gs.w, 0, gs.w, gs.h, g.x - w / 2, y - h / 2, w, h);
  }
  const top = y - h / 2 - 4;
  if (g.boss) {   // boss: cả chuỗi bùa, bùa hiện tại tô vàng
    const n = g.seq.length, x0 = g.x - (n - 1) * 17;
    for (let i = 0; i < n; i++) {
      const done = i < g.i;
      bubble(c, x0 + i * 34, top - 6, 14, GLYPH[g.seq[i]], done ? '#aaa' : INK, i === g.i ? '#ffe066' : done ? '#ddd' : '#fff');
    }
  } else {
    const r = Math.round(19 * Math.min(1.35, uiK()));   // màn nhỏ: ký hiệu to hơn cho dễ đọc
    bubble(c, g.x, top - r + 7, r, GLYPH[g.seq[g.i]]);
    const left = g.seq.length - g.i - 1;
    if (left > 0) inkText(c, '+' + left, g.x + 22, top - 2, 16);
  }
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
  const k = uiK();
  c.save(); c.translate(VIEW.w / 2, 0); c.scale(k, k);
  c.globalAlpha = a;
  blit(c, e, 0, (big ? 150 : 210) + i * 50 - (1 - a) * 16);
  c.restore();
}

function drawHud(c, sim, title = true) {
  const k = uiK();
  c.save(); c.scale(k, k);
  for (let i = 0; i < BAL.hp; i++) inkHeart(c, 36 + i * 40, 38, 16, i < sim.hp ? '#ff6b9a' : 'rgba(255,255,255,.3)');
  inkText(c, String(sim.score), 22, 92, 30);
  if (title) inkText(c, `Màn ${sim.level} · Đợt ${sim.wave}/${sim.nWaves}`, VIEW.w / 2 / k, 40, 24, 'center');
  const r = 1 - sim.boltCd / BAL.boltCd;   // thanh hồi chiêu sét
  c.fillStyle = '#fff'; c.fillRect(56, 108, 120, 14);
  c.fillStyle = r >= 1 ? '#ffc400' : '#9bb'; c.fillRect(56, 108, 120 * r, 14);
  c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(56, 108, 120, 14);
  inkText(c, '⚡', 24, 124, 20, 'left', '#d99a00');
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
  c.save(); c.translate(0, VIEW.h / 2); c.scale(k, k);
  blit(c, e, 0, -80);
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

  c.fillStyle = 'rgba(0,0,0,.28)';   // bóng dưới chân
  c.beginPath(); c.ellipse(dog.x, GY + 2, 55, 9, 0, 0, TAU); c.fill();

  for (const s of sim.syms) {   // ký tự boss thả: vòng đỏ = sẽ trúng nhân vật
    const danger = Math.abs(s.x - CX) < BAL.symHitR;
    c.strokeStyle = danger ? 'rgba(255,60,80,.85)' : 'rgba(255,255,255,.3)'; c.lineWidth = 3;
    c.beginPath(); c.ellipse(s.x, GY + 4, 30, 7, 0, 0, TAU); c.stroke();
    const e = cached(`sym|${s.ch}`, 52, 52, 26, 40, (g) => {
      g.fillStyle = '#ff9a3c'; g.strokeStyle = INK; g.lineWidth = 3;   // nền tròn: vẫn thấy rõ dù máy thiếu font emoji
      g.beginPath(); g.arc(26, 27, 21, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = '30px sans-serif'; g.textAlign = 'center'; g.fillText(s.ch, 26, 38);
    });
    blit(c, e, s.x, s.y);
  }
  for (const g of sim.ghosts) drawGhost(c, A, g, t);
  drawSprite(c, A, dog.state, t - dog.t0, dog.x, GY, dog.flip);
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

  if (fx.flash > 0) { c.fillStyle = `rgba(255,255,230,${fx.flash * 2})`; c.fillRect(0, 0, VIEW.w, VIEW.h); }
  if (fx.red > 0) { c.strokeStyle = `rgba(255,40,60,${fx.red * 1.6})`; c.lineWidth = 46; c.strokeRect(0, 0, VIEW.w, VIEW.h); }
  drawHud(c, sim, !v.guide);
  if (v.guide) drawBanner(c, v.guide.say, v.guide.sub, v.guide.a);
  fx.toasts.forEach((o, i) => drawToast(c, o, i));
  if (v.msg) drawPanel(c, v.msg);
}
