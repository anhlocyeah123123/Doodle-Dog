// @ts-check
// Âm thanh chạy ổn trên iPhone + Android:
// - Trình duyệt di động chỉ cho phát tiếng sau khi người dùng chạm -> unlock() gọi trong sự kiện chạm.
// - Hiệu ứng (SFX) dùng WebAudio: trễ thấp, phát chồng nhiều tiếng được.
// - Nhạc nền dùng <audio> (không giải nén 80 giây nhạc vào RAM). iOS bỏ qua audio.volume,
//   nên âm lượng nhạc đã được giảm sẵn trong file (tools/build_assets.py).
// - Một mẫu 3.mp3 đổi cao độ để tạo nhiều tiếng (bùa, diệt ma, hồi máu, qua màn) -> ít tải.
// - iPhone gạt công tắc im lặng thì SFX tắt (hành vi của iOS), nhạc nền vẫn kêu.

const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
const GAIN = { 3: 0.7, 4: 0.6, 5: 1 };   // cân bằng theo đo thực tế (5.mp3 nhỏ hơn ~4dB)
const SFX = ['3', '4', '5'];

export const audio = {
  /** @type {AudioContext|null} */ ctx: null,
  /** @type {Record<string, AudioBuffer>} */ buf: {},
  /** @type {Record<string, Promise<ArrayBuffer>>} */ raw: {},
  /** @type {HTMLAudioElement|null} */ music: null,
  muted: false,
  started: false,

  /** Tải sẵn dữ liệu SFX ngay khi mở trang (chưa cần chạm) để tiếng đầu tiên không bị mất. */
  init() {
    try { this.muted = localStorage.getItem('dd-mute') === '1'; } catch { /* chế độ riêng tư */ }
    for (const n of SFX) this.raw[n] = fetch(`assets/audio/${n}.mp3`).then((r) => r.arrayBuffer());
  },

  /** PHẢI gọi trực tiếp trong sự kiện click/chạm. Gọi nhiều lần vô hại. */
  unlock() {
    if (!this.ctx && AC) {
      this.ctx = new AC();
      const s = this.ctx.createBufferSource();   // phát 1 mẫu rỗng: mẹo mở khóa iOS cũ
      s.buffer = this.ctx.createBuffer(1, 1, 22050);
      s.connect(this.ctx.destination);
      s.start(0);
      for (const n of SFX) {
        this.raw[n]
          ?.then((d) => new Promise((ok, no) => this.ctx?.decodeAudioData(d, ok, no)))   // dạng callback cho Safari cũ
          .then((b) => { this.buf[n] = /** @type {AudioBuffer} */ (b); })
          .catch(() => {});
      }
    }
    this.resume();
    if (!this.music) {
      this.music = new Audio('assets/audio/1.mp3');
      this.music.loop = true;
      this.music.preload = 'auto';
      this.music.setAttribute('playsinline', '');
    }
    this.started = true;
    this.playMusic();
  },

  /** iOS đưa AudioContext về 'interrupted' sau cuộc gọi / chuyển app -> cần resume khi chạm lại. */
  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  },

  playMusic() {
    if (this.started && !this.muted && this.music && this.music.paused) this.music.play().catch(() => {});
  },

  /** @param {string} n tên file · rate đổi cao độ · delay giây */
  sfx(n, vol = 1, rate = 1, delay = 0) {
    if (this.muted || !this.ctx || !this.buf[n] || this.ctx.state !== 'running') return;
    const s = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    s.buffer = this.buf[n];
    s.playbackRate.value = rate;
    g.gain.value = vol * (GAIN[n] ?? 1);
    s.connect(g);
    g.connect(this.ctx.destination);
    s.start(this.ctx.currentTime + delay);
  },

  /** Chuỗi nốt đi lên (qua màn, hồi máu). */
  arp(rates, vol = 0.6) { rates.forEach((r, i) => this.sfx('3', vol, r, i * 0.13)); },

  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem('dd-mute', this.muted ? '1' : '0'); } catch { /* bỏ qua */ }
    if (this.muted) this.music?.pause(); else this.playMusic();
    return this.muted;
  },

  /** Tạm dừng khi ẩn app / khóa màn hình. */
  suspend() {
    this.music?.pause();
    this.ctx?.suspend().catch(() => {});
  },
};

// Chạm bất kỳ đâu: thử phát lại nếu lần trước trình duyệt chặn hoặc iOS đã ngắt.
for (const type of ['pointerup', 'touchend']) {
  document.addEventListener(type, () => { if (audio.started && !document.hidden) { audio.resume(); audio.playMusic(); } }, { passive: true });
}
