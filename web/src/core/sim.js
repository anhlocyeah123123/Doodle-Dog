// @ts-check
// Logic game THUẦN: không DOM, canvas, âm thanh hay mạng.
// -> chạy được trong test/bot, và sau này dùng chung cho chế độ online.
//
// Giao tiếp ra ngoài chỉ qua mảng `ev` (sự kiện). Lớp hiển thị đọc rồi xóa mỗi khung hình:
//   wave {n, of, boss}        đợt ma mới xuất hiện
//   healspawn                 ma tim xuất hiện
//   step {x, y, s}            1 bùa trúng, ma còn bùa
//   cast {s, targets}         bùa trúng các ma (mọi ma đang chờ đúng ký hiệu đó) -> vẽ tia tới từng con
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
//   locked {s}                vẽ bùa chưa mở khóa (chưa lấy lại trang sách)
//   slow                      bật đồng hồ cát · armor {x, y} ma khiên vỡ khiên
//   throw {ch}                boss ném đồ · dark  Vua Mực tắt đèn
//   chain {n, mult}           hệ số chuỗi tăng · chainbreak {n} mất chuỗi
//   flip {x, y}               Ma Sách đổi ký hiệu · gloom / light  nến tắt / thắp lại (Đèn Chùm)
//   heads {x, y}              Bí Ngô thả bí con · brew {x, y}  Phù Thủy Vạc cho ma mọc thêm ký hiệu
//   pal {who, x, y}           bạn đồng hành ra tay (mun | frog | bat), x,y = con ma bị nhắm · palwait {who, cd, none} chưa gọi được
import { CX, CY, BAL, POOL, LEVELS, LAST, W, TUTORIAL, hasSpell, palsAt, MIRROR } from './config.js';

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
 * @property {string} [kind] wisp | swarm | inv | knight (ma thường) · khóa boss (book, chand...) với boss
 * @property {number} [brk]  thời điểm (sim.t) ma khiên vỡ khiên
 * @property {number} [hitT] thời điểm boss trúng bùa gần nhất (để vẽ động tác bị trúng)
 * @property {number} [atk]  thời điểm boss ném đồ gần nhất
 * @property {number} [flipAt] Ma Sách: thời điểm (sim.t) ký hiệu hiện tại sẽ tự đổi
 * @property {boolean} [inv]  Vua Mực pha 2: hiển thị ký hiệu ĐẢO
 * @property {number} [brewT] thời điểm vừa bị Phù Thủy cho uống thuốc
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
export class Sim {
  /** @param {number} [spellLv] màn dùng để xét bùa đã mở khóa (mặc định = level; màn tập = chỉ bùa cơ bản) */
  constructor(seed = 1, level = 1, hp = BAL.hp, score = 0, spellLv = level || 1) {
    this.spellLv = spellLv;
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
    this.slow = 0;             // giây đồng hồ cát còn lại
    this.slowUsed = false;
    this.dark = 0;             // giây tắt đèn còn lại (Vua Mực pha 2)
    this.darkT = 0;
    /** Bạn đồng hành: đếm giờ lệch nhau để không ra tay cùng lúc. */
    this.pals = this.tut ? [] : palsAt(l).map((who) => ({ who, cd: BAL.palStart, max: { mun: BAL.munEvery, frog: BAL.frogEvery, bat: BAL.batEvery }[who] }));
    this.cleared = false;
    this.won = false;
    // chuỗi + kết quả màn
    this.chain = 0; this.maxChain = 0; this.hp0 = this.hp; this.hpLost = 0;
    // cơ chế boss
    this.gloom = 0; this.mechT = 0;
  }

  /** Hệ số điểm theo chuỗi hiện tại (x1, x1.5, x2 ... tối đa BAL.chainMax). */
  get mult() { return Math.min(BAL.chainMax, 1 + Math.floor(this.chain / BAL.chainStep) * BAL.chainAdd); }

  /** Vẽ trúng: tăng chuỗi. */
  chainUp() {
    const m0 = this.mult;
    this.chain++; this.maxChain = Math.max(this.maxChain, this.chain);
    if (this.mult > m0) this.ev.push({ k: 'chain', n: this.chain, mult: this.mult });
  }

  /** Trượt / bị cắn: mất chuỗi. */
  chainBreak() {
    if (this.chain >= BAL.chainStep) this.ev.push({ k: 'chainbreak', n: this.chain });
    this.chain = 0;
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
    const shared = w.kind === 'swarm' ? this.seq(w.m) : null;   // đàn ma con: cả đàn chung 1 chuỗi ký hiệu
    for (let i = 0; i < w.n; i++) {
      let x = CX, y = -70;
      if (w.boss) { x = W + 220; y = 175; }
      else {
        const slot = (i + 0.5) / w.n + (this.r() - 0.5) * (0.7 / w.n);   // vị trí đều + chút ngẫu nhiên
        const a = Math.PI * (1.04 + 0.92 * Math.min(1, Math.max(0, slot)));   // từ trái (≈180°) qua đỉnh tới phải (≈360°)
        x = CX + Math.cos(a) * BAL.spawnR;
        y = CY + Math.sin(a) * BAL.spawnR * 0.75;
      }
      /** @type {Spell[]} */
      let seq = shared ? shared.slice() : this.seq(w.m);
      if (w.kind === 'knight') seq = ['LIGHTNING', ...seq];
      /** @type {Ghost} */
      const g = { id: this.id++, x, y, vx: 0, vy: 0, sp: 0, seq, i: 0, sz: w.s, boss: w.boss, heal: false, ph: 1,
        kind: w.boss ? (this.cfg.boss?.key || 'book') : w.kind };
      this.aim(g, BAL.v0 * w.v * (w.boss ? BAL.bossK : 0.9 + this.r() * 0.2));
      if (w.boss) this.bossEnter(g);
      this.ghosts.push(g);
    }
  }

  /** Boss lướt vào từ ngoài mép phải màn hình (lúc xuất hiện, sang pha 2, sau khi cắn). Giữ nguyên g.sp. */
  bossEnter(g) {
    g.x = W + 220; g.y = 175; g.flipAt = undefined;
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
    this.slow = Math.max(0, this.slow - dt);
    this.dark = Math.max(0, this.dark - dt);
    const k = this.slow > 0 ? BAL.slowK : 1;   // đồng hồ cát: ma + đồ rơi chậm lại

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
      g.x += g.vx * dt * (g.heal ? 1 : k);
      if (g.heal) {   // bay ngang lượn sóng rồi ra khỏi màn, không gây sát thương
        g.y += Math.sin(this.t * 2 + g.id) * 30 * dt;
        if (g.x < -200 || g.x > W + 200) this.ghosts.splice(i, 1);   // ±200: màn rộng nhìn thêm tới 120 mỗi bên
        continue;
      }
      g.y += g.vy * dt * k;
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

    const boss = this.ghosts.find((g) => g.boss);
    if (boss && !boss.ent && (this.symT += dt * k) > BAL.symEvery) {
      this.symT = 0;
      const drops = this.cfg.boss?.drops || ['drop_pumpkin'];
      const ch = drops[(this.r() * drops.length) | 0];
      this.syms.push({ x: CX + (this.r() - 0.5) * 300, y: -20, vy: BAL.symSpeed, ch, w: BAL.symWarn });
      boss.atk = this.t;
      this.ev.push({ k: 'throw', ch });
    }
    // Vua Mực pha 2: thỉnh thoảng tắt đèn
    if (boss && this.cfg.boss?.king && boss.ph === 2 && !boss.ent && (this.darkT += dt) > BAL.darkEvery) {
      this.darkT = 0; this.dark = BAL.darkSec;
      this.ev.push({ k: 'dark' });
    }
    for (const p of this.pals) p.cd = Math.max(0, p.cd - dt);
    this.gloom = Math.max(0, this.gloom - dt);
    if (boss && !boss.ent) this.bossMech(boss, dt);
    for (let i = this.syms.length - 1; i >= 0; i--) {
      const s = this.syms[i];
      if (s.w > 0) { s.w -= dt; continue; }   // đang báo trước: vòng trên mặt đất nhấp nháy, chưa rơi
      s.y += s.vy * dt * k;
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
    this.hpLost += Math.min(n, this.hp);
    this.hp = Math.max(0, this.hp - n);
    this.chainBreak();
    this.ev.push({ k: 'hit' });
  }

  /**
   * Người chơi tung bùa.
   * - Ký hiệu thường (ngang, dọc, chéo, V, tim): trúng MỌI ma đang chờ đúng ký hiệu đó, vẽ ở đâu cũng được.
   * - Sét: mọi ma thường mất 1 bùa + phá hết ký tự rơi, hồi chiêu BAL.boltCd.
   * - Vòng quanh nhân vật: lá chắn (1 lần mỗi màn).
   * @param {Spell} s
   * @param {import('./recognizer.js').StrokeGeo|null} [geo] hình học nét vẽ (giữ để tương thích, không ảnh hưởng ai bị trúng)
   * @returns {boolean} có trúng không
   */
  cast(s, geo = null) {
    if (!hasSpell(this.spellLv, s)) { this.ev.push({ k: 'locked', s }); return false; }
    if (s === 'HOURGLASS') {
      if (this.slowUsed) { this.ev.push({ k: 'miss', slow: true }); return false; }
      this.slowUsed = true;
      this.slow = BAL.slowSec;
      this.ev.push({ k: 'slow' });
      return true;
    }
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
      this.chainUp();
      if (this.gloom > 0) { this.gloom = 0; this.ev.push({ k: 'light' }); }
      for (const sy of this.syms) this.ev.push({ k: 'pop', x: sy.x, y: sy.y });
      this.syms = [];
      for (const g of targets) this.advance(g, s);
      return true;
    }
    // Vẽ ký hiệu nào: MỌI con ma đang chờ đúng ký hiệu đó đều mất nó cùng lúc, ở đâu trên màn hình cũng vậy
    // (giống Google Doodle 2016). Ma chỉ còn 1 ký hiệu thì bị diệt, ma nhiều ký hiệu thì gạch ký hiệu đầu.
    const hits = this.ghosts.filter((g) => g.seq[g.i] === s);
    if (!hits.length) { this.ev.push({ k: 'miss' }); this.chainBreak(); return false; }
    this.chainUp();
    this.ev.push({ k: 'cast', s, targets: hits.map((g) => ({ x: g.x, y: g.y })) });
    if (hits.length > 1) {
      this.score += Math.round(BAL.comboBonus * (hits.length - 1) * this.mult);
      this.ev.push({ k: 'combo', n: hits.length, x: CX, y: CY });
    }
    for (const g of hits) this.advance(g, s);
    return true;
  }

  /** @param {Ghost} g @param {Spell} s */
  advance(g, s) {
    if (g.boss) { g.hitT = this.t; g.flipAt = this.t + BAL.bookFlip; }
    if (g.kind === 'knight' && g.i === 0 && !g.brk) { g.brk = this.t; this.ev.push({ k: 'armor', x: g.x, y: g.y }); }
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
      if (this.cfg.boss?.king) {   // Vua Mực pha 2: hiển thị ĐẢO -> chỉ dùng ký hiệu có cặp đảo (bỏ chéo)
        const pairs = /** @type {Spell[]} */ (Object.keys(MIRROR));
        g.seq = g.seq.map(() => pairs[(this.r() * pairs.length) | 0]);
        g.inv = true;
      }
      g.sp *= BAL.bossPhase2;
      this.bossEnter(g);
      this.ev.push({ k: 'phase' });
      return;
    }
    if (g.boss && this.level === LAST) {   // boss CUỐI hết bùa pha cuối: giữ lại cho đòn kết liễu (Session diễn, rồi gọi finishBoss)
      g.vx = g.vy = 0; g.ent = 0;
      this.ghosts = [g];
      this.syms = [];
      this.shield = 0;
      this.finale = g;
      this.ev.push({ k: 'finale', x, y });
      return;
    }
    const pts = Math.round(10 * g.seq.length * (g.boss ? 10 : 1) * this.mult);
    if (g.boss) { this.syms = []; this.dark = 0; this.gloom = 0; this.ghosts = this.ghosts.filter((q) => q.kind !== 'head'); }   // boss trang sách gục: đồ đang rơi tan luôn
    this.remove(g);
    this.kills++;
    this.score += pts;
    this.ev.push({ k: 'kill', x, y, s, boss: g.boss, pts });
  }

  /** Cơ chế riêng của từng boss (chỉ chạy khi boss đã vào sân). @param {Ghost} b @param {number} dt */
  bossMech(b, dt) {
    const key = this.cfg.boss?.key;
    if (key === 'book') {   // lật trang: ký hiệu hiện tại tự đổi nếu vẽ chậm
      if (b.flipAt == null) b.flipAt = this.t + BAL.bookFlip;
      if (this.t >= b.flipAt) {
        const cur = b.seq[b.i], opts = POOL.filter((q) => q !== cur);
        b.seq[b.i] = opts[(this.r() * opts.length) | 0];
        b.flipAt = this.t + BAL.bookFlip;
        this.ev.push({ k: 'flip', x: b.x, y: b.y });
      }
      return;
    }
    if ((this.mechT += dt) < ({ chand: BAL.gloomEvery, pumpkin: BAL.headsEvery, cauldron: BAL.brewEvery }[key] ?? 1e9)) return;
    this.mechT = 0;
    if (key === 'chand') {   // thổi tắt nến: ký hiệu ma thường bị che
      this.gloom = BAL.gloomSec;
      this.ev.push({ k: 'gloom' });
    } else if (key === 'pumpkin') {   // 2 bí ngô con mang CÙNG ký hiệu hiện tại của boss
      for (const dx of [-90, 90]) {
        /** @type {Ghost} */
        const h = { id: this.id++, x: b.x + dx, y: b.y + 40, vx: 0, vy: 0, sp: 0, seq: [b.seq[b.i]], i: 0, sz: 0.8, boss: false, heal: false, ph: 1, kind: 'head' };
        this.aim(h, BAL.headsSpeed);
        this.ghosts.push(h);
      }
      this.ev.push({ k: 'heads', x: b.x, y: b.y });
    } else if (key === 'cauldron') {   // thuốc: 1 con ma thường mọc thêm 1 ký hiệu
      const list = this.ghosts.filter((g) => !g.boss && !g.heal && g.seq.length - g.i < BAL.brewMax && g.seq[g.i] !== 'LIGHTNING');
      if (!list.length) return;
      const g = list[(this.r() * list.length) | 0];
      g.seq.push(POOL[(this.r() * POOL.length) | 0]);
      g.brewT = this.t;
      this.ev.push({ k: 'brew', x: g.x, y: g.y, bx: b.x, by: b.y });
    }
  }

  /** Kết quả màn: máu mất, chuỗi dài nhất. */
  get result() { return { hpLost: this.hpLost, maxChain: this.maxChain, score: this.score }; }

  /**
   * Người chơi chạm biểu tượng bạn đồng hành để gọi kỹ năng.
   * @param {string} who mun | frog | bat
   * @returns {boolean} gọi được không (chưa hồi chiêu / không có ma để nhắm -> false, sự kiện palwait)
   */
  usePal(who) {
    const p = this.pals.find((q) => q.who === who);
    if (!p || this.over || this.cleared || this.won || this.finale) return false;
    if (p.cd > 0) { this.ev.push({ k: 'palwait', who, cd: p.cd }); return false; }
    const foes = this.ghosts.filter((g) => !g.boss && !g.heal && !g.ent);
    const soft = foes.filter((g) => g.seq[g.i] !== 'LIGHTNING');   // ma còn khiên: chỉ sét phá được
    const near = (list) => list.reduce((a, b) => (distToDog(a) < distToDog(b) ? a : b));
    if (who === 'mun' || who === 'frog') {
      const boss = this.ghosts.find((g) => g.boss && !g.ent);
      // Mun nhắm được cả boss (xóa 1 ký hiệu); Ộp chỉ nuốt ma thường
      const list = who === 'mun' && !soft.length && boss && boss.seq[boss.i] !== 'LIGHTNING' ? [boss] : soft;
      if (!list.length) { this.ev.push({ k: 'palwait', who, cd: 0, none: true }); return false; }
      const g = near(list);
      this.ev.push({ k: 'pal', who, x: g.x, y: g.y });
      if (who === 'frog') g.i = g.seq.length - 1;
      this.advance(g, g.seq[g.i]);
    } else {
      if (!foes.length && !this.syms.length) { this.ev.push({ k: 'palwait', who, cd: 0, none: true }); return false; }
      this.ev.push({ k: 'pal', who, x: CX, y: CY });
      for (const g of foes) this.push(g, distToDog(g) + BAL.batPush);
      for (const sy of this.syms) this.ev.push({ k: 'pop', x: sy.x, y: sy.y });
      this.syms = [];
    }
    p.cd = p.max;
    return true;
  }

  /**
   * Màn tập: đặt 1 con ma đứng yên tại (x, y).
   * @param {number} x @param {number} y @param {Spell[]} seq @param {boolean} [heal]
   * @returns {Ghost}
   */
  place(x, y, seq, heal = false, kind = 'wisp') {
    /** @type {Ghost} */
    const g = { id: this.id++, x, y, vx: 0, vy: 0, sp: 0, seq, i: 0, sz: 1, boss: false, heal, ph: 1, kind };
    this.ghosts.push(g);
    return g;
  }

  /** Màn tập: thả 1 ký tự rơi chậm tại x, bắt đầu từ độ cao y. */
  drop(x, vy = 45, y = -20) { this.syms.push({ x, y, vy, ch: 'drop_pumpkin', w: 0 }); }

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
