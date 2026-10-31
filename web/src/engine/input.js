// @ts-check
import { W, H } from '../core/config.js';

const MIN_GAP = 3;   // bỏ bớt điểm sát nhau -> nét nhẹ hơn để vẽ, nhận dạng không đổi

/**
 * Nét vẽ bằng Pointer Events (một API cho chuột, cảm ứng, bút).
 * Chỉ nhận ngón tay ĐẦU TIÊN: ngón thứ hai chạm vào không làm hỏng nét đang vẽ.
 * @param {HTMLCanvasElement} canvas
 * @param {(pts:number[][])=>void} onStroke gọi khi nhấc tay, tọa độ logic 960x540
 * @returns {{pts:number[][], down:boolean, fade:number}} trạng thái nét để lớp vẽ hiển thị
 */
export function bindStroke(canvas, onStroke) {
  const trail = { pts: [], down: false, fade: 0 };
  let id = -1;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  const add = (p) => {
    const q = trail.pts[trail.pts.length - 1];
    if (!q || Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) >= MIN_GAP) trail.pts.push(p);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || id !== -1) return;
    id = e.pointerId;
    canvas.setPointerCapture(id);
    trail.pts = [pos(e)];
    trail.down = true;
    trail.fade = 0;
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
    onStroke(trail.pts);
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // nhấn giữ trên Android không bật menu
  return trail;
}
