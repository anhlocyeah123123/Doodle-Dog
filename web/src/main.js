// @ts-check
// Điểm khởi động: nạp asset, nối giao diện + phiên chơi + vòng lặp. Không chứa luật chơi.
import { loadAssets } from './engine/assets.js';
import { bindStroke, lockPage } from './engine/input.js';
import { startLoop } from './engine/loop.js';
import { audio } from './engine/audio.js';
import { draw, drawOpts } from './render/draw.js';
import { drawCutscene } from './render/cutscene.js';
import { drawOutro } from './render/outro.js';
import { drawPage, drawEnding, drawTbc } from './render/story.js';
import { ink } from './render/ink.js';
import { setCacheScale } from './render/cache.js';
import { VIEW, fitView } from './render/view.js';
import { Session } from './game/session.js';
import { setupUI, setBackground } from './ui/menu.js';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('c'));
const safe = /** @type {HTMLElement} */ (document.getElementById('safe'));   // vùng an toàn (trừ tai thỏ, thanh vuốt)
const stageEl = /** @type {HTMLElement} */ (document.getElementById('stage'));  // cả màn hình
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

// ---- chất lượng hình ảnh: tự hạ bậc khi máy đuối ----
const nav = /** @type {any} */ (navigator);
const weak = (nav.deviceMemory && nav.deviceMemory <= 2) || (navigator.hardwareConcurrency || 8) <= 4;
const TIERS = [   // dpr = số pixel vẽ trên mỗi pixel CSS (tối đa)
  { dpr: 1.5, parts: 120, low: false },   // máy khỏe
  { dpr: 1.0, parts: 70, low: false },
  { dpr: 0.75, parts: 30, low: true },    // máy rất yếu: bỏ nét phụ, rung màn hình, trang trí
];
let tier = weak ? 1 : 0;
function applyQuality() {
  const q = TIERS[tier];
  const k = VIEW.s * Math.min(window.devicePixelRatio || 1, q.dpr);   // pixel vẽ / đơn vị logic
  canvas.width = Math.round(VIEW.w * k);
  canvas.height = Math.round(VIEW.h * k);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ink.low = q.low;
  setCacheScale(k);
  if (session) session.fx.maxParts = q.parts;
}

/** Canvas phủ kín vùng an toàn; thế giới 960x540 nằm giữa (xem render/view.js). */
function layout() {
  const r = safe.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  // Phim mở đầu / đoạn kết: canvas phủ CẢ màn hình (kể cả tai thỏ, thanh Home) để nền đen / trời sao kín mép.
  const cinema = ['cutscene', 'outro', 'ending', 'tbc'].includes(session?.state || '');
  const st = stageEl.getBoundingClientRect();
  fitView(r.width, r.height, cinema ? { dx: st.left - r.left, dy: st.top - r.top, w: st.width, h: st.height } : null);
  const cw = VIEW.w * VIEW.s, ch = VIEW.h * VIEW.s;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.style.left = `${cinema ? st.left - r.left : (r.width - cw) / 2}px`;
  canvas.style.top = `${cinema ? st.top - r.top : (r.height - ch) / 2}px`;
  applyQuality();
}

/** @type {Session|null} */
let session = null;
let A = null;
const trail = bindStroke(canvas, (pts, touch) => session?.stroke(pts, touch));
canvas.addEventListener('click', () => session?.tap());
lockPage();
audio.init();
layout();
new ResizeObserver(layout).observe(safe);   // xoay máy, thanh địa chỉ Safari co/giãn, vào/ra toàn màn hình

const ui = setupUI({
  start: (level) => session?.begin(level),
  story: () => session?.startStory(),
  skip: () => session?.skip(),
  quit: () => { if (session) { session.state = 'idle'; session.sim = null; session.tut = null; session.outro = null; session.page = null; session.ending = null; session.tbcT = -1; } layout(); ctx.clearRect(0, 0, VIEW.w, VIEW.h); },
  tbc: () => { session?.startTbc(); layout(); },
  setPaused: (p) => { loop.paused = p; },
  isPlaying: () => !!session && session.state !== 'idle',
});

const loop = startLoop(
  (dt) => session?.update(dt),
  () => {
    if (!A || !session) return;
    if (session.state === 'cutscene') drawCutscene(ctx, A, session.cutT, ink.low);
    else if (session.state === 'outro' && session.outro) drawOutro(ctx, A, session.outro, ink.low);
    else if (session.state === 'page' && session.page) drawPage(ctx, A, session.page);
    else if (session.state === 'ending' && session.ending) drawEnding(ctx, A, session.ending);
    else if (session.state === 'tbc') drawTbc(ctx, A, session.tbcT);
    else if (session.sim) draw(ctx, A, session.view());
  },
  () => { if (tier < TIERS.length - 1) { tier++; applyQuality(); } },
);

loadAssets()
  .then((assets) => {
    A = assets;
    session = new Session(assets, trail, { onBackground: setBackground, onMenu: ui.toMenu, onSkippable: (on) => { ui.setSkippable(on); layout(); },
      onOutro: () => { ui.outro(); layout(); }, onVictory: ui.victory, onTimeStop: ui.timeStop });
    layout();
    ui.ready(assets);
  })
  .catch(ui.failed);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ?debug: mở cửa sau cho kiểm thử tự động (không ảnh hưởng người chơi thường)
if (new URLSearchParams(location.search).has('debug')) {
  /** @type {any} */ (window).__dd = { get session() { return session; }, get tier() { return tier; }, get stats() { return loop.stats; }, get view() { return VIEW; }, drawOpts, audio,
    pause(v) { loop.paused = v; },
    step(n = 1) { for (let i = 0; i < n; i++) session?.update(1 / 60); },
  };
}
