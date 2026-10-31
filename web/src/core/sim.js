// @ts-check
// Logic game THUẦN: không DOM, canvas, âm thanh hay mạng.
// -> chạy được trong test/bot, và sau này dùng chung cho chế độ online.
//
// Giao tiếp ra ngoài chỉ qua mảng `ev` (sự kiện). Lớp hiển thị đọc rồi xóa mỗi khung hình:
//   wave {n, of, boss}        đợt ma mới xuất hiện
//   healspawn                 ma tim xuất hiện
//   step {x, y, s}            1 bùa trúng, ma còn bùa
//   area {s, geo, n, fb}      bùa quét theo nét vẽ trúng n ma (fb = không ai trong vùng, đánh con gần nhất)
//   combo {n, x, y}           1 nét trúng từ 2 ma trở lên
//   kill {x, y, s, boss, pts} ma bị diệt
//   heal {x, y}               hồi máu
//   phase                     boss sang pha 2
//   finale {x, y}             hết bùa pha cuối: boss bị giữ lại để Session diễn đòn kết liễu, rồi gọi finishBoss()
//   bolt                      tung sét thành công
//   miss {cd}                 bùa không trúng ma nào (cd = sét đang hồi)
//   pop {x, y}                phá ký tự rơi
//   hit                       nhân vật mất máu
//   shield                    bật lá chắn · block {x, y} lá chắn hất 1 con ma ra
//   over / clear              thua / qua màn (won = qua màn cuối)
import { CX, CY, BAL, POOL, LEVELS, LAST, W, TUTORIAL } from './config.js';

/** @typedef {import('./config.js').Spell} Spell */
/**
 * @typedef {Object} Ghost
 * @property {number} id
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} sp     tốc độ
 * @property {Spell[]} seq   chuỗi bùa cần vẽ
 * @property {number} i      đang ở bùa thứ mấy
 * @property {number} sz     hệ số cỡ
 * @property {boolean} boss
 * @property {boolean} heal  ma tim (không tấn công)
 * @property {number} ph     pha boss (1|2)
 * @property {number} [ent]  boss đang lướt vào từ mép phải (1) -> chưa tiến về nhân vật
 */
/** @typedef {{x:number, y:number, vy:number, ch:string, w:number}} FallingSymbol  w: giây báo trước còn lại (> 0: chưa rơi) */

/** PRNG có seed (mulberry32) -> cùng seed = cùng diễn biến, cần cho replay/online. */
const rng = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const distToDog = (g) => Math.hypot(CX - g.x, CY - g.y);
const SYMBOLS = ['🎃', '👻', '💀', '🕷️'];
const AREA = new Set(['HORIZONTAL', 'VERTICAL', 'DIAGONAL', 'HAT_UP', 'HAT_DOWN']);

/** Ma g có nằm trong vùng tác dụng của nét vẽ không. Ma to (boss) có vùng trúng rộng hơn. */
function inArea(s, geo, g) {
  const band = BAL.beamBand * Math.max(1, g.sz * 0.8);
  switch (s) {
    case 'HORIZONTAL': return Math.abs(g.y - geo.cy) < band;
    case 'VERTICAL': return Math.abs(g.x - geo.cx) < band;
    case 'DIAGONAL': {   // khoảng cách tới đường thẳng qua điểm đầu-cuối, kéo dài vô hạn
      const dx = geo.x1 - geo.x0, dy = geo.y1 - geo.y0, len = Math.hypot(dx, dy) || 1;
      return Math.abs((g.x - geo.x0) * dy - (g.y - geo.y0) * dx) / len < band;
    }
    default: {   // V: khung bao của nét, nới rộng
      const pad = BAL.vPad * Math.max(1, g.sz * 0.8);
      return g.x > geo.minX - pad && g.x < geo.maxX + pad && g.y > geo.minY - pad && g.y < geo.maxY + pad;
    }
  }
}

export class Sim {
  constructor(seed = 1, level = 1, hp = BAL.hp, score = 0) {
    this.r = rng(seed);
    this.hp = hp;
    this.score = score;
    this.over = false;
    this.startLevel(level);
  }

  /** @param {number} l */
  startLevel(l) {
    const c = l === 0 ? TUTORIAL : LEVELS[l];
    /** Màn tập: ma không cắn, ký tự rơi không gây sát thương, không tự qua màn, ma tim không tự xuất hiện. */
    this.tut = l === 0;
    this.level = l;
    this.cfg = c;
    this.t = 0;
    /** @type {Ghost[]} */ this.ghosts = [];
    /** @type {FallingSymbol[]} */ this.syms = [];
    /** @type {any[]} */ this.ev = [];
    this.id = 0;
    this.kills = 0;
    this.waves = c.waves.map((w) => ({ ...w }));
    this.nWaves = c.waves.length;
    this.healCd = c.heal * 0.5;
    this.boltCd = 0;
    this.symT = 0;
    /** @type {Ghost|null} */ this.finale = null;   // boss chờ đòn kết liễu
    this.shield = 0;           // giây lá chắn còn lại
    this.shieldUsed = false;   // mỗi màn chỉ 1 lần
    this.cleared = false;
    this.won = false;
  }

  get wave() { return this.nWaves - this.waves.length; }

  /** @param {number} n */
  seq(n) { return Array.from({ length: n }, () => POOL[(this.r() * POOL.length) | 0]); }

  /** Hướng ma về tâm nhân vật với tốc độ sp. */
  aim(g, sp) {
    const d = Math.hypot(CX - g.x, CY - g.y) || 1;
    g.vx = ((CX - g.x) / d) * sp;
    g.vy = ((CY - g.y) / d) * sp;
    g.sp = sp;
  }

  /** Cả đợt xuất hiện CÙNG LÚC, rải đều trên nửa cung tròn phía trên -> không chồng nhau, cách đều nhân vật. */
  spawn(w) {
    for (let i = 0; i < w.n; i++) {
      let x = CX, y = -70;
      if (w.boss) { x = W + 220; y = 175; }
      else {
        const slot = (i + 0.5) / w.n + (this.r() - 0.5) * (0.7 / w.n);   // vị trí đều + chút ngẫu nhiên
        const a = Math.PI * (1.04 + 0.92 * Math.min(1, Math.max(0, slot)));   // từ trái (≈180°) qua đỉnh tới phải (≈360°)
        x = CX + Math.cos(a) * BAL.spawnR;
        y = CY + Math.sin(a) * BAL.spawnR * 0.75;
      }
      /** @type {Ghost} */
      const g = { id: this.id++, x, y, vx: 0, vy: 0, sp: 0, seq: this.seq(w.m), i: 0, sz: w.s, boss: w.boss, heal: false, ph: 1 };
      this.aim(g, BAL.v0 * w.v * (w.boss ? BAL.bossK : 0.9 + this.r() * 0.2));
      if (w.boss) this.bossEnter(g);
      this.ghosts.push(g);
    }
  }

  /** Boss lướt vào từ ngoài mép phải màn hình (lúc xuất hiện, sang pha 2, sau khi cắn). Giữ nguyên g.sp. */
  bossEnter(g) {
    g.x = W + 220; g.y = 175;
    g.vx = -BAL.bossEnter; g.vy = 0;
    g.ent = 1;
  }

  spawnHealGhost() {
    const dir = this.r() < 0.5 ? 1 : -1;
    this.ghosts.push({
      id: this.id++, x: dir > 0 ? -160 : W + 160, y: 130 + this.r() * 70, vx: BAL.healSpeed * dir, vy: 0, sp: BAL.healSpeed,
      seq: ['HEART'], i: 0, sz: 1, boss: false, heal: true, ph: 1,
    });
    this.ev.push({ k: 'healspawn' });
  }

  /** @param {number} dt giây */
  tick(dt) {
    if (this.over || this.cleared || this.won || this.finale) return;
    this.t += dt;
    this.boltCd = Math.max(0, this.boltCd - dt);
    this.shield = Math.max(0, this.shield - dt);

    while (this.waves.length && this.waves[0].t <= this.t) {
      const w = /** @type {any} */ (this.waves.shift());
      this.spawn(w);
      this.ev.push({ k: 'wave', n: this.wave, of: this.nWaves, boss: w.boss });
    }

    // Ma tim CHỈ xuất hiện khi thiếu máu; đếm giờ chỉ chạy khi thiếu máu.
    if (!this.tut && this.hp < BAL.hp && !this.ghosts.some((g) => g.heal) && (this.healCd -= dt) <= 0) {
      this.spawnHealGhost();
      this.healCd = this.cfg.heal;
    }

    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.x += g.vx * dt;
      if (g.heal) {   // bay ngang lượn sóng rồi ra khỏi màn, không gây sát thương
        g.y += Math.sin(this.t * 2 + g.id) * 30 * dt;
        if (g.x < -200 || g.x > W + 200) this.ghosts.splice(i, 1);   // ±200: màn rộng nhìn thêm tới 120 mỗi bên
        continue;
      }
      g.y += g.vy * dt;
      if (g.ent) {   // boss đang lướt vào: tới chỗ thì mới bắt đầu tiến về nhân vật
        if (g.x <= W - 140) { g.ent = 0; this.aim(g, g.sp); }
        continue;
      }
      if (this.shield > 0 && distToDog(g) < BAL.shieldR + 30 * g.sz) {   // lá chắn: hất ngược ra, không cắn được
        this.push(g, BAL.shieldR + 30 * g.sz + 70);
        this.ev.push({ k: 'block', x: g.x, y: g.y });
        continue;
      }
      if (!this.tut && distToDog(g) < BAL.hitR * Math.pow(g.sz, 0.7)) {
        this.damage(g.boss ? 2 : 1);
        if (g.boss) this.bossEnter(g);   // boss cắn xong bay ra rồi lướt vào lại từ mép phải
        else this.ghosts.splice(i, 1);
      }
    }

    if (this.ghosts.some((g) => g.boss) && (this.symT += dt) > BAL.symEvery) {
      this.symT = 0;
      this.syms.push({ x: CX + (this.r() - 0.5) * 300, y: -20, vy: BAL.symSpeed, ch: SYMBOLS[(this.r() * SYMBOLS.length) | 0], w: BAL.symWarn });
    }
    for (let i = this.syms.length - 1; i >= 0; i--) {
      const s = this.syms[i];
      if (s.w > 0) { s.w -= dt; continue; }   // đang báo trước: vòng trên mặt đất nhấp nháy, chưa rơi
      s.y += s.vy * dt;
      if (this.shield > 0 && Math.abs(s.x - CX) < BAL.shieldR && s.y > CY - BAL.shieldR - 10) {   // lá chắn phá đồ rơi
        this.ev.push({ k: 'pop', x: s.x, y: s.y });
        this.syms.splice(i, 1);
        continue;
      }
      if (s.y > CY - 20) {
        if (!this.tut && Math.abs(s.x - CX) < BAL.symHitR) this.damage(1);
        this.syms.splice(i, 1);
      }
    }

    if (this.hp <= 0) {
      this.over = true;
      this.ev.push({ k: 'over' });
    } else if (!this.tut && !this.waves.length && !this.ghosts.some((g) => !g.heal)) {
      this.ghosts = [];
      this.syms = [];
      if (this.level === LAST) this.won = true; else this.cleared = true;
      this.ev.push({ k: 'clear' });
    }
  }

  damage(n) {
    this.hp = Math.max(0, this.hp - n);
    this.ev.push({ k: 'hit' });
  }

  /**
   * Người chơi tung bùa.
   * - Ngang / dọc / chéo: trúng mọi ma (đang chờ đúng bùa) nằm dọc đường vẽ, kéo dài hết màn hình.
   * - V lên / V xuống: trúng mọi ma trong khung chữ V.
   * - Không con nào trong vùng (hoặc không có geo, hoặc bùa tim): trúng con GẦN NHÂN VẬT nhất.
   * - Sét: mọi ma thường mất 1 bùa + phá hết ký tự rơi, hồi chiêu BAL.boltCd.
   * @param {Spell} s
   * @param {import('./recognizer.js').StrokeGeo|null} [geo] hình học nét vẽ
   * @returns {boolean} có trúng không
   */
  cast(s, geo = null) {
    if (s === 'SHIELD') {
      if (this.shieldUsed) { this.ev.push({ k: 'miss', shield: true }); return false; }
      this.shieldUsed = true;
      this.shield = BAL.shieldSec;
      this.ev.push({ k: 'shield' });
      for (const g of this.ghosts) {   // hất mọi ma ở gần ra xa
        const d = distToDog(g);
        if (!g.heal && d < BAL.shieldR * 2) this.push(g, d + BAL.shieldPush);
      }
      for (const sy of this.syms) this.ev.push({ k: 'pop', x: sy.x, y: sy.y });
      this.syms = [];
      return true;
    }
    if (s === 'LIGHTNING') {
      const targets = this.ghosts.filter((g) => !g.heal);
      if (this.boltCd > 0 || (!targets.length && !this.syms.length)) {
        this.ev.push({ k: 'miss', cd: this.boltCd > 0 });
        return false;
      }
      this.boltCd = BAL.boltCd;
      this.ev.push({ k: 'bolt' });
      for (const sy of this.syms) this.ev.push({ k: 'pop', x: sy.x, y: sy.y });
      this.syms = [];
      for (const g of targets) this.advance(g, s);
      return true;
    }
    // Bùa quét: trúng MỌI ma đang chờ đúng bùa này nằm trên đường/vùng vẽ.
    let hits = geo && AREA.has(s) ? this.ghosts.filter((g) => g.seq[g.i] === s && inArea(s, geo, g)) : [];
    const fallback = !hits.length;
    if (fallback) {   // không con nào trong vùng (hoặc bùa tim): đánh con gần nhân vật nhất như cũ
      let best = null;
      for (const g of this.ghosts) {
        if (g.seq[g.i] === s && (!best || distToDog(g) < distToDog(best))) best = g;
      }
      if (!best) { this.ev.push({ k: 'miss' }); return false; }
      hits = [best];
    }
    if (geo && AREA.has(s)) this.ev.push({ k: 'area', s, geo, n: hits.length, fb: fallback });
    if (hits.length > 1) {
      this.score += BAL.comboBonus * (hits.length - 1);
      this.ev.push({ k: 'combo', n: hits.length, x: geo ? geo.cx : CX, y: geo ? geo.cy : CY });
    }
    for (const g of hits) this.advance(g, s);
    return true;
  }

  /** @param {Ghost} g @param {Spell} s */
  advance(g, s) {
    if (++g.i < g.seq.length) { this.ev.push({ k: 'step', x: g.x, y: g.y, s }); return; }
    const { x, y } = g;
    if (g.heal) {
      this.hp = Math.min(BAL.hp, this.hp + BAL.heal);
      this.remove(g);
      this.ev.push({ k: 'heal', x, y });
      return;
    }
    if (g.boss && g.ph === 1) {   // pha 2: chuỗi bùa mới, lướt vào lại từ mép phải, nhanh hơn
      g.ph = 2; g.i = 0; g.seq = this.seq(g.seq.length);
      g.sp *= BAL.bossPhase2;
      this.bossEnter(g);
      this.ev.push({ k: 'phase' });
      return;
    }
    if (g.boss) {   // hết bùa pha cuối: giữ boss lại cho đòn kết liễu (Session diễn, rồi gọi finishBoss)
      g.vx = g.vy = 0; g.ent = 0;
      this.ghosts = [g];
      this.syms = [];
      this.shield = 0;
      this.finale = g;
      this.ev.push({ k: 'finale', x, y });
      return;
    }
    const pts = 10 * g.seq.length * (g.boss ? 10 : 1);
    this.remove(g);
    this.kills++;
    this.score += pts;
    this.ev.push({ k: 'kill', x, y, s, boss: g.boss, pts });
  }

  /**
   * Màn tập: đặt 1 con ma đứng yên tại (x, y).
   * @param {number} x @param {number} y @param {Spell[]} seq @param {boolean} [heal]
   * @returns {Ghost}
   */
  place(x, y, seq, heal = false) {
    /** @type {Ghost} */
    const g = { id: this.id++, x, y, vx: 0, vy: 0, sp: 0, seq, i: 0, sz: 1, boss: false, heal, ph: 1 };
    this.ghosts.push(g);
    return g;
  }

  /** Màn tập: thả 1 ký tự rơi chậm tại x, bắt đầu từ độ cao y. */
  drop(x, vy = 45, y = -20) { this.syms.push({ x, y, vy, ch: '🎃', w: 0 }); }

  /** Kết thúc đòn kết liễu: boss biến mất, cộng điểm, thắng game. */
  finishBoss() {
    const g = this.finale;
    if (!g) return;
    this.remove(g);
    this.kills++;
    this.score += 10 * g.seq.length * 10;
    this.finale = null;
    this.won = true;
  }

  /** Đẩy ma g ra xa tâm nhân vật tới khoảng cách r (giữ hướng bay về nhân vật). @param {Ghost} g */
  push(g, r) {
    const dx = g.x - CX, dy = g.y - CY, d = Math.hypot(dx, dy) || 1;
    g.x = CX + (dx / d) * r;
    g.y = Math.min(CY - 40, CY + (dy / d) * r);   // không đẩy xuống dưới mặt đất
    this.aim(g, g.sp);
  }

  /** @param {Ghost} g */
  remove(g) { const i = this.ghosts.indexOf(g); if (i >= 0) this.ghosts.splice(i, 1); }   // i < 0: đã bị dọn (vd boss vào đòn kết liễu)

  /** Chạm vào ký tự rơi để phá. @returns {number} số ký tự phá được */
  pop(x, y) {
    let n = 0;
    for (let i = this.syms.length - 1; i >= 0; i--) {
      const s = this.syms[i];
      if (Math.hypot(s.x - x, s.y - y) < BAL.popR) {
        this.ev.push({ k: 'pop', x: s.x, y: s.y });
        this.syms.splice(i, 1);
        this.score += 5;
        n++;
      }
    }
    return n;
  }
}
