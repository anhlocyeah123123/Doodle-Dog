// @ts-check
// Khung nhìn: thế giới game luôn là 960x540 (luật chơi không đổi), nhưng canvas phủ KÍN màn hình.
// Màn rộng hơn 16:9 (điện thoại ~19.5:9) thì nhìn thêm hai bên; màn vuông hơn (iPad 4:3) thì nhìn thêm phía trên.
// Thế giới được căn giữa theo chiều ngang và bám đáy (nhân vật luôn đứng ở cùng chỗ so với mép dưới).
//
//   tọa độ khung nhìn (HUD, thông báo)  = tọa độ thế giới + (ox, oy)
//   pixel CSS                            = tọa độ khung nhìn * s
import { W, H } from '../core/config.js';

const MAX_W = 1200;   // rộng hơn nữa thì ma vừa xuất hiện đã lộ -> để 2 bên là ảnh nền
const MAX_H = 720;

export const VIEW = { w: W, h: H, ox: 0, oy: 0, s: 1 };

/**
 * Tính khung nhìn cho vùng hiển thị cssW x cssH (pixel CSS).
 * free = bỏ giới hạn bề rộng (phim mở đầu: không có ma lộ ra lúc xuất hiện, cần khung phim phủ kín).
 */
export function fitView(cssW, cssH, free = false) {
  const s = Math.max(0.01, Math.min(cssW / W, cssH / H));
  VIEW.s = s;
  VIEW.w = free ? cssW / s : Math.min(cssW / s, MAX_W);
  VIEW.h = free ? cssH / s : Math.min(cssH / s, MAX_H);
  VIEW.ox = (VIEW.w - W) / 2;
  VIEW.oy = VIEW.h - H;
  return VIEW;
}

/** Mép khung nhìn tính theo tọa độ thế giới (để tia bùa quét tới tận mép màn hình). */
export const edges = () => ({ l: -VIEW.ox, r: W + VIEW.ox, t: -VIEW.oy, b: H });

/**
 * Hệ số phóng chữ/HUD trên màn thấp: điện thoại ngang còn thanh Safari chỉ cao ~270px, thế giới bị thu còn ½
 * -> chữ 22px logic chỉ còn 11px thật. Giữ chữ thông báo ≥ ~14px thật.
 */
export const uiK = () => Math.min(1.7, Math.max(1, 0.65 / VIEW.s));
