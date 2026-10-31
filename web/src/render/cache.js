// @ts-check
// Bộ nhớ đệm hình vẽ: chữ, bong bóng bùa, trái tim... được vẽ MỘT LẦN vào canvas nhỏ rồi chỉ dán lại.
// Vẽ chữ (fillText/strokeText) là thao tác đắt nhất trên điện thoại yếu -> giảm mạnh thời gian mỗi khung.

let scale = 1;
/** @type {Map<string, {cv:HTMLCanvasElement, w:number, h:number, ox:number, oy:number}>} */
const store = new Map();
const LIMIT = 400;

/** Gọi khi đổi độ phân giải (giảm chất lượng) để vẽ lại cho nét. */
export function setCacheScale(s) {
  if (s !== scale) { scale = s; store.clear(); }
}
export function clearCache() { store.clear(); }
if (document.fonts) document.fonts.addEventListener?.('loadingdone', clearCache);

/**
 * @param {string} key
 * @param {number} w @param {number} h kích thước (tọa độ logic)
 * @param {number} ox @param {number} oy điểm neo trong ô (vẽ tại x-ox, y-oy)
 * @param {(c:CanvasRenderingContext2D)=>void} paint
 */
export function cached(key, w, h, ox, oy, paint) {
  let e = store.get(key);
  if (!e) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * scale));
    cv.height = Math.max(1, Math.ceil(h * scale));
    const c = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
    c.scale(scale, scale);
    paint(c);
    e = { cv, w, h, ox, oy };
    store.set(key, e);
    if (store.size > LIMIT) store.delete(/** @type {string} */ (store.keys().next().value));
  }
  return e;
}

/** Dán hình đã đệm tại (x, y). */
export function blit(c, e, x, y) {
  c.drawImage(e.cv, x - e.ox, y - e.oy, e.w, e.h);
}

const measurer = /** @type {CanvasRenderingContext2D} */ (document.createElement('canvas').getContext('2d'));
/** @param {string} font @param {string} text */
export function measure(font, text) {
  measurer.font = font;
  return measurer.measureText(text).width;
}
