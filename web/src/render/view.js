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

/** sx, sy, sw, sh: vùng AN TOÀN (trừ tai thỏ, thanh Home) trong tọa độ khung nhìn -> đặt chữ, nút, HUD trong vùng này. */
export const VIEW = { w: W, h: H, ox: 0, oy: 0, s: 1, sx: 0, sy: 0, sw: W, sh: H };

/**
 * Tính khung nhìn cho vùng an toàn cssW x cssH (pixel CSS, đã trừ tai thỏ / thanh Home).
 * full: cả màn hình, tính theo góc trên-trái vùng an toàn ({dx, dy, w, h}). Có full (phim mở đầu, đoạn kết):
 *   canvas phủ KÍN cả màn hình kể cả tai thỏ, nhưng thế giới vẫn nằm ĐÚNG chỗ và đúng cỡ như lúc chơi
 *   (cùng s, cùng vị trí) -> chuyển cảnh không bị giật, chỉ phần nền đen/trời sao lan ra tới mép.
 * @param {{dx:number, dy:number, w:number, h:number}|null} [full]
 */
export function fitView(cssW, cssH, full = null) {
  const s = Math.max(0.01, Math.min(cssW / W, cssH / H));
  const w0 = Math.min(cssW / s, MAX_W), h0 = Math.min(cssH / s, MAX_H);
  VIEW.s = s;
  if (!full) {
    VIEW.w = w0; VIEW.h = h0;
    VIEW.ox = (w0 - W) / 2; VIEW.oy = h0 - H;
    VIEW.sx = 0; VIEW.sy = 0; VIEW.sw = w0; VIEW.sh = h0;
    return VIEW;
  }
  // gốc thế giới (pixel CSS, tính từ góc vùng an toàn) giống hệt lúc chơi: canvas căn giữa vùng an toàn, thế giới bám đáy
  const wx = (cssW - w0 * s) / 2 + ((w0 - W) / 2) * s, wy = (cssH - h0 * s) / 2 + (h0 - H) * s;
  VIEW.w = full.w / s; VIEW.h = full.h / s;
  VIEW.ox = (wx - full.dx) / s; VIEW.oy = (wy - full.dy) / s;
  VIEW.sx = -full.dx / s; VIEW.sy = -full.dy / s; VIEW.sw = cssW / s; VIEW.sh = cssH / s;
  return VIEW;
}

/** Mép khung nhìn tính theo tọa độ thế giới (để tia bùa / lãnh địa phủ tới tận mép màn hình). */
export const edges = () => ({ l: -VIEW.ox, r: VIEW.w - VIEW.ox, t: -VIEW.oy, b: VIEW.h - VIEW.oy });

/** Mép vùng AN TOÀN tính theo tọa độ thế giới (đặt nhân vật / bóng thoại không bị tai thỏ che). */
export const safeEdges = () => ({ l: VIEW.sx - VIEW.ox, r: VIEW.sx + VIEW.sw - VIEW.ox, t: VIEW.sy - VIEW.oy, b: VIEW.sy + VIEW.sh - VIEW.oy });

/**
 * Hệ số phóng chữ/HUD trên màn thấp: điện thoại ngang còn thanh Safari chỉ cao ~270px, thế giới bị thu còn ½
 * -> chữ 22px logic chỉ còn 11px thật. Giữ chữ thông báo ≥ ~14px thật.
 */
export const uiK = () => Math.min(1.7, Math.max(1, 0.65 / VIEW.s));
/** Tâm vùng an toàn (tọa độ khung nhìn). */
export const safeCx = () => VIEW.sx + VIEW.sw / 2;
