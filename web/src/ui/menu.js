// @ts-check
// Giao diện DOM: menu, bảng hướng dẫn, tạm dừng, nút âm thanh, toàn màn hình, xoay ngang.
// Không chứa luật chơi; chỉ gọi các hàm được truyền vào qua `actions`.
import { LAST, LEVELS } from '../core/config.js';
import { audio } from '../engine/audio.js';
import { progress, tutorialSeen } from '../game/session.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const stage = $('stage');

/** Đổi ảnh nền khung game (CSS, không vẽ lại trên canvas). */
export function setBackground(key) {
  stage.style.backgroundImage = `url(assets/img/${key}.webp)`;
}

/** Cập nhật --u (1% chiều cao màn hình) và --sc (tỉ lệ so với thế giới 960x540) cho CSS. */
function trackSize() {
  const fit = () => {
    stage.style.setProperty('--u', `${stage.clientHeight / 100}px`);
    stage.style.setProperty('--sc', String(Math.min(stage.clientWidth / 960, stage.clientHeight / 540)));
  };
  new ResizeObserver(fit).observe(stage);
  fit();
}

/** Gắn animation sprite cho phần tử DOM bằng CSS (menu không cần canvas). */
function cssSprite(el, A, name) {
  const s = A.sprites[name];
  if (!s) return;
  el.style.setProperty('--w', `${s.w}px`);
  el.style.setProperty('--h', `${s.h}px`);
  el.style.setProperty('--n', String(s.n));
  el.style.setProperty('--dur', `${s.n / s.fps}s`);
  el.style.backgroundImage = `url(assets/sprites/${name}.webp)`;
}

const isTouch = matchMedia('(pointer: coarse)').matches;
const canFullscreen = !!document.documentElement.requestFullscreen;   // Android, PC, iPad có; iPhone Safari KHÔNG
/** Đã mở từ biểu tượng ở màn hình chính (chạy như ứng dụng, sẵn kín màn hình). */
const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || /** @type {any} */ (navigator).standalone === true;

/** Android: vào toàn màn hình + khóa ngang khi bắt đầu chơi. iPhone: dùng "Thêm vào MH chính". */
async function enterFullscreen() {
  if (!canFullscreen || document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await /** @type {any} */ (screen.orientation)?.lock?.('landscape');
  } catch { /* người dùng từ chối hoặc không hỗ trợ: vẫn chơi bình thường */ }
}

/**
 * @param {{
 *   start:(level:number)=>void, story:()=>void, skip:()=>void, quit:()=>void,
 *   setPaused:(p:boolean)=>void, isPlaying:()=>boolean
 * }} actions
 */
export function setupUI(actions) {
  trackSize();
  const menu = $('menu'), hud = $('hud'), help = $('help'), pause = $('pause');

  const refreshMute = () => {
    for (const b of document.querySelectorAll('.mute')) b.textContent = audio.muted ? '🔇' : '🔊';
  };
  for (const b of document.querySelectorAll('.mute')) {
    b.addEventListener('click', () => { audio.unlock(); audio.toggle(); refreshMute(); });
  }
  refreshMute();

  // Nút toàn màn hình (góc menu + bảng tạm dừng). iPhone không có API -> mở bảng hướng dẫn thay thế.
  const fsTip = $('fsTip');
  const toggleFs = () => {
    if (canFullscreen) document.fullscreenElement ? document.exitFullscreen() : enterFullscreen();
    else { fsFrom = pause.hidden ? null : pause; pause.hidden = true; fsTip.hidden = false; }
  };
  let fsFrom = /** @type {HTMLElement|null} */ (null);
  fsTip.querySelector('.close')?.addEventListener('click', () => { fsTip.hidden = true; if (fsFrom) fsFrom.hidden = false; });
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.fs'))) {
    b.hidden = standalone;
    b.addEventListener('click', toggleFs);
  }

  const buildLevels = () => {
    const unlocked = new URLSearchParams(location.search).has('unlock') ? LAST : progress.get();
    $('lv').innerHTML = Object.keys(LEVELS).map((l) => {
      const locked = Number(l) > unlocked;
      return `<button data-l="${l}" ${locked ? 'disabled aria-label="Màn ' + l + ' chưa mở"' : 'aria-label="Màn ' + l + '"'}>${locked ? '🔒' : l}</button>`;
    }).join('');
  };

  /** @param {number} level 0 = phim mở đầu + màn tập */
  const begin = (level) => {
    audio.unlock();   // phải nằm trong sự kiện chạm để iOS cho phát tiếng
    if (isTouch) enterFullscreen();
    menu.hidden = true; help.hidden = true; pause.hidden = true;
    hud.hidden = false;
    actions.setPaused(false);
    if (level === 0) actions.story(); else actions.start(level);
  };
  // Lần đầu chơi: phim mở đầu -> màn tập -> màn 1. Đã học rồi: vào thẳng màn 1.
  $('play').addEventListener('click', () => begin(tutorialSeen.get() ? 1 : 0));
  $('replay').addEventListener('click', () => begin(0));
  $('skip').addEventListener('click', () => actions.skip());
  $('lv').addEventListener('click', (e) => {
    const l = Number(/** @type {HTMLElement} */ (e.target).closest?.('button')?.dataset.l);
    if (l) begin(l);
  });

  // hướng dẫn
  let helpFromPause = false;
  const openHelp = (fromPause) => { helpFromPause = fromPause; pause.hidden = true; help.hidden = false; };
  $('how').addEventListener('click', () => openHelp(false));
  $('pauseHelp').addEventListener('click', () => openHelp(true));
  help.querySelector('.close')?.addEventListener('click', () => { help.hidden = true; if (helpFromPause) pause.hidden = false; });

  // tạm dừng
  const showPause = () => {
    if (!actions.isPlaying() || !help.hidden || !fsTip.hidden) return;
    actions.setPaused(true);
    pause.hidden = false;
  };
  const hidePause = () => { pause.hidden = true; actions.setPaused(false); audio.resume(); audio.playMusic(); };
  $('pauseBtn').addEventListener('click', showPause);
  $('resume').addEventListener('click', hidePause);
  const toMenu = () => {
    pause.hidden = true; help.hidden = true; fsTip.hidden = true; hud.hidden = true; menu.hidden = false;
    $('skip').hidden = true;
    actions.setPaused(false);
    actions.quit();
    setBackground('menu');
    buildLevels();
  };
  $('quit').addEventListener('click', toMenu);

  // Ẩn app / có cuộc gọi / khóa màn hình -> tự tạm dừng + tắt tiếng.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { showPause(); audio.suspend(); }
  });
  // Xoay dọc giữa chừng -> tạm dừng (màn hình xoay ngang hiện ra).
  matchMedia('(orientation: portrait) and (max-width: 820px)').addEventListener?.('change', (e) => { if (e.matches) showPause(); });

  setBackground('menu');
  buildLevels();

  return {
    toMenu,
    /** Hiện nút "Bỏ qua" trong phim mở đầu và màn tập. @param {boolean} on */
    setSkippable(on) { $('skip').hidden = !on; },
    /** @param {import('../engine/assets.js').Assets} A */
    ready(A) {
      cssSprite($('mdog'), A, 'idle');
      cssSprite($('mg1'), A, 'ghost');
      cssSprite($('mg2'), A, 'ghost');
      cssSprite($('mrun'), A, 'run');
      $('status').textContent = '';
      /** @type {HTMLButtonElement} */ ($('play')).disabled = false;
    },
    failed() { $('status').textContent = 'Không tải được trò chơi. Kiểm tra mạng rồi tải lại trang.'; },
  };
}
