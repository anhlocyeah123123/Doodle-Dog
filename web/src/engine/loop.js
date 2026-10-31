// @ts-check
// Vòng lặp cố định 60 lần/giây cho logic + vẽ mỗi khung hình.
// Tự giảm chất lượng khi máy đuối, xét mỗi cửa sổ 90 khung:
//  1. JS xử lý trung bình > 9ms/khung (hơn nửa ngân sách 16.7ms), hoặc
//  2. GIẬT: 12–90% số khung bị trễ (> 25ms) -> màn hình 60Hz nhưng trình duyệt dựng hình không kịp.
// iPhone Tiết kiệm pin khóa đều 30fps (gần 100% khung "trễ" đều nhau) -> không giật -> không hạ oan.

const STEP = 1 / 60;
const WINDOW = 90;        // số khung hình để lấy trung bình
const BUSY_MS = 9;
const LATE_MS = 25;

/**
 * @param {(dt:number)=>void} update
 * @param {()=>void} render
 * @param {()=>void} onSlow gọi khi máy yếu, tối đa 1 lần mỗi 3 giây
 */
export function startLoop(update, render, onSlow) {
  let last = performance.now(), acc = 0, work = 0, late = 0, frames = 0, cooldown = 3;
  let paused = false;
  const stats = { busy: 0, late: 0 };   // số đo cửa sổ gần nhất (xem bằng ?debug)
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);   // chặn bước nhảy lớn khi quay lại tab
    last = now;
    const t0 = performance.now();
    if (!paused) {
      acc += dt;
      while (acc >= STEP) { update(STEP); acc -= STEP; }
    }
    render();
    work += performance.now() - t0;
    if (dt * 1000 > LATE_MS) late++;
    cooldown -= dt;
    if (++frames >= WINDOW) {
      const busy = work / frames, lateRatio = late / frames;
      stats.busy = busy; stats.late = lateRatio;
      const janky = lateRatio > 0.12 && lateRatio < 0.9;
      if (!paused && cooldown <= 0 && (busy > BUSY_MS || janky)) { onSlow(); cooldown = 3; }
      work = 0; late = 0; frames = 0;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return {
    stats,
    get paused() { return paused; },
    set paused(v) { paused = v; acc = 0; },
  };
}
