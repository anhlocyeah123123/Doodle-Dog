// @ts-check
// Một phiên chơi: điều phối trạng thái màn, nối Sim (luật) với hiệu ứng, âm thanh và animation nhân vật.
//
//   cutscene (phim mở đầu) ──> tutorial (màn tập) ──> intro màn 1     [lần đầu chơi, bỏ qua được]
//   intro ──(chạy vào giữa)──> play ──┬─ qua màn ──> clear ──(chạm)──> intro màn sau
//                                     ├─ hết máu ──> over  ──(chạm)──> intro màn đó
//                                     └─ hạ boss ──> won   ──(chạm)──> về menu
import { CX, GY, CY, BAL, LEVELS, LAST, SPELL_ANIM, DEFAULT_CAST_ANIM, SPELL_COLOR } from '../core/config.js';
import { Sim } from '../core/sim.js';
import { recognize, strokeGeometry } from '../core/recognizer.js';
import { Effects } from './effects.js';
import { audio } from '../engine/audio.js';
import { bolt } from '../render/ink.js';
import { areaFx } from '../render/sigil.js';
import { CUES, DURATION } from '../render/cutscene.js';
import { Tutorial } from './tutorial.js';

const SIGIL_Y = GY - 190;   // trận pháp nổi trên đầu nhân vật
const SIGIL_RATE = 1.25;    // ~0.8 giây
let fxId = 1;

const TAP_LEN = 25;      // nét ngắn hơn = chạm (để phá ký tự rơi)
const OVERLAY_WAIT = 0.9; // chờ trước khi nhận chạm ở bảng kết quả (tránh bấm nhầm)

/** Giữ tối đa ~40 điểm của nét (cho hiệu ứng "nét bay"). */
const thin = (pts) => {
  const step = Math.max(1, Math.floor(pts.length / 40));
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => [p[0], p[1]]);
};

/** Đã xem phim mở đầu + học xong màn tập chưa (lần sau bấm "Chơi ngay" vào thẳng màn 1). */
export const tutorialSeen = {
  get() { try { return localStorage.getItem('dd-tut') === '1'; } catch { return false; } },
  set() { try { localStorage.setItem('dd-tut', '1'); } catch { /* bỏ qua */ } },
};

/** Âm thanh cho các mốc trong phim mở đầu (render/cutscene.js -> CUES). */
const CUE_SOUND = {
  thunder: () => audio.sfx('4', 0.8, 0.5),
  whoosh: () => audio.sfx('3', 0.35, 0.55),
  grab: () => audio.sfx('5', 1, 0.8),
  laugh: () => audio.arp([2, 1.68, 2, 1.68], 0.35),
  angry: () => audio.sfx('4', 0.5, 1.3),
  title: () => audio.arp([1, 1.26, 1.5, 2]),
};

export const progress = {
  get() { try { return Number(localStorage.getItem('dd-lv')) || 1; } catch { return 1; } },
  set(l) { try { if (l > this.get()) localStorage.setItem('dd-lv', String(Math.min(l, LAST))); } catch { /* bỏ qua */ } },
};

export class Session {
  /**
   * @param {import('../engine/assets.js').Assets} A
   * @param {{pts:number[][], down:boolean, fade:number, touch:boolean}} trail
   * @param {{onBackground:(bg:string)=>void, onMenu:()=>void, onSkippable:(on:boolean)=>void}} hooks
   */
  constructor(A, trail, hooks) {
    this.A = A;
    this.trail = trail;
    this.hooks = hooks;
    this.fx = new Effects();
    this.clock = 0;
    this.state = 'idle';
    /** @type {Sim|null} */ this.sim = null;
    this.dog = { state: 'idle', t0: 0, timer: 0, x: CX, flip: false };
    this.introT = 0;
    this.alertT = 0;
    this.overlayT = 0;
    this.missT = 0;
    /** @type {{a:string,b:string}|null} */ this.msg = null;
    /** @type {Tutorial|null} */ this.tut = null;
    this.cutT = 0;     // thời gian trong phim mở đầu
    this.cueI = 0;     // mốc âm thanh tiếp theo
    this.tutEnd = 0;   // đếm ngược từ lúc học xong tới màn 1
  }

  /** Phim mở đầu -> màn tập -> màn 1. */
  startStory() {
    this.sim = null;
    this.tut = null;
    this.fx.reset();
    this.msg = null;
    this.state = 'cutscene';
    this.cutT = 0; this.cueI = 0;
    this.hooks.onBackground('bg1');
    this.hooks.onSkippable(true);
  }

  startTutorial() {
    this.sim = new Sim(7, 0);
    this.fx.reset();
    this.tut = new Tutorial(this.sim, this.fx);
    this.msg = null;
    this.tutEnd = 0;
    this.state = 'tutorial';
    this.dog = { state: 'idle', t0: this.clock, timer: 0, x: CX, flip: false };
    this.hooks.onBackground('bg1');
    this.hooks.onSkippable(true);
  }

  /** Nút "Bỏ qua": phim -> màn tập, màn tập -> màn 1. */
  skip() {
    if (this.state === 'cutscene') this.startTutorial();
    else if (this.state === 'tutorial') this.endTutorial();
  }

  endTutorial() {
    tutorialSeen.set();
    this.tut = null;
    this.begin(1);
  }

  begin(level, hp = BAL.hp, score = 0) {
    this.hooks.onSkippable(false);
    this.tut = null;
    this.tutEnd = 0;
    this.sim = new Sim((Date.now() & 0xffff) + level, level, hp, score);
    this.hooks.onBackground(LEVELS[level].bg);
    if (LEVELS[level + 1]) new Image().src = `assets/img/${LEVELS[level + 1].bg}.webp`;   // nạp trước nền màn sau
    this.fx.reset();
    this.msg = null;
    this.state = 'intro';
    this.introT = BAL.introSec;
    this.overlayT = 0;
    this.dog = { state: 'run', t0: this.clock, timer: 0, x: -120, flip: false };
    this.fx.toast(`Màn ${level}: ${LEVELS[level].name}`, 'level', 2.6);
    progress.set(level);
  }

  anim(name, dur = 0) {
    this.dog.state = name;
    this.dog.t0 = this.clock;
    this.dog.timer = dur;
  }

  /** Thời lượng 1 lượt animation (để biết khi nào quay về idle). */
  clip(name) {
    const s = this.A.sprites[name];
    return s ? Math.max(0.45, s.n / s.fps) : 0.5;
  }

  /** Người chơi nhấc tay. @param {number[][]} pts  @param {boolean} [touch] vẽ bằng ngón tay */
  stroke(pts, touch = false) {
    const sim = this.sim;
    if ((this.state !== 'play' && this.state !== 'tutorial') || !sim) return;
    this.tut?.tried();
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (len < TAP_LEN) {   // chạm = phá ký tự rơi
      if (sim.pop(pts[0][0], pts[0][1])) audio.sfx('3', 0.5, 1.8);
      return;
    }
    const s = recognize(pts, { touch });
    if (!s) {   // không nhận ra: trận pháp '?' mờ + gợi ý (tối đa 1 lần / 4 giây)
      this.fx.add({ t: 'sigil', x: this.dog.x, y: SIGIL_Y, s: null, ok: false, id: fxId++, pts: thin(pts), rate: SIGIL_RATE });
      if (this.tut) this.tut.fail();
      else if (this.missT <= 0) { this.fx.toast('Chưa nhận ra bùa — vẽ dứt khoát hơn nhé', 'warn', 1.6); this.missT = 4; }
      return;
    }
    const ok = sim.cast(/** @type {any} */ (s), strokeGeometry(pts));
    const a = SPELL_ANIM[s] || DEFAULT_CAST_ANIM;
    this.fx.add({ t: 'sigil', x: this.dog.x, y: SIGIL_Y, s, ok, id: fxId++, pts: thin(pts), rate: SIGIL_RATE });
    this.anim(a, this.clip(a));
    if (s === 'LIGHTNING') audio.sfx('4', 0.8); else audio.sfx('3', 0.7, 0.95 + Math.random() * 0.2);
  }

  /** Chạm vào bảng kết quả. */
  tap() {
    const sim = this.sim;
    if (!sim || this.overlayT < OVERLAY_WAIT) return;
    if (this.state === 'clear') this.begin(sim.level + 1, Math.min(BAL.hp, sim.hp + 1), sim.score);
    else if (this.state === 'over') this.begin(sim.level);
    else if (this.state === 'won') this.hooks.onMenu();
  }

  /** Chuyển sự kiện của Sim thành hiệu ứng + âm thanh. */
  handleEvents() {
    const sim = /** @type {Sim} */ (this.sim), fx = this.fx;
    for (const e of sim.ev.splice(0)) {
      switch (e.k) {
        case 'wave':
          fx.toast(e.boss ? '⚠ BOSS xuất hiện!' : `Đợt ma ${e.n}/${e.of}!`, e.boss ? 'boss' : 'warn');
          this.alertT = 1.4;
          if (e.boss) { fx.shake = 0.5; audio.sfx('4', 0.5, 0.6); }
          break;
        case 'healspawn':
          if (!this.tut) fx.toast('Ma trái tim xuất hiện — vẽ ♥ để hồi máu', 'info', 3);
          break;
        case 'step':
          fx.burst(e.x, e.y, 5, ['#1b1bb8', '#fff']);
          if (e.s === 'LIGHTNING') fx.add({ t: 'bolt', p: bolt(e.x + 60, -10, e.x, e.y) });
          break;
        case 'kill': {
          fx.burst(e.x, e.y, e.boss ? 40 : 14, ['#1b1bb8', '#fff', '#9be7ff']);
          fx.burst(e.x, e.y - 20, 1, ['#fff'], '+' + e.pts, 24);
          audio.sfx('3', 0.5, 1.4);
          if (e.s === 'LIGHTNING') fx.add({ t: 'bolt', p: bolt(e.x + 60, -10, e.x, e.y) });
          else fx.add({ t: 'ring', x: e.x, y: e.y });
          if (e.boss) { fx.flash = 0.5; fx.shake = 0.6; }
          break;
        }
        case 'heal':
          fx.burst(e.x, e.y, 8, ['#ff6b9a'], '♥');
          fx.burst(this.dog.x, 330, 6, ['#ff6b9a'], '♥');
          fx.toast('+1 máu!', 'info', 1.4);
          audio.arp([1.5, 2]);
          break;
        case 'area':   // tia quét / vùng nổ đúng theo nét vẽ (bỏ qua khi chỉ đánh con gần nhất)
          if (!e.fb) fx.add({ ...areaFx(e.s, e.geo, SPELL_COLOR[e.s], fxId++), rate: 2 });
          break;
        case 'combo':
          fx.toast(`Combo x${e.n}! +${BAL.comboBonus * (e.n - 1)}`, 'info', 1.3);
          audio.arp([1.26, 1.5, 2].slice(0, Math.min(3, e.n)), 0.5);
          break;
        case 'bolt': fx.flash = 0.3; break;
        case 'miss': if (e.cd) fx.toast('Sét đang hồi…', 'warn', 1); else if (this.tut) fx.toast('Chưa đúng bùa — vẽ theo bàn tay nhé', 'warn', 1.4); break;
        case 'phase': fx.toast('Boss nổi giận!', 'boss'); fx.shake = 0.5; audio.sfx('4', 0.5, 0.5); break;
        case 'pop': fx.burst(e.x, e.y, 8, ['#fff', '#ffd23f']); break;
        case 'hit':
          fx.shake = 0.35; fx.red = 0.35;
          this.anim('hit', this.clip('hit'));
          audio.sfx('5', 1);
          break;
      }
    }
  }

  update(dt) {
    this.clock += dt;
    if (this.state === 'cutscene') {   // phim mở đầu: chỉ đếm giờ + phát âm thanh theo mốc
      this.cutT += dt;
      while (this.cueI < CUES.length && CUES[this.cueI][0] <= this.cutT) CUE_SOUND[CUES[this.cueI++][1]]?.();
      if (this.cutT >= DURATION) this.startTutorial();
      return;
    }
    this.fx.update(dt);
    this.alertT -= dt;
    this.missT -= dt;
    if (!this.trail.down && this.trail.fade > 0) this.trail.fade = Math.max(0, this.trail.fade - dt);
    const sim = this.sim;
    if (!sim) return;

    if (this.state === 'intro') {   // chạy từ ngoài màn vào giữa, chậm dần
      this.introT -= dt;
      const k = Math.min(1, 1 - this.introT / BAL.introSec);
      this.dog.x = -120 + (CX + 120) * (1 - (1 - k) ** 2);
      if (this.introT <= 0) { this.dog.x = CX; this.anim('idle'); this.state = 'play'; }
      return;
    }
    if (this.state === 'tutorial' && this.tut) {
      sim.tick(dt);
      this.tut.observe(sim.ev);
      this.handleEvents();
      this.tut.update(dt, this.trail.down);
      this.dogFace(dt);
      if (this.tut.done && !this.tutEnd) {
        this.tutEnd = 2;
        this.anim('win');
        this.fx.toast('Sẵn sàng! Đi lấy lại sách phép thôi!', 'level', 2);
        audio.arp([1, 1.26, 1.5, 2]);
      } else if (this.tutEnd && (this.tutEnd -= dt) <= 0) this.endTutorial();
      return;
    }
    if (this.state !== 'play') { this.overlayT += dt; return; }

    sim.tick(dt);
    this.handleEvents();
    this.dogFace(dt);

    if (sim.over) this.finish('over', 'lose', 'Thua rồi…', `Điểm ${sim.score} · chạm để thử lại màn ${sim.level}`, () => audio.sfx('5', 0.8, 0.7));
    else if (sim.cleared) this.finish('clear', 'win', `Hoàn thành màn ${sim.level}!`, 'Chạm để sang màn tiếp theo (+1 máu)', () => audio.arp([1, 1.26, 1.5, 2]));
    else if (sim.won) this.finish('won', 'win', 'ĐÁNH BẠI BOSS! 🎉', `Điểm ${sim.score} · chạm để về menu`, () => audio.arp([1, 1.26, 1.5, 2, 1.5, 2, 2.5]));
  }

  /** Quay mặt về con ma gần nhất + chọn animation nghỉ (đang vẽ -> wave · vừa có đợt ma -> alert · idle). */
  dogFace(dt) {
    const sim = /** @type {Sim} */ (this.sim);
    let near = null;
    for (const g of sim.ghosts) if (!g.heal && (!near || Math.hypot(g.x - CX, g.y - CY) < Math.hypot(near.x - CX, near.y - CY))) near = g;
    if (near) this.dog.flip = near.x < CX;
    if (this.dog.timer > 0) this.dog.timer -= dt;
    if (this.dog.timer <= 0 && !this.tutEnd) {
      const want = this.trail.down ? 'wave' : this.alertT > 0 ? 'alert' : 'idle';
      if (this.dog.state !== want) this.anim(want);
    }
  }

  finish(state, anim, a, b, sound) {
    this.state = state;
    this.anim(anim);
    this.msg = { a, b };
    this.overlayT = 0;
    sound();
    if (state !== 'over') progress.set(/** @type {Sim} */ (this.sim).level + 1);
  }

  /** Dữ liệu cho lớp vẽ. */
  view() {
    const tut = this.tut;
    return {
      sim: this.sim, t: this.clock, trail: this.trail, dog: this.dog, fx: this.fx, msg: this.msg,
      /** màn tập: băng lời dặn + bàn tay mẫu (thay cho dòng "Màn x · Đợt y") */
      guide: tut && !tut.done ? { say: tut.step.say, sub: `${tut.step.sub || ''}  ·  ${tut.count}`, a: tut.wait > 0 ? 0 : Math.min(1, tut.t * 3), demo: tut.demo() } : null,
    };
  }
}
