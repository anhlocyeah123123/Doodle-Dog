// @ts-check
// Mọi con số cân bằng + kịch bản màn chơi nằm ở đây. Sửa độ khó: chỉ cần sửa file này.

/** Kích thước thế giới logic. Canvas luôn vẽ ở hệ tọa độ 960x540 rồi co giãn theo màn hình. */
export const W = 960;
export const H = 540;
/** Tâm thân nhân vật (ma bay về điểm này) và đường mặt đất (chân nhân vật). */
export const CX = 480;
export const CY = 385;
export const GY = 455;

/** @typedef {'HAT_UP'|'HAT_DOWN'|'VERTICAL'|'HORIZONTAL'|'DIAGONAL'|'HEART'|'LIGHTNING'|'SHIELD'} Spell */

/** Bùa mà ma thường đòi hỏi. Tim chỉ dành cho ma hồi máu, sét là bùa đặc biệt. @type {Spell[]} */
export const POOL = ['HAT_UP', 'HAT_DOWN', 'VERTICAL', 'HORIZONTAL', 'DIAGONAL'];

/** Ký hiệu hiển thị trên đầu ma và trong trận pháp. */
export const GLYPH = {
  HEART: '♥', VERTICAL: '│', HORIZONTAL: '─', HAT_UP: '∧', HAT_DOWN: '∨', DIAGONAL: '╱', LIGHTNING: '⚡', SHIELD: '◯',
};

export const BAL = {
  hp: 5,              // máu tối đa
  hitR: 55,           // bán kính va chạm với nhân vật
  v0: 38,             // tốc độ ma cơ bản (px/giây), nhân với hệ số của đợt
  spawnR: 600,        // ma xuất hiện trên cung tròn bán kính này quanh nhân vật -> mọi con cách đều
  bossK: 0.35,        // boss chậm hơn ma thường
  bossPhase2: 1.5,    // boss pha 2 nhanh hơn
  bossEnter: 300,     // boss lướt vào từ mép PHẢI màn hình với tốc độ này, dừng ở x = W - 140 rồi mới tiến về nhân vật
  heal: 1,            // máu hồi khi diệt ma tim
  healSpeed: 85,      // ma tim bay ngang (không tấn công)
  boltCd: 4,          // hồi chiêu bùa sét (giây)
  symEvery: 3.0,      // boss thả ký tự rơi mỗi ... giây
  symSpeed: 115,      // tốc độ ký tự rơi
  symWarn: 0.9,       // vòng báo trên mặt đất hiện trước ... giây rồi ký tự mới rơi
  symHitR: 55,        // ký tự rơi trúng nhân vật nếu lệch ít hơn
  popR: 60,           // chạm trong bán kính này để phá ký tự
  introSec: 1.6,      // thời gian nhân vật chạy vào màn
  beamBand: 60,       // bùa ngang/dọc/chéo trúng ma cách đường vẽ ít hơn ... px
  vPad: 45,           // bùa V trúng ma trong khung chữ V nới rộng thêm ... px
  comboBonus: 10,     // điểm thưởng cho mỗi con ma thêm trong một nét
  // Lá chắn: vẽ vòng tròn QUANH nhân vật, mỗi màn dùng được 1 lần
  shieldSec: 5,       // thời gian chắn (giây)
  shieldR: 125,       // bán kính vòng chắn quanh tâm nhân vật
  shieldPush: 170,    // lúc bật: ma trong vùng 2×shieldR bị hất ra xa thêm ... px
};

/** Màu riêng của từng bùa (trận pháp, tia quét). */
export const SPELL_COLOR = {
  HEART: '#ff4f8b', LIGHTNING: '#f2b600', VERTICAL: '#ff7a1a', HORIZONTAL: '#1fa8e8',
  DIAGONAL: '#8a5cf5', HAT_UP: '#2ec27e', HAT_DOWN: '#e2475f', SHIELD: '#14a89c',
};
/** Kiểu hiệu ứng niệm bùa trên đầu nhân vật: 1 mực viết · 2 pháp ấn vẽ tay · 3 nét bùa bay lên · 4 truyện tranh. */
export const SIGIL_STYLE = 1;

/** Bùa -> animation. Dọc/ngang/V/chéo dùng chung 'cast_h'; tim & sét có animation riêng. */
export const SPELL_ANIM = { HEART: 'love', LIGHTNING: 'bolt' };
export const DEFAULT_CAST_ANIM = 'cast_h';

/**
 * @typedef {{n:number, m:number, v:number, s:number, t:number, boss:boolean}} Wave
 *   n: số ma xuất hiện cùng lúc · m: số bùa mỗi ma · v: hệ số tốc độ · s: hệ số cỡ
 *   t: giây xuất hiện tính từ đầu màn · boss: là boss?
 * @typedef {{name:string, bg:string, heal:number, waves:Wave[]}} Level
 *   bg: khóa ảnh nền (web/assets/img/<bg>.webp) · heal: giây giữa 2 lần ma tim xuất hiện (khi thiếu máu)
 */
/** @returns {Level} */
const level = (name, bg, heal, waves) => ({
  name, bg, heal,
  waves: waves.map(([n, m, v, s, t, boss]) => ({ n, m, v, s, t, boss: !!boss })),
});

// Lấy từ LEVEL_CONFIG bản Python, đã cân bằng lại bằng bot giả lập (npm run balance).
//                  [số ma, bùa/ma, tốc độ, cỡ, giây, boss?]
/** @type {Record<number, Level>} */
export const LEVELS = {
  1: level('Thư viện tím', 'bg1', 5, [[3, 1, 1.1, 1, 1], [4, 1, 1.2, 1, 5], [3, 2, 1.25, 1, 9], [1, 5, 1.3, 1.2, 13]]),
  2: level('Đại sảnh nến xanh', 'bg2', 8, [[4, 1, 1.5, 1, 1], [5, 2, 1.55, 1, 5], [3, 3, 1.6, 1, 9], [1, 7, 1.7, 1.4, 13]]),
  3: level('Nghĩa địa trăng tròn', 'bg3', 10, [[3, 2, 1.6, 1, 1], [4, 3, 1.65, 1, 5], [2, 4, 1.7, 1.2, 10], [1, 6, 1.8, 2, 14]]),
  4: level('Hang phù thủy — BOSS', 'bg4', 6, [[4, 2, 1.65, 1, 1], [4, 3, 1.7, 1, 6], [2, 4, 1.75, 1.2, 11], [1, 5, 1.7, 3, 16, true]]),
};
export const LAST = Math.max(...Object.keys(LEVELS).map(Number));
/** Màn tập (level 0): không có đợt ma, ma do game/tutorial.js đặt từng con; không cắn, không tự qua màn. */
export const TUTORIAL = level('Màn tập', 'bg1', 1e9, []);
