// @ts-check
// Âm thanh chạy ổn trên iPhone + Android:
// - Trình duyệt di động chỉ cho phát tiếng sau khi người dùng chạm -> unlock() gọi trong sự kiện chạm.
// - Hiệu ứng (SFX) dùng WebAudio: trễ thấp, phát chồng nhiều tiếng được.
// - Nhạc nền dùng <audio> (không giải nén 80 giây nhạc vào RAM). iOS bỏ qua audio.volume,
//   nên âm lượng nhạc đã được giảm sẵn trong file (tools/build_assets.py).
// - Một mẫu 3.mp3 đổi cao độ để tạo nhiều tiếng (bùa, diệt ma, hồi máu, qua màn) -> ít tải.
// - iPhone gạt công tắc im lặng thì SFX tắt (hành vi của iOS), nhạc nền vẫn kêu.

const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
const GAIN = { 3: 0.6, 4: 0.6, 5: 1, ult: 1, laugh: 0.8 };   // cân bằng theo đo thực tế (5.mp3 nhỏ hơn ~4dB)
const SFX = ['3', '4', '5', 'ult', 'laugh'];   // ult: tiếng đòn kết liễu boss (7.9 giây, ~80KB) · laugh: Ma trùm cười (phim mở đầu)

export const audio = {
  /** @type {AudioContext|null} */ ctx: null,
  /** @type {AudioNode|null} */ out: null,   // nén tiếng chung: nhiều tiếng cùng lúc không bị rè/chói
  /** @type {Record<string, AudioBuffer>} */ buf: {},
  /** @type {Record<string, Promise<ArrayBuffer>>} */ raw: {},
  /** @type {Record<string, string>} */ err: {},   // lỗi tải/giải mã từng tiếng (xem ?audio)
  /** @type {HTMLAudioElement|null} */ music: null,
  /** @type {Record<string, boolean>|undefined} */ decoding: undefined,
  fb: 0,
  muted: false,
  started: false,
  hold: false,   // đang diễn đoạn kết: giữ nhạc nền im, chạm màn hình cũng không bật lại

  /** Tải sẵn dữ liệu SFX ngay khi mở trang (chưa cần chạm) để tiếng đầu tiên không bị mất. */
  init() {
    try { this.muted = localStorage.getItem('dd-mute') === '1'; } catch { /* chế độ riêng tư */ }
    for (const n of SFX) this.raw[n] = this.fetchRaw(n);
  },

  /** Tải 1 tiếng, thử lại tối đa 3 lần (máy chủ local / mạng chập chờn hay rớt kết nối khi tải nhiều ảnh cùng lúc). */
  async fetchRaw(n, tries = 3) {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`assets/audio/${n}.mp3`, { cache: i ? 'reload' : 'default' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.arrayBuffer();
      } catch (e) {
        if (i >= tries - 1) { this.err[n] = 'tải: ' + (e?.message || e); throw e; }
        await new Promise((ok) => setTimeout(ok, 500 * (i + 1)));
      }
    }
  },

  /** Giải mã 1 tiếng (dạng promise, dự phòng dạng callback cho Safari cũ). Lỗi thì lần chạm sau thử lại. */
  decode(n) {
    const ctx = this.ctx;
    if (!ctx || this.buf[n] || this.decoding?.[n]) return;
    (this.decoding ||= {})[n] = true;
    (this.raw[n] || (this.raw[n] = this.fetchRaw(n)))
      .then((d) => new Promise((ok, no) => {
        const p = ctx.decodeAudioData(d.slice(0), ok, no);   // slice: giữ bản gốc để thử lại được
        if (p && p.then) p.then(ok, no);
      }))
      .then((b) => { this.buf[n] = /** @type {AudioBuffer} */ (b); delete this.err[n]; })
      .catch((e) => { this.err[n] ||= 'giải mã: ' + (e?.message || e); delete this.raw[n]; })
      .finally(() => { if (this.decoding) this.decoding[n] = false; });
  },

  /** PHẢI gọi trực tiếp trong sự kiện click/chạm. Gọi nhiều lần vô hại. */
  unlock() {
    // iOS 17+: coi web như trình phát nhạc -> vẫn kêu khi gạt công tắc im lặng
    // CHỈ áp dụng cho iPhone/iPad: trên máy tính (Safari Mac) đổi loại phiên âm thanh có thể làm WebAudio im lặng.
    if (IOS) try { const s = /** @type {any} */ (navigator).audioSession; if (s && s.type !== 'playback') s.type = 'playback'; } catch { /* máy cũ */ }
    if (!this.ctx && AC) {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
      const master = this.ctx.createGain(); master.gain.value = 0.9;
      master.connect(comp); comp.connect(this.ctx.destination);
      this.out = master;
      const s = this.ctx.createBufferSource();   // phát 1 mẫu rỗng: mẹo mở khóa iOS cũ
      s.buffer = this.ctx.createBuffer(1, 1, 22050);
      s.connect(this.ctx.destination);
      s.start(0);
    }
    for (const n of SFX) this.decode(n);   // lần trước lỗi thì thử lại
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
    if (this.started && !this.muted && !this.hold && this.music && this.music.paused) this.music.play().catch(() => {});
  },

  /** Tắt tạm nhạc nền (đoạn kết) / bật lại. @param {boolean} on */
  duck(on) {
    this.hold = on;
    if (on) this.music?.pause(); else this.playMusic();
  },

  /** Đã giải mã xong file âm thanh n chưa. */
  has(n) { return !!this.buf[n]; },

  /** @param {string} n tên file · rate đổi cao độ · delay giây */
  sfx(n, vol = 1, rate = 1, delay = 0) {
    if (this.muted || !this.started) return;
    if (!this.ctx || !this.buf[n] || this.ctx.state !== 'running') {   // WebAudio chưa sẵn sàng: phát tạm bằng <audio>
      if (this.ctx && this.ctx.state !== 'running') this.resume();
      if (n === 'ult' || n === 'laugh' || (this.fb = (this.fb || 0) + 1) > 400) return;
      const el = new Audio(`assets/audio/${n}.mp3`);
      el.volume = Math.min(1, vol * (GAIN[n] ?? 1));
      try { /** @type {any} */ (el).preservesPitch = false; el.playbackRate = Math.max(0.5, Math.min(4, rate)); } catch { /* bỏ qua */ }
      setTimeout(() => el.play().catch(() => {}), delay * 1000);
      return;
    }
    const s = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    s.buffer = this.buf[n];
    s.playbackRate.value = rate;
    g.gain.value = vol * (GAIN[n] ?? 1);
    s.connect(g);
    g.connect(this.out || this.ctx.destination);
    s.start(this.ctx.currentTime + delay);
  },

  /** Tiếng VỠ khiên (tổng hợp, không cần file): tiếng nứt + mảnh vỡ leng keng + tiếng "cộp" trầm. */
  crack(vol = 0.6) {
    const ctx = this.ctx;
    if (this.muted || !ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime, out = this.out || ctx.destination;
    const n = Math.floor(ctx.sampleRate * 0.3), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.9;
    const ng = ctx.createGain(); ng.gain.value = vol * 0.9;
    noise.connect(bp); bp.connect(ng); ng.connect(out); noise.start(t0);
    const tone = (f, at, dur, v, type = 'triangle') => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = /** @type {OscillatorType} */ (type); o.frequency.setValueAtTime(f, t0 + at);
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(v * vol, t0 + at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
      o.connect(g); g.connect(out); o.start(t0 + at); o.stop(t0 + at + dur + 0.02);
    };
    tone(150, 0, 0.09, 0.7, 'sine');   // cộp
    for (let i = 0; i < 4; i++) tone(1900 + Math.random() * 1700, 0.03 + i * 0.045 + Math.random() * 0.02, 0.12, 0.18);   // mảnh vỡ
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

// ?audio: bảng chẩn đoán âm thanh nhỏ ở góc màn hình (gỡ lỗi "chỉ nghe nhạc nền, không có tiếng hiệu ứng")
if (new URLSearchParams(location.search).has('audio')) {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:99;margin:0;padding:6px 8px;font:12px monospace;background:#000c;color:#0f0;pointer-events:none;white-space:pre-wrap;max-width:60vw';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box));
  setInterval(() => {
    box.textContent = [
      `AudioContext: ${audio.ctx ? audio.ctx.state + ' · ' + audio.ctx.sampleRate + 'Hz' : 'chưa tạo (chưa chạm)'}`,
      `đã giải mã: ${Object.keys(audio.buf).join(', ') || '—'}`,
      `lỗi: ${Object.entries(audio.err).map(([k, v]) => k + ' ' + v).join(' | ') || 'không'}`,
      `tắt tiếng: ${audio.muted} · nhạc: ${audio.music ? (audio.music.paused ? 'dừng' : 'đang phát') : '—'} · dự phòng <audio>: ${audio.fb}`,
    ].join('\n');
  }, 500);
}
