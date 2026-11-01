// @ts-check
// Nạp sprite + ảnh theo assets/manifest.json (do tools/build_assets.py sinh ra) và font viết tay.

/** @typedef {{w:number,h:number,n:number,fps:number,loop:number,k?:number,lazy?:number,img:HTMLImageElement|null}} Sprite
 *   k: hệ số vẽ (ảnh lưu nét hơn cỡ hiển thị) · lazy: tải ngầm sau khi vào menu (không chờ) */
/** @typedef {{sprites:Record<string,Sprite>, img:Record<string,HTMLImageElement|null>}} Assets */

const loadImage = (src) => new Promise((resolve) => {
  const i = new Image();
  i.decoding = 'async';
  i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(i));   // giải mã trước -> không giật khi vẽ lần đầu
  i.onerror = () => resolve(null);
  i.src = src;
});

/** Font dùng chung cho HTML và canvas. Không chờ quá 2.5 giây (mạng chậm vẫn chơi được bằng font dự phòng). */
export const FONT = '"Hand", "Segoe Print", "Comic Sans MS", cursive';
async function loadFont() {
  if (!document.fonts) return;
  await Promise.race([document.fonts.load('700 20px Hand', 'Đợt ma'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
}

/** @returns {Promise<Assets>} */
export async function loadAssets(base = 'assets/', tries = 3) {
  try {
    const res = await fetch(base + 'manifest.json');
    if (!res.ok) throw new Error(String(res.status));
    const m = await res.json();
    /** @type {Assets} */
    const A = { sprites: {}, img: {} };
    await Promise.all([
      loadFont(),
      ...Object.entries(m.sprites).filter(([, v]) => !v.lazy).map(async ([k, v]) => { A.sprites[k] = { ...v, img: await loadImage(`${base}sprites/${k}.webp`) }; }),
      ...Object.entries(m.images).map(async ([k, v]) => { A.img[k] = await loadImage(base + v); }),
    ]);
    // sprite cốt truyện (boss, bạn đồng hành, đoạn phim): tải ngầm, vẽ được ngay khi tải xong (chưa xong thì bỏ qua)
    for (const [k, v] of Object.entries(m.sprites)) {
      if (!v.lazy) continue;
      A.sprites[k] = { ...v, img: null };
      loadImage(`${base}sprites/${k}.webp`).then((img) => { A.sprites[k].img = img; });
    }
    return A;
  } catch (e) {
    if (tries <= 1) throw e;
    await new Promise((r) => setTimeout(r, 1200));
    return loadAssets(base, tries - 1);
  }
}
