// @ts-check
// Giao diện DOM: menu, bảng hướng dẫn, tạm dừng, nút âm thanh, toàn màn hình, xoay ngang.
// Không chứa luật chơi; chỉ gọi các hàm được truyền vào qua `actions`.
import { LAST, LEVELS } from '../core/config.js';
import { audio } from '../engine/audio.js';
import { progress, tutorialSeen, bestStars } from '../game/session.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const stage = $('stage');

/** Ảnh khoe điểm 1200x630: ảnh xem trước của game + số điểm. @returns {Promise<File|null>} */
async function scoreImage(score) {
  const img = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = 'assets/img/og.jpg'; });
  if (!img) return null;
  const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 630;
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  g.drawImage(/** @type {HTMLImageElement} */ (img), 0, 0, 1200, 630);
  g.save(); g.translate(905, 566); g.rotate(-0.04);
  g.fillStyle = '#fbf7ec'; g.strokeStyle = '#1b1bb8'; g.lineWidth = 6;
  g.beginPath(); g.roundRect?.(-215, -50, 430, 100, 16); g.fill(); g.stroke();
  g.fillStyle = '#d8430f'; g.textAlign = 'center'; g.font = 'bold 26px Hand, cursive';
  g.fillText('Điểm của mình', 0, -14);
  g.fillStyle = '#1b1bb8'; g.font = 'bold 50px Hand, cursive';
  g.fillText(String(score), 0, 36);
  g.restore();
  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.88));
  return blob ? new File([/** @type {Blob} */ (blob)], 'doodle-dog-diem.jpg', { type: 'image/jpeg' }) : null;
}

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
const canFullscreen = !!document.documentElement.requestFullscreen && !/iPhone|iPod/.test(navigator.userAgent);   // Android, PC, iPad có; iPhone KHÔNG
const UA = navigator.userAgent;
/** Trình duyệt nằm trong app (Zalo, Messenger...): tên app, hoặc null nếu là trình duyệt thật. */
/** @type {[string, RegExp][]} */
const IN_APPS = [['Zalo', /Zalo/i], ['Messenger', /Messenger|Orca-Android|FB_IAB\/MESSENGER|FBAN\/Messenger/i], ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i],
  ['Instagram', /Instagram/i], ['TikTok', /musical_ly|Bytedance|TikTok/i], ['LINE', /\bLine\//i]];
const IN_APP = IN_APPS.find(([, re]) => re.test(UA))?.[0] || (/; wv\)/.test(UA) ? 'ứng dụng' : null);
const ss = {   // sessionStorage an toàn (chế độ riêng tư / app chặn thì coi như chưa có)
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* bỏ qua */ } },
};

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
 *   setPaused:(p:boolean)=>void, isPlaying:()=>boolean, tbc:()=>void
 * }} actions
 */
export function setupUI(actions) {
  trackSize();
  const splash = $('splash'), menu = $('menu'), hud = $('hud'), help = $('help'), pause = $('pause'), victory = $('victory');

  const refreshMute = () => {
    for (const b of document.querySelectorAll('.mute')) b.textContent = audio.muted ? '🔇' : '🔊';
  };
  let muteAt = -1e9;
  for (const b of document.querySelectorAll('.mute')) {
    b.addEventListener('click', () => {
      if (performance.now() - muteAt < 400) return;   // chạm đúp: chỉ tính 1 lần
      muteAt = performance.now();
      audio.unlock(); audio.toggle(); refreshMute();
    });
  }
  refreshMute();

  // Nút toàn màn hình (góc menu + bảng tạm dừng). iPhone không có API -> mở bảng hướng dẫn thay thế.
  const fsTip = $('fsTip');
  const toggleFs = () => {
    if (canFullscreen) document.fullscreenElement ? document.exitFullscreen() : enterFullscreen();
    else { fsFrom = pause.hidden ? null : pause; pause.hidden = true; fsTip.hidden = false; }
  };
  let fsFrom = /** @type {HTMLElement|null} */ (null);
  const closeFsTip = () => {
    fsTip.hidden = true;
    if (fsFrom) fsFrom.hidden = false;
    if (fsTip.classList.contains('auto')) { fsTip.classList.remove('auto'); maybeWelcome(); }
  };
  fsTip.querySelector('.close')?.addEventListener('click', closeFsTip);
  fsTip.querySelector('.never')?.addEventListener('click', () => { try { localStorage.setItem('dd-iostip', 'off'); } catch { /* bỏ qua */ } closeFsTip(); });

  /**
   * iPhone Safari ĐÃ cầm ngang mà thanh địa chỉ vẫn chiếm chỗ (người mở trang khi máy đang ngang không thấy mẹo ở màn xoay dọc):
   * tự mở bảng hướng dẫn toàn màn hình, mỗi lần mở web 1 lần, có "Không nhắc lại".
   * iOS luôn báo screen.width là cạnh NGẮN -> lúc ngang, innerHeight gần bằng nó nghĩa là thanh công cụ đã ẩn.
   */
  const iPhoneSafari = /iPhone|iPod/.test(navigator.userAgent) && !IN_APP && !standalone;
  const maybeIosTip = () => {
    let off = false;
    try { off = localStorage.getItem('dd-iostip') === 'off'; } catch { /* bỏ qua */ }
    const landscape = innerWidth > innerHeight, barsHidden = innerHeight >= Math.min(screen.width, screen.height) - 30;
    if (!splash.hidden || !iPhoneSafari || off || !landscape || barsHidden || ss.get('dd-iostip') || menu.hidden || !fsTip.hidden || !welcome.hidden) return false;
    ss.set('dd-iostip', '1');
    fsFrom = null;
    fsTip.classList.add('auto');
    fsTip.hidden = false;
    return true;
  };
  // vừa xoay từ dọc sang ngang ở menu -> nhắc (chờ Safari co giãn thanh địa chỉ xong)
  matchMedia('(orientation: landscape)').addEventListener?.('change', (e) => { if (e.matches) setTimeout(maybeIosTip, 600); });
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.fs'))) {
    b.hidden = standalone;
    b.addEventListener('click', toggleFs);
  }

  const buildLevels = () => {
    const unlocked = new URLSearchParams(location.search).has('unlock') ? LAST : progress.get();
    $('lv').innerHTML = Object.keys(LEVELS).map((l) => {
      const locked = Number(l) > unlocked;
      const st = bestStars.get(l);
      const stars = !locked && st ? `<i class="lst">${'★'.repeat(st)}<s>${'★'.repeat(3 - st)}</s></i>` : '';
      return `<button data-l="${l}" ${locked ? 'disabled aria-label="Màn ' + l + ' chưa mở"' : `aria-label="Màn ${l}${st ? ', ' + st + ' sao' : ''}"`}>${locked ? '🔒' : l}${stars}</button>`;
    }).join('');
  };

  if (canFullscreen && !standalone) document.documentElement.classList.add('fs-ok');
  const welcome = $('welcome');
  if (IN_APP) document.documentElement.classList.add('inapp');
  if (standalone) document.documentElement.classList.add('standalone');

  /** @param {number} level 0 = phim mở đầu + màn tập */
  const begin = (level) => {
    audio.unlock();   // phải nằm trong sự kiện chạm để iOS cho phát tiếng
    if (isTouch && ss.get('dd-fs') !== 'off') enterFullscreen();   // Android: toàn màn hình + khóa ngang (iPhone không có API)
    menu.hidden = true; help.hidden = true; pause.hidden = true; welcome.hidden = true;
    hud.hidden = false;
    actions.setPaused(false);
    if (level === 0) actions.story(); else actions.start(level);
  };
  const play = (level) => begin(level);
  // Màn xoay ngang (điện thoại cầm dọc): nút toàn màn hình -> Android tự xoay ngang nhờ khóa hướng màn hình.
  $('rFs').addEventListener('click', () => { ss.set('dd-fs', 'on'); audio.unlock(); enterFullscreen(); });

  // Lần đầu chơi: phim mở đầu -> màn tập -> màn 1. Đã học rồi: vào thẳng màn 1.
  $('play').addEventListener('click', () => play(tutorialSeen.get() ? 1 : 0));
  $('replay').addEventListener('click', () => play(0));

  // Bảng chào lần đầu vào trang: Bắt đầu (kèm toàn màn hình) hoặc bỏ qua hướng dẫn.
  $('wStart').addEventListener('click', () => { ss.set('dd-fs', canFullscreen ? 'on' : 'off'); begin(0); });
  $('wSkip').addEventListener('click', () => { tutorialSeen.set(); welcome.hidden = true; });
  function maybeWelcome() { if (splash.hidden && !tutorialSeen.get() && menu.hidden === false && fsTip.hidden) welcome.hidden = false; }

  // Mở trong Zalo / Messenger...: cảnh báo nằm ngay trên màn xoay ngang (app thường không cho xoay).
  const href = location.href.replace(/[?&]debug\b/, '');
  for (const el of document.querySelectorAll('.iaName')) el.textContent = IN_APP || 'ứng dụng';
  for (const b of document.querySelectorAll('.iaChrome')) b.addEventListener('click', () => {
    location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  });
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.iaCopy'))) b.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(href); ok = true; } catch { /* app chặn clipboard */ }
    const box = /** @type {HTMLInputElement|null} */ (b.closest('.rbox')?.querySelector('.iaLink') ?? null);
    if (!ok && box) {   // dự phòng: hiện ô link, chọn sẵn để người dùng tự chép
      box.hidden = false; box.value = href; box.focus(); box.select(); box.setSelectionRange(0, 9999);
      try { ok = document.execCommand('copy'); } catch { /* bỏ qua */ }
    }
    b.textContent = ok ? '✓ Đã chép link' : 'Giữ ngón tay lên link để chép';
  });
  $('skip').addEventListener('click', () => actions.skip());
  $('lv').addEventListener('click', (e) => {
    const l = Number(/** @type {HTMLElement} */ (e.target).closest?.('button')?.dataset.l);
    if (l) play(l);
  });

  // hướng dẫn
  let helpFromPause = false;
  const openHelp = (fromPause) => { helpFromPause = fromPause; pause.hidden = true; help.hidden = false; };
  $('how').addEventListener('click', () => openHelp(false));
  $('pauseHelp').addEventListener('click', () => openHelp(true));
  help.querySelector('.close')?.addEventListener('click', () => { help.hidden = true; if (helpFromPause) pause.hidden = false; });

  // tạm dừng
  const showPause = () => {
    if (!actions.isPlaying() || !help.hidden || !fsTip.hidden || !victory.hidden) return;
    actions.setPaused(true);
    pause.hidden = false;
  };
  const hidePause = () => { pause.hidden = true; actions.setPaused(false); audio.resume(); audio.playMusic(); };
  $('pauseBtn').addEventListener('click', showPause);
  $('resume').addEventListener('click', hidePause);
  const toMenu = () => {
    pause.hidden = true; help.hidden = true; fsTip.hidden = true; hud.hidden = true; menu.hidden = false;
    victory.hidden = true; clearTimeout(tbcTimer);
    stage.classList.remove('timestop');
    audio.duck(false);
    $('skip').hidden = true;
    actions.setPaused(false);
    actions.quit();
    setBackground('menu');
    buildLevels();
  };
  $('quit').addEventListener('click', toMenu);

  // Chiến thắng: bảng điểm -> "Còn tiếp…" -> tự về menu sau vài giây (chạm để về ngay)
  let tbcTimer = 0;
  const vcard = /** @type {HTMLElement} */ (victory.querySelector('.vcard')), tbc = /** @type {HTMLElement} */ (victory.querySelector('.tbc'));
  // Khoe điểm: chia sẻ ẢNH điểm (nếu máy hỗ trợ) + lời mời + link; không được thì chép chữ để dán vào Zalo.
  let lastScore = 0;
  const shareUrl = location.origin + location.pathname.replace(/index\.html$/, '');
  $('vShare').addEventListener('click', async () => {
    const text = `🐶✨ Mình vừa hạ Vua Mực với ${lastScore} điểm ${'⭐'.repeat(Number($('vStars').dataset.n) || 0)} trong Doodle Dog! Bạn vượt qua được không? Chơi ngay:`;
    const msg = $('vShareMsg');
    try {
      const file = await scoreImage(lastScore);
      const nav = /** @type {any} */ (navigator);
      if (file && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], text: `${text} ${shareUrl}` }); return; }
      if (nav.share) { await nav.share({ title: 'Doodle Dog', text, url: shareUrl }); return; }
    } catch (e) { if (/** @type {any} */ (e)?.name === 'AbortError') return; }
    let ok = false;
    try { await navigator.clipboard.writeText(`${text} ${shareUrl}`); ok = true; } catch { /* app chặn */ }
    msg.textContent = ok ? '✓ Đã chép lời mời + link — dán vào Zalo / Messenger nhé!' : `Chép đoạn này gửi bạn bè: ${text} ${shareUrl}`;
    msg.hidden = false;
  });

  $('vNext').addEventListener('click', () => {   // -> "Còn tiếp…": trang thứ 6 bay về phía mặt trăng (vẽ trên canvas)
    victory.hidden = true;
    actions.tbc();
  });
  tbc.addEventListener('click', toMenu);

  // Ẩn app / có cuộc gọi / khóa màn hình -> tự tạm dừng + tắt tiếng.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { showPause(); audio.suspend(); }
  });
  // Xoay dọc giữa chừng -> tạm dừng (màn hình xoay ngang hiện ra).
  matchMedia('(orientation: portrait) and (max-width: 820px)').addEventListener?.('change', (e) => { if (e.matches) showPause(); });

  setBackground('menu');
  buildLevels();

  // Màn mở đầu: chạm bất kỳ đâu -> mở khóa âm thanh (phải nằm TRONG sự kiện chạm) + nhạc nền phát ngay.
  // ?debug (quay video, kiểm thử) bỏ qua màn này.
  let splashOpen = !new URLSearchParams(location.search).has('debug'), loaded = false;
  splash.hidden = !splashOpen;
  const afterSplash = () => { if (!maybeIosTip()) maybeWelcome(); };
  splash.addEventListener('click', () => {
    if (!splashOpen) return;
    splashOpen = false;
    audio.unlock();
    splash.classList.add('out');
    setTimeout(() => { splash.hidden = true; if (loaded) afterSplash(); }, 500);
  });

  return {
    toMenu,
    /** Thời gian ngưng đọng: cảnh ngoài lãnh địa xám lại. @param {boolean} on */
    timeStop(on) { stage.classList.toggle('timestop', on); },
    /** Đoạn kết: ẩn nút tạm dừng/bỏ qua để màn hình sạch. */
    outro() { hud.hidden = true; },
    /** Hiện bảng chiến thắng (đè lên khung hình đóng băng, làm mờ). @param {number} score */
    victory(score, stars = 0, res = null) {
      $('vScore').textContent = String(score);
      $('vStars').innerHTML = '★'.repeat(stars) + `<s>${'★'.repeat(3 - stars)}</s>`;
      $('vStars').dataset.n = String(stars);
      $('vRes').textContent = res ? `Chuỗi dài nhất ${res.maxChain} · Mất ${res.hpLost} máu` : '';
      let best = 0;
      try { best = Number(localStorage.getItem('dd-best')) || 0; } catch { /* bỏ qua */ }
      const isNew = score > best;
      if (isNew) { best = score; try { localStorage.setItem('dd-best', String(score)); } catch { /* bỏ qua */ } }
      $('vBest').textContent = String(best);
      $('vNew').hidden = !isNew;
      $('vShareMsg').hidden = true;
      lastScore = score;
      vcard.hidden = false; tbc.hidden = true;
      victory.hidden = false;
    },
    /** Hiện nút "Bỏ qua" trong phim mở đầu và màn tập. @param {boolean} on */
    setSkippable(on) { $('skip').hidden = !on; },
    /** @param {import('../engine/assets.js').Assets} A */
    ready(A) {
      loaded = true;
      if (!splashOpen && splash.hidden) afterSplash();   // iPhone cầm ngang: nhắc toàn màn hình trước, xong mới tới bảng chào
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
