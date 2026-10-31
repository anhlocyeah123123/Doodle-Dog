// @ts-check
// Màn tập: dạy vẽ bùa bằng tay, không bằng chữ (giống Google Doodle 2016).
// Mỗi bước: đặt ma đứng yên -> bàn tay mực vẽ mẫu lặp lại -> chờ người chơi làm đúng -> khen -> bước sau.
// Chỉ điều khiển kịch bản; luật bùa vẫn do Sim xử lý (Sim ở chế độ tut: ma không cắn).
//
// Thêm/bớt bước: sửa mảng STEPS. Mỗi bước có:
//   say   lời dặn (dòng chính) · sub lời phụ
//   setup(sim)  đặt ma / chỉnh trạng thái cho bước này
//   done  'clear' (hết ma thường) | 'heal' (vẽ tim xong) | 'shield' (bật lá chắn) | 'pop' (chạm phá ký tự)
//   demo(sim)  nét mẫu cho bàn tay (tọa độ thế giới), hoặc {tap:[x,y]} cho thao tác chạm
import { CX, CY, BAL } from '../core/config.js';

/** @typedef {import('../core/sim.js').Sim} Sim */
/** @typedef {{path?:number[][], tap?:number[]}} Demo */
/** @typedef {{say:string, sub?:string, setup:(sim:Sim)=>void, done:'clear'|'heal'|'shield'|'pop', demo:(sim:Sim)=>Demo|null}} Step */

// ---- nét mẫu quanh vị trí con ma (gx, gy) ----
const line = (ax, ay, bx, by) => [[ax, ay], [bx, by]];
const SHAPE = {
  HORIZONTAL: (x, y) => line(x - 120, y + 8, x + 120, y + 8),
  VERTICAL: (x, y) => line(x + 6, y - 105, x + 6, y + 95),
  DIAGONAL: (x, y) => line(x - 85, y + 85, x + 85, y - 85),
  HAT_UP: (x, y) => [[x - 80, y + 70], [x, y - 75], [x + 80, y + 70]],
  HAT_DOWN: (x, y) => [[x - 80, y - 70], [x, y + 75], [x + 80, y - 70]],
  LIGHTNING: (x, y) => [[x - 60, y - 80], [x + 55, y - 35], [x - 55, y + 15], [x + 60, y + 65]],
  HEART: (x, y) => {   // tim vẽ 1 nét từ đỉnh giữa
    const p = [];
    for (let i = 0; i <= 36; i++) {
      const t = (i / 36) * Math.PI * 2;
      p.push([x + 16 * Math.sin(t) ** 3 * 4.6, y - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 4.6]);
    }
    return p;
  },
};

/** Nét mẫu cho con ma đầu tiên còn cần bùa (ma tim khi bước tim). */
function demoFor(sim) {
  const g = sim.ghosts[0];
  if (!g) return null;
  const s = g.seq[g.i];
  return { path: SHAPE[s](g.x, g.y) };
}

/** @type {Step[]} */
export const STEPS = [
  { say: 'Vẽ nét NGANG để đuổi ma', sub: 'Vẽ theo bàn tay mẫu, ở đâu trên màn hình cũng được',
    setup: (s) => { s.place(CX + 240, 250, ['HORIZONTAL']); }, done: 'clear', demo: demoFor },
  { say: 'Giờ là nét DỌC', sub: 'Nhìn ký hiệu trên đầu ma để biết cần vẽ gì',
    setup: (s) => { s.place(CX - 250, 245, ['VERTICAL']); }, done: 'clear', demo: demoFor },
  { say: 'Vẽ chữ V ngược ∧', sub: 'Một nét liền: lên rồi xuống',
    setup: (s) => { s.place(CX + 230, 250, ['HAT_UP']); }, done: 'clear', demo: demoFor },
  { say: 'Một nét quét CẢ HÀNG ma!', sub: 'Vẽ ngang ngay qua hàng ma để diệt cùng lúc',
    setup: (s) => { for (const x of [CX - 340, CX - 175, CX + 175, CX + 340]) s.place(x, 240, ['HORIZONTAL']); },
    done: 'clear', demo: () => ({ path: line(CX - 420, 248, CX + 420, 248) }) },
  { say: 'Ma có nhiều bùa: vẽ lần lượt', sub: 'Bùa sáng màu là bùa cần vẽ tiếp theo',
    setup: (s) => { s.place(CX - 240, 255, ['DIAGONAL', 'HAT_DOWN']); }, done: 'clear', demo: demoFor },
  { say: 'Bùa SÉT: vẽ hình zig-zag', sub: 'Mọi con ma mất 1 bùa · phải chờ hồi 4 giây mới dùng lại',
    setup: (s) => { s.boltCd = 0; s.place(CX - 330, 250, ['VERTICAL']); s.place(CX - 170, 235, ['HAT_DOWN']); s.place(CX + 300, 245, ['DIAGONAL']); },
    done: 'clear', demo: () => ({ path: SHAPE.LIGHTNING(CX + 90, 230) }) },
  { say: 'Bị ma cắn mất máu? Vẽ TRÁI TIM ♥', sub: 'Ma trái tim chỉ xuất hiện khi bạn thiếu máu, và không cắn',
    setup: (s) => { s.hp = BAL.hp - 1; s.place(CX + 230, 245, ['HEART'], true); }, done: 'heal', demo: demoFor },
  { say: 'Vẽ VÒNG TRÒN quanh Cún: lá chắn!', sub: `Hất ma ra xa, chặn đồ rơi trong ${BAL.shieldSec} giây · mỗi màn chỉ dùng 1 lần`,
    setup: (s) => { s.shieldUsed = false; s.shield = 0; s.place(CX - 170, 270, ['VERTICAL']); s.place(CX + 175, 265, ['HAT_UP']); },
    done: 'shield', demo: () => ({ path: Array.from({ length: 41 }, (_, i) => { const a = -Math.PI / 2 - (i / 40) * Math.PI * 2; return [CX + Math.cos(a) * 130, CY - 10 + Math.sin(a) * 118]; }) }) },
  { say: 'Boss ném đồ xuống: CHẠM để phá!', sub: 'Chạm nhẹ vào quả bí đang rơi',
    setup: (s) => { s.drop(CX + 170, 28, 150); }, done: 'pop',
    demo: (s) => (s.syms[0] ? { tap: [s.syms[0].x, s.syms[0].y] } : null) },
];

const PRAISE = ['Giỏi lắm!', 'Chuẩn luôn!', 'Tuyệt!', 'Đỉnh!', 'Quá đẹp!', 'Xuất sắc!', 'Hồi máu rồi!', 'Chắn ngon!', 'Hoàn hảo!'];
const DEMO_DELAY = 0.6;   // giây trước khi bàn tay vẽ mẫu lần đầu
const IDLE_AGAIN = 2.2;   // người chơi vẽ sai / ngừng tay bao lâu thì hiện lại bàn tay

export class Tutorial {
  /** @param {Sim} sim @param {import('./effects.js').Effects} fx */
  constructor(sim, fx) {
    this.sim = sim;
    this.fx = fx;
    this.i = -1;
    this.t = 0;          // thời gian trong bước hiện tại
    this.wait = 0;       // > 0: đang khen, đếm ngược sang bước sau
    this.idle = 0;       // giây từ lần thử gần nhất
    this.demoT = 0;      // đồng hồ của bàn tay mẫu (0 = bắt đầu vòng vẽ)
    this.got = false;    // đã đạt yêu cầu bước (heal/pop)
    this.done = false;
    this.next();
  }

  get step() { return STEPS[this.i]; }
  get count() { return `${Math.min(this.i + 1, STEPS.length)}/${STEPS.length}`; }

  next() {
    this.i++;
    if (this.i >= STEPS.length) { this.done = true; return; }
    const sim = this.sim;
    sim.ghosts = []; sim.syms = [];
    this.step.setup(sim);
    this.t = 0; this.wait = 0; this.idle = DEMO_DELAY; this.demoT = -DEMO_DELAY; this.got = false;
  }

  /** Đọc sự kiện của Sim TRƯỚC khi Session xử lý hiệu ứng. @param {any[]} ev */
  observe(ev) {
    for (const e of ev) {
      if (e.k === 'heal' || e.k === 'pop' || e.k === 'shield') { if (this.step?.done === e.k) this.got = true; }
      if (e.k === 'miss') this.fail();
    }
  }

  /** Người chơi vẽ (đúng hay sai). Bàn tay ẩn đi để không vướng. */
  tried() { this.idle = 0; this.demoT = -IDLE_AGAIN; }

  /** Vẽ sai / không nhận ra: hiện lại bàn tay sớm hơn. */
  fail() { this.idle = IDLE_AGAIN - 0.5; this.demoT = -0.5; }

  /** @param {number} dt @param {boolean} drawing người chơi đang đặt tay vẽ */
  update(dt, drawing) {
    if (this.done) return;
    const sim = this.sim, st = this.step;
    this.t += dt;
    if (this.wait > 0) { if ((this.wait -= dt) <= 0) this.next(); return; }

    if (st.done === 'pop' && !sim.syms.length && !this.got) sim.drop(CX + 170, 28, 150);   // rơi mất thì thả quả khác
    const ok = st.done === 'clear' ? !sim.ghosts.some((g) => !g.heal) : this.got;
    if (ok) {
      this.fx.toast(PRAISE[this.i % PRAISE.length], 'level', 1.2);
      this.wait = 1.3;
      return;
    }
    if (drawing) { this.idle = 0; this.demoT = -IDLE_AGAIN; return; }
    this.idle += dt;
    this.demoT += dt;
  }

  /** Bàn tay mẫu cần vẽ lúc này (null = ẩn). */
  demo() {
    if (this.done || this.wait > 0 || this.demoT < 0) return null;
    const d = this.step.demo(this.sim);
    return d && { ...d, t: this.demoT };
  }
}
