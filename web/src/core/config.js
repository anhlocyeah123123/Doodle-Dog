// @ts-check
// Mọi con số cân bằng + kịch bản màn chơi nằm ở đây. Sửa độ khó: chỉ cần sửa file này.

/** Kích thước thế giới logic. Canvas luôn vẽ ở hệ tọa độ 960x540 rồi co giãn theo màn hình. */
export const W = 960;
export const H = 540;
/** Tâm thân nhân vật (ma bay về điểm này) và đường mặt đất (chân nhân vật). */
export const CX = 480;
export const CY = 385;
export const GY = 455;

/** @typedef {'HAT_UP'|'HAT_DOWN'|'VERTICAL'|'HORIZONTAL'|'DIAGONAL'|'HEART'|'LIGHTNING'|'SHIELD'|'HOURGLASS'} Spell */

/** Bùa mà ma thường đòi hỏi. Tim chỉ dành cho ma hồi máu, sét là bùa đặc biệt. @type {Spell[]} */
export const POOL = ['HAT_UP', 'HAT_DOWN', 'VERTICAL', 'HORIZONTAL', 'DIAGONAL'];

/** Ký hiệu hiển thị trên đầu ma và trong trận pháp. */
export const GLYPH = {
  HEART: '♥', VERTICAL: '│', HORIZONTAL: '─', HAT_UP: '∧', HAT_DOWN: '∨', DIAGONAL: '╱', LIGHTNING: '⚡', SHIELD: '◯', HOURGLASS: '⧗',
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
  comboBonus: 10,     // điểm thưởng cho mỗi con ma thêm trong một nét
  // Lá chắn: vẽ vòng tròn QUANH nhân vật, mỗi màn dùng được 1 lần
  shieldSec: 5,       // thời gian chắn (giây)
  shieldR: 125,       // bán kính vòng chắn quanh tâm nhân vật
  shieldPush: 170,    // lúc bật: ma trong vùng 2×shieldR bị hất ra xa thêm ... px
  // Đồng hồ cát (trang 3): vẽ hình đồng hồ cát / số 8 -> mọi ma + đồ rơi chậm lại; mỗi màn 1 lần
  slowSec: 6,
  slowK: 0.35,
  // Ma tàng hình (màn 3+): lúc ẩn lúc hiện theo chu kỳ (giây)
  invPeriod: 3.2,
  // Vua Mực pha 2: tắt đèn (màn hình tối đen, chỉ còn đôi mắt Cún) mỗi ... giây, kéo dài ... giây
  darkEvery: 9,
  darkSec: 1.6,
  // Bạn đồng hành: người chơi CHẠM biểu tượng ở góc màn hình để gọi; hồi chiêu ... giây
  munEvery: 8,        // Mèo Mun: phóng sao xóa 1 ký hiệu của con ma gần nhất
  frogEvery: 12,      // Ếch Ộp: nhảy ra nuốt trọn con ma thường gần nhất
  frogReach: 9999,
  batEvery: 15,       // Dơi Bin: hét sóng âm đẩy lùi mọi ma thường + phá đồ rơi
  palStart: 2,        // đầu màn: chờ ... giây mới gọi được lần đầu
  // Chuỗi: vẽ trúng liên tục không trượt / không bị cắn -> hệ số điểm tăng
  chainStep: 5,       // mỗi ... lần trúng liên tiếp tăng hệ số thêm chainAdd
  chainAdd: 0.5,
  chainMax: 3,
  // Sao cuối màn: ★ qua màn · ★ mất ≤ starHp máu · ★ chuỗi dài nhất ≥ starChain
  starHp: 1,
  starChain: 12,
  // Cơ chế riêng của từng boss
  bookFlip: 4.5,      // Ma Sách: ký hiệu hiện tại của boss tự đổi sau ... giây (phải vẽ nhanh)
  gloomEvery: 8,      // Ma Đèn Chùm: thổi tắt nến mỗi ... giây
  gloomSec: 5,        //   ký hiệu ma thường bị che trong ... giây; bùa SÉT thắp sáng lại ngay
  headsEvery: 6,      // Ma Bí Ngô: thả 2 bí ngô con mang CÙNG ký hiệu hiện tại của boss
  headsSpeed: 55,
  brewEvery: 6.5,     // Phù Thủy Vạc: ném thuốc làm 1 con ma thường mọc thêm 1 ký hiệu
  brewMax: 4,         //   tối đa ... ký hiệu mỗi con
  batPush: 120,
};

/**
 * Cốt truyện "Cuốn Sách Mực": mỗi boss giữ 1 trang sách; nhặt trang thì mở khóa bùa / bạn đồng hành cho các màn SAU.
 * Màn được dùng bùa X khi màn >= UNLOCK[X]. Màn tập (0) chỉ dạy nét cơ bản + tim + chạm.
 */
export const UNLOCK = { LIGHTNING: 2, SHIELD: 3, HOURGLASS: 4 };
/** Bạn đồng hành có mặt từ màn ... */
export const PALS = { mun: 2, frog: 3, bat: 4 };
/** @param {number} level */
export const hasSpell = (level, s) => !(s in UNLOCK) || level >= UNLOCK[s];
/** @param {number} level */
export const palsAt = (level) => Object.keys(PALS).filter((k) => level >= PALS[k]);

/** Màu riêng của từng bùa (trận pháp, tia nối tới ma trúng). */
export const SPELL_COLOR = {
  HEART: '#ff4f8b', LIGHTNING: '#f2b600', VERTICAL: '#ff7a1a', HORIZONTAL: '#1fa8e8',
  DIAGONAL: '#8a5cf5', HAT_UP: '#2ec27e', HAT_DOWN: '#e2475f', SHIELD: '#14a89c', HOURGLASS: '#c97a12',
};
/** Kiểu hiệu ứng niệm bùa trên đầu nhân vật: 1 mực viết · 2 pháp ấn vẽ tay · 3 nét bùa bay lên · 4 truyện tranh. */
export const SIGIL_STYLE = 1;

/** Bùa -> animation. Dọc/ngang/V/chéo dùng chung 'cast_h'; tim & sét có animation riêng. */
export const SPELL_ANIM = { HEART: 'love', LIGHTNING: 'bolt', HOURGLASS: 'bolt' };
export const DEFAULT_CAST_ANIM = 'cast_h';

/**
 * @typedef {'wisp'|'swarm'|'inv'|'knight'} Kind
 *   wisp: ma thường · swarm: đàn ma con (nhỏ, CẢ ĐÀN cùng 1 ký hiệu) · inv: ma tàng hình (lúc ẩn lúc hiện)
 *   knight: ma khiên (ký hiệu đầu luôn là ⚡: phải dùng sét phá khiên trước)
 * @typedef {{n:number, m:number, v:number, s:number, t:number, boss:boolean, kind:Kind}} Wave
 *   n: số ma xuất hiện cùng lúc · m: số bùa mỗi ma · v: hệ số tốc độ · s: hệ số cỡ
 *   t: giây xuất hiện tính từ đầu màn · boss: là boss?
 * @typedef {{key:string, name:string, fly:string, hit:string, attack:string|null, drops:string[], king?:boolean, hint:string}} Boss
 *   fly/hit/attack: tên sprite · drops: sprite đồ ném xuống ('flame' = lửa xanh vẽ bằng code)
 * @typedef {{name:string, bg:string, heal:number, waves:Wave[], boss:Boss|null, page:string}} Level
 *   bg: khóa ảnh nền (web/assets/img/<bg>.webp) · heal: giây giữa 2 lần ma tim xuất hiện (khi thiếu máu)
 *   page: trang sách boss giữ (sprite page_<page>)
 */
/** @type {Record<string, Boss>} */
export const BOSSES = {
  book: { key: 'book', name: 'Ma Sách', fly: 'book_fly', hit: 'book_hit', attack: null, drops: ['drop_spider', 'drop_skull'], hint: 'Ma Sách lật trang: ký hiệu boss tự đổi — vẽ thật nhanh!' },
  chand: { key: 'chand', name: 'Ma Đèn Chùm', fly: 'chand_fly', hit: 'chand_hit', attack: 'chand_attack', drops: ['flame'], hint: 'Ma Đèn Chùm thổi tắt nến: dùng SÉT để thắp sáng!' },
  pumpkin: { key: 'pumpkin', name: 'Ma Bí Ngô', fly: 'pumpkin_fly', hit: 'pumpkin_fly', attack: null, drops: ['drop_pumpkin'], hint: 'Bí ngô con mang CÙNG ký hiệu với boss — 1 nét trúng cả!' },
  cauldron: { key: 'cauldron', name: 'Phù Thủy Vạc', fly: 'cauldron_fly', hit: 'cauldron_hit', attack: 'cauldron_attack', drops: ['drop_potion'], hint: 'Thuốc của Phù Thủy làm ma mọc thêm ký hiệu — dọn nhanh!' },
  king: { key: 'king', name: 'Vua Mực', fly: 'king_fly', hit: 'king_hit', attack: 'king_laugh', drops: ['drop_skull', 'drop_spider', 'drop_pumpkin', 'drop_potion'], king: true, hint: 'Pha 2: Vua Mực ĐẢO ký hiệu — thấy ∧ thì vẽ ∨, thấy ─ thì vẽ │!' },
};
/** @returns {Level} */
const level = (name, bg, heal, boss, page, waves) => ({
  name, bg, heal, boss: BOSSES[boss] || null, page,
  waves: waves.map(([n, m, v, s, t, boss, kind]) => ({ n, m, v, s, t, boss: !!boss, kind: kind || 'wisp' })),
});

// Cân bằng bằng bot giả lập (npm run balance).
//                  [số ma, bùa/ma, tốc độ, cỡ, giây, boss?, loại]
/** @type {Record<number, Level>} */
export const LEVELS = {
  1: level('Thư viện tím', 'bg1', 5, 'book', 'bolt', [[3, 1, 1.15, 1, 1], [4, 1, 1.3, 1, 5], [4, 2, 1.35, 1, 9], [1, 3, 1.1, 1, 14, true]]),
  2: level('Đại sảnh nến xanh', 'bg2', 7, 'chand', 'shield', [[5, 1, 1.6, 1, 1], [7, 1, 1.6, 0.62, 4.5, false, 'swarm'], [5, 2, 1.7, 1, 8.5], [8, 2, 1.65, 0.6, 13, false, 'swarm'], [4, 2, 1.75, 1, 17], [1, 4, 1.3, 1, 21, true]]),
  3: level('Nghĩa địa trăng tròn', 'bg3', 8, 'pumpkin', 'hourglass', [[5, 2, 1.75, 1, 1], [5, 2, 1.65, 1, 5, false, 'inv'], [6, 2, 1.8, 1, 9.5], [5, 2, 1.7, 1, 14, false, 'inv'], [7, 2, 1.75, 0.6, 18, false, 'swarm'], [1, 5, 1.4, 1, 22, true]]),
  4: level('Hang phù thủy', 'bg4', 7, 'cauldron', 'blank', [[6, 2, 1.85, 1, 1], [4, 2, 1.6, 1, 5, false, 'knight'], [8, 2, 1.8, 0.6, 9.5, false, 'swarm'], [5, 2, 1.75, 1, 13.5, false, 'inv'], [4, 2, 1.65, 1, 17.5, false, 'knight'], [1, 6, 1.45, 1, 22, true]]),
  5: level('Mái tháp dưới trăng', 'bg5', 6, 'king', 'star', [[6, 2, 1.9, 1, 1], [8, 2, 1.85, 0.6, 4.5, false, 'swarm'], [5, 2, 1.8, 1, 8.5, false, 'inv'], [4, 2, 1.7, 1, 12.5, false, 'knight'], [5, 2, 1.85, 1, 16.5], [1, 6, 1.45, 1, 21, true]]),
};
export const LAST = Math.max(...Object.keys(LEVELS).map(Number));
/** Màn tập (level 0): không có đợt ma, ma do game/tutorial.js đặt từng con; không cắn, không tự qua màn. */
export const TUTORIAL = level('Màn tập', 'bg1', 1e9, '', '', []);

/** Vua Mực pha 2 hiển thị ký hiệu ĐẢO: người chơi phải vẽ ký hiệu ngược lại (ký hiệu thật = MIRROR[ký hiệu hiện]). */
export const MIRROR = { HAT_UP: 'HAT_DOWN', HAT_DOWN: 'HAT_UP', HORIZONTAL: 'VERTICAL', VERTICAL: 'HORIZONTAL' };

/** Số sao cuối màn. @param {{hpLost:number, maxChain:number}} r */
export const starsOf = (r) => 1 + (r.hpLost <= BAL.starHp ? 1 : 0) + (r.maxChain >= BAL.starChain ? 1 : 0);
