// @ts-check
import { VIEW } from '../render/view.js';

const MIN_GAP = 3;   // bỏ bớt điểm sát nhau -> nét nhẹ hơn để vẽ, nhận dạng không đổi

/**
 * Nét vẽ bằng Pointer Events (một API cho chuột, cảm ứng, bút).
 * Chỉ nhận ngón tay ĐẦU TIÊN: ngón thứ hai chạm vào không làm hỏng nét đang vẽ.
 * @param {HTMLCanvasElement} canvas
 * @param {(pts:number[][], touch:boolean)=>void} onStroke gọi khi nhấc tay; tọa độ thế giới 960x540;
 *   touch = vẽ bằng ngón tay/bút (rung hơn chuột -> bộ nhận dạng nới tay hơn)
 * @returns {{pts:number[][], down:boolean, fade:number, touch:boolean}} trạng thái nét để lớp vẽ hiển thị
 */
export function bindStroke(canvas, onStroke) {
  const trail = { pts: [], down: false, fade: 0, touch: false };
  let id = -1;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * VIEW.w) / r.width - VIEW.ox, ((e.clientY - r.top) * VIEW.h) / r.height - VIEW.oy];
  };
  const add = (p) => {
    const q = trail.pts[trail.pts.length - 1];
    if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) >= MIN_GAP) trail.pts.push(p);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || id !== -1) return;
    id = e.pointerId;
    try { canvas.setPointerCapture(id); } catch { /* đã nhả */ }
    trail.pts = [pos(e)];
    trail.down = true;
    trail.fade = 0;
    trail.touch = e.pointerType !== 'mouse';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const c of list.length ? list : [e]) add(pos(c));
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = -1;
    trail.down = false;
    trail.fade = 0.25;   // nét mờ dần trong 0.25s (lớp vẽ trừ dần), nét mới sẽ thay thế ngay
    onStroke(trail.pts, trail.touch);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // nhấn giữ trên Android không bật menu
  return trail;
}

/**
 * "Khóa" trang: không cuộn, không kéo-để-tải-lại, không phóng to bằng 2 ngón / chạm đúp,
 * không bật kính lúp chọn chữ trên iPhone. Chỉ chừa các bảng có thanh cuộn (.card).
 * iOS Safari bỏ qua user-scalable=no trong thẻ viewport, nên phải chặn bằng JS.
 * Lưới an toàn: nếu trang LỠ bị phóng to (vd chạm đúp quá nhanh), cho phép 2 ngón thu nhỏ lại
 * và tự đưa về cỡ chuẩn sau giây lát — không bao giờ kẹt ở trạng thái phóng to.
 */
export function lockPage() {
  const vv = window.visualViewport;
  const zoomed = () => (vv?.scale ?? 1) > 1.01;
  const scrollable = (t) => t instanceof Element && !!t.closest('.card');
  const block = (e) => { if (e.cancelable && !zoomed() && !scrollable(e.target)) e.preventDefault(); };
  document.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) block(e); }, { passive: false });
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, (e) => { if (!zoomed()) e.preventDefault(); }, { passive: false });

  // Chạm đúp nhanh -> iOS phóng to. Chặn lần chạm thứ 2 ở MỌI chỗ (kể cả nút).
  // Nếu lần 2 trúng một nút KHÁC nút vừa bấm thì tự bấm hộ (không mất thao tác); cùng nút thì bỏ (tránh bật/tắt 2 lần).
  let lastEnd = 0, lastBtn = /** @type {Element|null} */ (null);
  document.addEventListener('touchend', (e) => {
    if (e.touches.length) return;
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (e.timeStamp - lastEnd < 350 && e.cancelable && !zoomed()) {
      e.preventDefault();
      if (btn && btn !== lastBtn && !(/** @type {HTMLButtonElement} */ (btn).disabled)) /** @type {HTMLElement} */ (btn).click();
    }
    lastEnd = e.timeStamp; lastBtn = btn;
  }, { passive: false });

  // Lỡ bị phóng to: đặt lại thẻ viewport -> iOS tự thu về cỡ chuẩn.
  const meta = document.querySelector('meta[name=viewport]');
  const base = meta?.getAttribute('content') || '';
  let timer = 0;
  const resetZoom = () => {
    if (!meta || !zoomed()) return;
    meta.setAttribute('content', base + ',minimum-scale=1');
    requestAnimationFrame(() => meta.setAttribute('content', base));
  };
  vv?.addEventListener('resize', () => { clearTimeout(timer); timer = window.setTimeout(resetZoom, 700); });
  window.addEventListener('orientationchange', () => window.setTimeout(resetZoom, 300));
}
