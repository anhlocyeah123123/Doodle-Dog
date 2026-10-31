// @ts-check
// Điểm khởi động: nạp asset, nối giao diện + phiên chơi + vòng lặp. Không chứa luật chơi.
import { W, H } from './core/config.js';
import { loadAssets } from './engine/assets.js';
import { bindStroke } from './engine/input.js';
import { startLoop } from './engine/loop.js';
import { audio } from './engine/audio.js';
import { draw } from './render/draw.js';
import { ink } from './render/ink.js';
import { setCacheScale } from './render/cache.js';
import { Session } from './game/session.js';
import { setupUI, setBackground } from './ui/menu.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

// ---- chất lượng hình ảnh: tự hạ bậc khi máy đuối ----
const nav = /** @type {any} */ (navigator);
const weak = (nav.deviceMemory && nav.deviceMemory <= 2) || (navigator.hardwareConcurrency || 8) <= 4;
const TIERS = [
  { dpr: 1.5, parts: 120, low: false },   // máy khỏe
  { dpr: 1.0, parts: 70, low: false },
  { dpr: 0.75, parts: 30, low: true },    // máy rất yếu: bỏ nét phụ, rung màn hình, trang trí
];
let tier = weak ? 1 : 0;
function applyQuality() {
  const q = TIERS[tier];
  const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ink.low = q.low;
  setCacheScale(dpr);
  if (session) session.fx.maxParts = q.parts;
}

/** @type {Session|null} */
let session = null;
let A = null;
const trail = bindStroke(canvas, (pts) => session?.stroke(pts));
canvas.addEventListener('click', () => session?.tap());
audio.init();
applyQuality();

const ui = setupUI({
  start: (level) => session?.begin(level),
  quit: () => { if (session) { session.state = 'idle'; session.sim = null; } ctx.clearRect(0, 0, W, H); },
  setPaused: (p) => { loop.paused = p; },
  isPlaying: () => !!session && session.state !== 'idle',
});

const loop = startLoop(
  (dt) => session?.update(dt),
  () => { if (A && session?.sim) draw(ctx, A, session.view()); },
  () => { if (tier < TIERS.length - 1) { tier++; applyQuality(); } },
);

loadAssets()
  .then((assets) => {
    A = assets;
    session = new Session(assets, trail, { onBackground: setBackground, onMenu: ui.toMenu });
    applyQuality();
    ui.ready(assets);
  })
  .catch(ui.failed);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ?debug: mở cửa sau cho kiểm thử tự động (không ảnh hưởng người chơi thường)
if (new URLSearchParams(location.search).has('debug')) {
  /** @type {any} */ (window).__dd = { get session() { return session; }, get tier() { return tier; }, get stats() { return loop.stats; },
    pause(v) { loop.paused = v; },
    step(n = 1) { for (let i = 0; i < n; i++) session?.update(1 / 60); },
  };
}
