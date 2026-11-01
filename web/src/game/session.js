// @ts-check
// Một phiên chơi: điều phối trạng thái màn, nối Sim (luật) với hiệu ứng, âm thanh và animation nhân vật.
//
//   cutscene (phim mở đầu) ──> tutorial (màn tập) ──> intro màn 1     [lần đầu chơi, bỏ qua được]
//   intro ──(chạy vào giữa)──> play ──┬─ qua màn ──> clear ──(chạm)──> intro màn sau
//                                     ├─ hết máu ──> over  ──(chạm)──> intro màn đó
//                                     ├─ hạ boss màn 1–4 ──> page (nhặt trang sách, học bùa mới) ──> [bài học của Cô Cú] ──> intro màn sau
//                                     └─ hạ Vua Mực ──> outro (phép tối thượng) ──> ending (Mực Con) ──> bảng chiến thắng ──> tbc (còn tiếp…) ──> menu
import { CX, GY, CY, BAL, LEVELS, LAST, SPELL_ANIM, DEFAULT_CAST_ANIM, palsAt } from '../core/config.js';
import { Sim } from '../core/sim.js';
import { recognize, strokeGeometry } from '../core/recognizer.js';
import { Effects } from './effects.js';
import { audio } from '../engine/audio.js';
import { bolt } from '../render/ink.js';
import { CUES, DURATION } from '../render/cutscene.js';
import { OUTRO_CUES, OUTRO_FIRE, OUTRO_HIT, OUTRO_DUR, TIMESTOP_END } from '../render/outro.js';
import { Tutorial, LESSONS } from './tutorial.js';
import { PAGE_INFO, ENDING_DUR, ENDING_CUES, TBC_DUR } from '../render/story.js';
import { palIcon, PAL_NAME } from '../render/draw.js';
import { VIEW } from '../render/view.js';

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

/** Bài học bùa mới của từng màn đã xem chưa (xem rồi thì lần sau vào thẳng). */
export const lessonSeen = {
  get(l) { try { return localStorage.getItem('dd-les' + l) === '1'; } catch { return false; } },
  set(l) { try { localStorage.setItem('dd-les' + l, '1'); } catch { /* bỏ qua */ } },
};

/** Âm thanh cho các mốc trong phim mở đầu (render/cutscene.js -> CUES). */
const CUE_SOUND = {
  thunder: () => audio.sfx('4', 0.8, 0.5),
  whoosh: () => audio.sfx('3', 0.35, 0.55),
  grab: () => audio.sfx('5', 1, 0.8),
  laugh: () => (audio.has('laugh') ? audio.sfx('laugh', 0.9) : audio.arp([2, 1.68, 2, 1.68], 0.35)),   // tiếng cười của Ma trùm
  angry: () => audio.sfx('4', 0.5, 1.3),
  rip: () => { audio.sfx('5', 1, 1.25); audio.sfx('4', 0.6, 0.8); },
  shrink: () => { audio.sfx('3', 0.5, 0.6); audio.sfx('3', 0.4, 0.45, 0.8); },
  cheer: () => audio.arp([1.5, 2], 0.45),
  restore: () => audio.arp([1, 1.26, 1.5, 2, 2.5], 0.5),
  title: () => audio.arp([1, 1.26, 1.5, 2]),
  // đoạn kết: cả đoạn ult.mp3 (khớp nhịp hình, xem render/outro.js). Chưa tải xong -> ghép tạm từ tiếng có sẵn.
  ult: () => {
    if (audio.has('ult')) { audio.sfx('ult', 1); return; }
    audio.sfx('4', 0.7, 0.45, 0.15);              // thời gian ngưng
    audio.sfx('3', 0.4, 1.0, 2.9); audio.sfx('3', 0.45, 1.4, 3.5); audio.sfx('3', 0.5, 1.9, 4.1);   // dồn lực
    audio.sfx('4', 1, 0.9, OUTRO_FIRE);            // bắn
    audio.sfx('5', 1, 0.5, OUTRO_HIT); audio.sfx('4', 1, 0.4, OUTRO_HIT);   // nổ
  },
};

export const progress = {
  get() { try { return Number(localStorage.getItem('dd-lv')) || 1; } catch { return 1; } },
  set(l) { try { if (l > this.get()) localStorage.setItem('dd-lv', String(Math.min(l, LAST))); } catch { /* bỏ qua */ } },
};

export class Session {
  /**
   * @param {import('../engine/assets.js').Assets} A
   * @param {{pts:number[][], down:boolean, fade:number, touch:boolean}} trail
   * @param {{onBackground:(bg:string)=>void, onMenu:()=>void, onSkippable:(on:boolean)=>void, onOutro:()=>void, onVictory:(score:number)=>void, onTimeStop:(on:boolean)=>void}} hooks
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
    /** @type {{t:number, bx:number, by:number, dir:number, cue:number, hit:boolean, shown:boolean, stop:boolean}|null} */
    this.outro = null; // đoạn kết sau khi hạ boss cuối
    /** @type {{t:number, level:number, bx:number, by:number, pals:string[], bg:boolean, hp:number, score:number}|null} */
    this.page = null;  // đoạn nhặt trang sách sau boss màn 1–4
    /** @type {{t:number, bx:number, by:number, pals:string[], cue:number, shown:boolean}|null} */
    this.ending = null;
    this.tbcT = -1;    // >= 0: đang chiếu "Còn tiếp…"
    this.lesson = 0;   // > 0: đang học bùa mới của màn này
    this.pending = { hp: BAL.hp, score: 0 };   // máu/điểm mang sang màn sau bài học
    /** @type {Record<string, {a:string, t0:number}>} */ this.pals = {};
    this.lastBoss = { x: CX + 200, y: 180 };
    this.fade = 0;     // > 0: màn hình đang tối, sáng dần (chuyển cảnh)
  }

  /** Hạ boss cuối: diễn "phép tối thượng" (render/outro.js) thay cho animation thắng thường. */
  startOutro(bx, by) {
    this.state = 'outro';
    this.outro = { t: 0, bx, by, dir: bx >= CX ? 1 : -1, cue: 0, hit: false, shown: false, stop: true };
    this.trail.pts = []; this.trail.down = false;
    this.fx.reset();
    this.msg = null;
    audio.duck(true);              // nhạc nền im để nghe rõ tiếng kết liễu
    this.hooks.onOutro();
    this.hooks.onTimeStop(true);   // cảnh ngoài lãnh địa xám lại: thời gian ngưng đọng
  }

  /** Phim mở đầu -> màn tập -> màn 1. */
  startStory() {
    this.sim = null;
    this.page = null; this.ending = null; this.tbcT = -1; this.lesson = 0;
    this.hooks.onTimeStop(false);
    this.tut = null;
    this.fx.reset();
    this.msg = null;
    this.state = 'cutscene';
    this.cutT = 0; this.cueI = 0;
    this.hooks.onBackground('bg1');
    this.hooks.onSkippable(true);
  }

  startTutorial() {
    this.lesson = 0;
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
    else if (this.state === 'page') this.skipPage();
    else if (this.state === 'ending' && this.ending) this.ending.t = Math.max(this.ending.t, ENDING_DUR);
  }

  endTutorial() {
    this.tut = null;
    if (this.lesson) { const l = this.lesson; lessonSeen.set(l); this.lesson = 0; this.beginLevel(l, this.pending.hp, this.pending.score); return; }
    tutorialSeen.set();
    this.begin(1);
  }

  /** Vào màn: lần đầu tới màn có bùa mới -> Cô Cú dạy trước (bài học ngắn, bỏ qua được). */
  begin(level, hp = BAL.hp, score = 0) {
    if (LESSONS[level] && !lessonSeen.get(level)) { this.startLesson(level, hp, score); return; }
    this.beginLevel(level, hp, score);
  }

  /** Bài học bùa mới đầu màn (dùng chung cỗ máy của màn tập). */
  startLesson(level, hp, score) {
    this.page = null; this.outro = null;
    this.pending = { hp, score };
    this.lesson = level;
    this.sim = new Sim(7, 0, BAL.hp, score, level);
    this.fx.reset();
    this.tut = new Tutorial(this.sim, this.fx, LESSONS[level]);
    this.msg = null; this.tutEnd = 0;
    this.state = 'tutorial';
    this.fade = 1;
    this.dog = { state: 'idle', t0: this.clock, timer: 0, x: CX, flip: false };
    this.hooks.onTimeStop(false);
    this.hooks.onBackground(LEVELS[level].bg);
    this.hooks.onSkippable(true);
  }

  beginLevel(level, hp = BAL.hp, score = 0) {
    this.page = null; this.ending = null; this.tbcT = -1; this.lesson = 0;
    this.pals = {};
    for (const who of palsAt(level)) this.pals[who] = { a: '', t0: 0 };
    this.outro = null;
    this.hooks.onTimeStop(false);
    this.hooks.onSkippable(false);
    this.tut = null;
    this.tutEnd = 0;
    this.sim = new Sim((Date.now() & 0xffff) + level, level, hp, score);
    this.hooks.onBackground(LEVELS[level].bg);
    if (LEVELS[level + 1]) new Image().src = `assets/img/${LEVELS[level + 1].bg}.webp`;   // nạp trước nền màn sau
    this.fx.reset();
    this.msg = null;
    this.state = 'intro';
    this.fade = level > 1 || this.fade > 0 ? 1 : 0;   // sau đoạn chuyển màn / bài học: sáng dần rồi Cún chạy vào
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
    if (len < TAP_LEN && this.state === 'play') {   // chạm biểu tượng bạn đồng hành (góc dưới trái)
      const vx = pts[0][0] + VIEW.ox, vy = pts[0][1] + VIEW.oy;
      const i = sim.pals.findIndex((_, j) => { const b = palIcon(j); return Math.hypot(vx - b.x, vy - b.y) < b.r + 10; });
      if (i >= 0) { sim.usePal(sim.pals[i].who); return; }
    }
    if (len < TAP_LEN) {   // chạm = phá ký tự rơi
      if (sim.pop(pts[0][0], pts[0][1])) audio.sfx('3', 0.5, 1.8);
      return;
    }
    const s = recognize(pts, { touch, around: [CX, CY] });   // vòng kín quanh Cún = lá chắn
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
    if (this.state === 'page' && this.page && this.page.t > 1.2) { this.skipPage(); return; }
    if (this.state === 'ending' && this.ending && this.ending.t > 2) { this.ending.t = Math.max(this.ending.t, ENDING_DUR); return; }
    if (this.state === 'tbc' && this.tbcT > 1.5) { this.hooks.onMenu(); return; }
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
          fx.toast(e.boss ? `⚠ ${sim.cfg.boss?.name || 'BOSS'} xuất hiện!` : `Đợt ma ${e.n}/${e.of}!`, e.boss ? 'boss' : 'warn');
          this.alertT = 1.4;
          if (e.boss) { fx.shake = 0.5; audio.sfx('4', 0.5, 0.6); if (sim.cfg.boss?.king) CUE_SOUND.laugh(); }
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
          fx.add({ t: 'poof', x: e.x, y: e.y, sc: e.boss ? 1.7 : 0.75, A: this.A, rate: 2.6 });
          if (e.boss) { this.lastBoss = { x: e.x, y: e.y }; fx.toast(`Hạ ${sim.cfg.boss?.name || 'boss'}! Nó làm rơi một trang sách…`, 'level', 2.4); }
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
        // 'cast' (bùa trúng những con nào): không vẽ tia nối — mỗi con trúng tự nổ tung tại chỗ qua 'kill' / 'step'
        case 'combo':
          fx.toast(`Combo x${e.n}! +${BAL.comboBonus * (e.n - 1)}`, 'info', 1.3);
          audio.arp([1.26, 1.5, 2].slice(0, Math.min(3, e.n)), 0.5);
          break;
        case 'bolt': fx.flash = 0.3; break;
        case 'miss':
          if (e.cd) fx.toast('Sét đang hồi…', 'warn', 1);
          else if (e.shield) fx.toast('Lá chắn đã dùng ở màn này rồi', 'warn', 1.4);
          else if (e.slow) fx.toast('Đồng hồ cát đã dùng ở màn này rồi', 'warn', 1.4);
          else if (this.tut) fx.toast('Chưa đúng bùa — vẽ theo bàn tay nhé', 'warn', 1.4);
          break;
        case 'shield':
          fx.toast(`Lá chắn! ${BAL.shieldSec} giây`, 'info', 1.4);
          fx.flash = 0.15; fx.shake = 0.25;
          fx.burst(CX, CY, 18, ['#14a89c', '#fff', '#9be7ff']);
          audio.sfx('4', 0.5, 1.6); audio.arp([1.5, 2, 2.5], 0.4);
          break;
        case 'block':
          fx.burst(e.x, e.y, 8, ['#14a89c', '#fff']);
          audio.sfx('3', 0.35, 0.7);
          break;
        case 'phase': fx.toast('Boss nổi giận!', 'boss'); fx.shake = 0.5; audio.sfx('4', 0.5, 0.5); break;
        case 'finale': this.startOutro(e.x, e.y); break;
        case 'pop': fx.burst(e.x, e.y, 8, ['#fff', '#ffd23f']); break;
        case 'hit':
          fx.shake = 0.35; fx.red = 0.35;
          this.anim('hit', this.clip('hit'));
          audio.sfx('5', 1);
          this.palAnim({ mun: 'mun_scared', frog: 'frog_hit', bat: 'bat_hit' });
          break;
        case 'locked': {
          const name = { LIGHTNING: 'Sét', SHIELD: 'Lá chắn', HOURGLASS: 'Đồng hồ cát' }[e.s] || 'này';
          fx.toast(`Chưa có bùa ${name} — phải lấy lại trang sách đã!`, 'warn', 1.8);
          break;
        }
        case 'slow':
          fx.toast(`Đồng hồ cát! Ma chậm lại ${BAL.slowSec} giây`, 'info', 1.6);
          fx.flash = 0.12; audio.sfx('4', 0.4, 0.4); audio.arp([2, 1.5, 1.26], 0.35);
          break;
        case 'armor':
          fx.burst(e.x, e.y, 14, ['#c8c8d8', '#fff', '#1b1bb8']);
          fx.add({ t: 'poof', x: e.x, y: e.y, sc: 0.6, A: this.A, rate: 3 });
          audio.sfx('5', 0.7, 1.5);
          break;
        case 'throw': audio.sfx('3', 0.25, 0.5); break;
        case 'dark':
          fx.toast('Vua Mực tắt đèn! Cứ vẽ tiếp đi!', 'boss', 1.6);
          audio.sfx('4', 0.6, 0.45);
          break;
        case 'pal': {
          const ic = palIcon(sim.pals.findIndex((p) => p.who === e.who));
          const ix = ic.x - VIEW.ox, iy = ic.y - VIEW.oy;   // biểu tượng -> tọa độ thế giới
          if (e.who === 'mun') {   // Mun nhảy ra từ biểu tượng, phóng sao
            fx.add({ t: 'cameo', name: 'mun_cast', x: ix + 50, y: iy - 60, A: this.A, rate: 1.4 });
            fx.add({ t: 'star', x0: ix + 80, y0: iy - 80, x1: e.x, y1: e.y, rate: 2.6 });
            audio.sfx('3', 0.45, 2.2);
          }
          if (e.who === 'frog') {   // Ộp hiện ra cạnh con ma, lè lưỡi nuốt
            const side = e.x > CX ? 1 : -1;
            fx.add({ t: 'cameo', name: 'frog_tongue', x: e.x - side * 95, y: e.y + 30, flip: side < 0, A: this.A, rate: 1.5 });
            audio.sfx('3', 0.5, 0.7);
          }
          if (e.who === 'bat') {   // Bin bay vụt qua trên đầu Cún, hét
            fx.add({ t: 'cameo', name: 'bat_screech', x: CX, y: GY - 220, A: this.A, rate: 1.3 });
            fx.add({ t: 'sonic', x: CX, y: GY - 200, rate: 1.6 });
            audio.sfx('3', 0.4, 2.6); audio.sfx('3', 0.3, 2.9, 0.1);
          }
          break;
        }
        case 'palwait':
          fx.toast(e.none ? `${PAL_NAME[e.who]}: chưa có ma để giúp` : `${PAL_NAME[e.who]} đang nghỉ… ${Math.ceil(e.cd)} giây`, 'warn', 1.2);
          break;
      }
    }
  }

  update(dt) {
    this.clock += dt;
    this.fade = Math.max(0, this.fade - dt / 0.6);
    if (this.state === 'outro' && this.outro) {   // đoạn kết: đếm giờ, âm thanh theo mốc, nổ -> thắng -> bảng chiến thắng
      const o = this.outro;
      o.t += dt;
      while (o.cue < OUTRO_CUES.length && OUTRO_CUES[o.cue][0] <= o.t) CUE_SOUND[OUTRO_CUES[o.cue++][1]]?.();
      if (o.stop && o.t >= TIMESTOP_END) { o.stop = false; this.hooks.onTimeStop(false); }
      if (!o.hit && o.t >= OUTRO_HIT) { o.hit = true; this.sim?.finishBoss(); progress.set(LAST); }
      if (!o.shown && o.t >= OUTRO_DUR) { o.shown = true; this.startEnding(o.bx, o.by); }
      return;
    }
    if (this.state === 'page' && this.page) {
      const p = this.page;
      p.t += dt;
      if (p.t >= PAGE_INFO[p.level].dur) this.afterPage();
      return;
    }
    if (this.state === 'ending' && this.ending) {
      const e = this.ending;
      e.t += dt;
      while (e.cue < ENDING_CUES.length && ENDING_CUES[e.cue][0] <= e.t) CUE_SOUND[ENDING_CUES[e.cue++][1]]?.();
      if (!e.shown && e.t >= ENDING_DUR) { e.shown = true; this.hooks.onVictory(this.sim?.score ?? 0); }
      return;
    }
    if (this.state === 'tbc') { if ((this.tbcT += dt) >= TBC_DUR + 3) this.hooks.onMenu(); return; }
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
        this.fx.toast(this.lesson ? `Đã học xong! Vào màn ${this.lesson} nào!` : 'Sẵn sàng! Đi lấy lại sách phép thôi!', 'level', 2);
        audio.arp([1, 1.26, 1.5, 2]);
      } else if (this.tutEnd && (this.tutEnd -= dt) <= 0) this.endTutorial();
      return;
    }
    if (this.state !== 'play') { this.overlayT += dt; return; }

    sim.tick(dt);
    this.handleEvents();
    if (this.state !== 'play') return;   // vừa vào đoạn kết
    this.dogFace(dt);

    if (sim.over) this.finish('over', 'lose', 'Thua rồi…', `Điểm ${sim.score} · chạm để thử lại màn ${sim.level}`, () => audio.sfx('5', 0.8, 0.7));
    else if (sim.cleared) this.startPage();
    else if (sim.won) this.finish('won', 'win', 'ĐÁNH BẠI BOSS! 🎉', `Điểm ${sim.score} · chạm để về menu`, () => audio.arp([1, 1.26, 1.5, 2, 1.5, 2, 2.5]));
  }

  /** Đổi động tác các bạn đồng hành đang có mặt. @param {Record<string,string>} m */
  palAnim(m) { for (const who of Object.keys(m)) if (this.pals[who]) this.pals[who] = { a: m[who], t0: this.clock }; }

  /** Hạ boss màn 1–4: đoạn nhặt trang sách / học bùa mới. */
  startPage() {
    const sim = /** @type {Sim} */ (this.sim);
    progress.set(sim.level + 1);
    this.state = 'page';
    this.page = { t: 0, level: sim.level, bx: this.lastBoss.x, by: this.lastBoss.y, pals: palsAt(sim.level), bg: false,
      hp: Math.min(BAL.hp, sim.hp + 1), score: sim.score };
    this.trail.pts = []; this.trail.down = false;
    this.fx.reset(); this.msg = null;
    this.hooks.onSkippable(true);
    audio.arp([1, 1.26, 1.5, 2]);
  }

  /** Bỏ qua đoạn chuyển màn: nhảy tới lúc màn hình tối dần (không cắt cụt). */
  skipPage() {
    const p = this.page;
    if (!p) return;
    const dur = PAGE_INFO[p.level].dur;
    p.t = Math.max(p.t, dur - 0.5);
  }

  afterPage() {
    const p = this.page;
    if (!p) return;
    this.page = null;
    this.begin(p.level + 1, p.hp, p.score);
  }

  /** Sau phép tối thượng: Vua Mực teo thành Mực Con, làm bạn, sách lành lại. */
  startEnding(bx, by) {
    this.state = 'ending';
    this.ending = { t: 0, bx, by, pals: palsAt(LAST), cue: 0, shown: false };
    this.hooks.onTimeStop(false);
    this.hooks.onSkippable(true);
    audio.duck(false);
  }

  /** "Còn tiếp…" (gọi khi bấm Tiếp tục ở bảng chiến thắng). */
  startTbc() {
    this.state = 'tbc';
    this.tbcT = 0;
    this.hooks.onSkippable(false);
    audio.arp([1.5, 1.26, 1], 0.4);
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
    const inPlay = this.state === 'play' || this.state === 'intro' || this.state === 'over';
    return {
      sim: this.sim, t: this.clock, trail: this.trail, dog: this.dog, fx: this.fx, msg: this.msg,
      pals: inPlay ? Object.fromEntries(Object.entries(this.pals).map(([k, p]) => [k, { a: p.a || '-', t0: p.t0 }])) : null,
      owl: tut && !tut.done ? { a: tut.wait > 0 ? 'owl_cheer' : tut.t < 2.6 ? 'owl_talk' : 'owl_idle', t0: 0 } : null,
      spot: this.state === 'intro' ? Math.min(1, this.introT / (BAL.introSec * 0.5)) : 0,
      fade: Math.max(this.fade, this.tutEnd > 0 && this.tutEnd < 0.6 && this.lesson ? 1 - this.tutEnd / 0.6 : 0),
      /** màn tập: băng lời dặn + bàn tay mẫu (thay cho dòng "Màn x · Đợt y") */
      guide: tut && !tut.done ? { say: tut.step.say, sub: `${tut.step.sub || ''}  ·  ${tut.count}`, a: tut.wait > 0 ? 0 : Math.min(1, tut.t * 3), demo: tut.demo() } : null,
    };
  }
}
