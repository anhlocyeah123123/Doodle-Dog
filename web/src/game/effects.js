// @ts-check
// Hiệu ứng thuần hình ảnh: hạt mực, vòng sóng, tia sét, thông báo, rung màn hình.
// Không ảnh hưởng luật chơi -> có thể giảm/tắt trên máy yếu mà game vẫn đúng.

export class Effects {
  constructor() {
    this.maxParts = 120;
    this.reset();
  }

  reset() {
    /** @type {any[]} */ this.list = [];     // ring | beam | area | bolt | sigil  (a: 0 -> 1)
    /** @type {any[]} */ this.parts = [];    // hạt mực / chữ nổi
    /** @type {any[]} */ this.toasts = [];   // thông báo giữa màn hình
    this.shake = 0;
    this.flash = 0;
    this.red = 0;
  }

  /** @param {object} f hiệu ứng có trường t (loại) */
  add(f) { this.list.push({ ...f, a: 0 }); }

  /** Bắn n hạt từ (x, y). label: chữ nổi lên thay vì hạt (vd '+10', '♥'). */
  burst(x, y, n, colors, label = '', size = 0) {
    for (let i = 0; i < n && this.parts.length < this.maxParts; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
      this.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (label ? 90 : 0), l: 0.8, m: 0.8,
        sz: size || (label ? 16 : 3 + Math.random() * 4), col: colors[i % colors.length], ch: label,
      });
    }
  }

  /** @param {'info'|'warn'|'level'|'boss'} kind */
  toast(txt, kind = 'info', life = 2.2) {
    this.toasts = this.toasts.filter((o) => o.txt !== txt);   // không lặp cùng một thông báo
    this.toasts.push({ txt, kind, t: 0, life });
    if (this.toasts.length > 2) this.toasts.shift();   // tối đa 2 thông báo, xếp từ đáy màn hình lên
  }

  update(dt) {
    for (const f of this.list) f.a += dt * (f.rate || 2.4);   // rate: 1/thời lượng (giây)
    this.list = this.list.filter((f) => f.a < 1);
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += (p.ch ? -30 : 260) * dt;   // chữ bay lên, hạt rơi xuống
      p.l -= dt;
    }
    this.parts = this.parts.filter((p) => p.l > 0);
    for (const o of this.toasts) o.t += dt;
    this.toasts = this.toasts.filter((o) => o.t < o.life);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.red = Math.max(0, this.red - dt);
  }
}
