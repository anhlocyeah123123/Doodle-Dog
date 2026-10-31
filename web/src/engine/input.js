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
 * "Khóa" trang khi đang chơi: không cuộn, không kéo-để-tải-lại, không phóng to bằng 2 ngón / chạm đúp,
 * không bật kính lúp chọn chữ trên iPhone. Chỉ chừa các bảng có thanh cuộn (.card).
 * iOS Safari bỏ qua user-scalable=no trong thẻ viewport, nên phải chặn bằng JS.
 */
export function lockPage() {
  const scrollable = (t) => t instanceof Element && !!t.closest('.card');
  const block = (e) => { if (e.cancelable && !scrollable(e.target)) e.preventDefault(); };
  document.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('touchstart', (e) => { if (e.touches.length > 1) block(e); }, { passive: false });
  for (const g of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(g, (e) => e.preventDefault(), { passive: false });
  let lastEnd = 0;   // chạm đúp nhanh -> iOS phóng to; chặn lần chạm thứ 2 nếu không trúng nút
  document.addEventListener('touchend', (e) => {
    const now = e.timeStamp;
    if (now - lastEnd < 320 && e.cancelable && !(e.target instanceof Element && e.target.closest('button'))) e.preventDefault();
    lastEnd = now;
  }, { passive: false });
}
