"""Cắt các tấm sprite do AI vẽ (nền xanh đậm hoặc nền trắng, có nhãn chữ bên dưới) thành từng khung PNG trong suốt.

Cách làm:
  1. Màu nền = trung vị các điểm viền ảnh.
  2. Độ "khác nền" của mỗi điểm -> alpha mềm (giữ được quầng sáng mờ dần).
  3. Loang từ viền ảnh qua các điểm gần giống nền: vùng loang tới là nền (dùng alpha mềm),
     vùng KHÔNG loang tới (bên trong nét viền, vd lòng vạc đen, thân cú trắng) giữ đặc.
  4. Gom vùng thành từng nhân vật, bỏ nhãn chữ (dải thấp & dài) và dấu ✦ của Gemini.
Ra: raw/frames/<tên>/NN.png + raw/frames/_contact.png để soát.
Chạy: python3 tools/slice_sheets.py
"""
import os, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

SRC = '/home/claude/raw/sheets2'
OUT = '/home/claude/raw/frames'

# tấm -> danh sách hàng, mỗi hàng: [(tên hoạt ảnh, số khung), ...] theo thứ tự trái -> phải
SHEETS = {
    'book_fly': [[('book_fly', 6)]],
    'book_hit': [[('book_hit', 2)]],
    'chand_fly': [[('chand_fly', 6)]],
    'chand_hit': [[('chand_hit', 2)]],
    'chand_attack': [[('chand_attack', 4)]],
    'pumpkin_fly': [[('pumpkin_fly', 6)]],
    'king_laugh': [[('king_laugh', 4)]],
    'king_carry': [[('king_carry', 4)]],
    'king_hit': [[('king_hit', 2)]],
    'king_defeat': [[('king_defeat', 5)]],
    'knight_fly': [[('knight_fly', 5)]],
    'knight_break': [[('knight_break', 4)]],
    'drops': [[('drop_pumpkin', 3)], [('drop_skull', 3)], [('drop_spider', 3)], [('drop_potion', 3)]],
    'owl': [[('owl_idle', 4)], [('owl_talk', 4)], [('owl_point', 3)], [('owl_cheer', 4)], [('owl_panic', 3)]],
    'little_ink': [[('ink_shy', 4)], [('ink_smile', 4)], [('ink_draw', 4)]],
    'king_misc': [[('king_fly', 6)], [('king_rip', 4)], [('king_shrink', 6)]],
    'cauldron': [[('cauldron_fly', 6)], [('cauldron_hit', 2), ('cauldron_attack', 3)]],
    'pages': [[('spellbook_torn', 1), ('page_bolt', 3)], [('page_shield', 3), ('page_hourglass', 3)], [('page_star', 3), ('page_blank', 3)]],
    'dog_page': [[('dog_page', 5)]],
    'frog': [[('frog_idle', 4)], [('frog_hop', 6)], [('frog_tongue', 4)], [('frog_cheer', 3), ('frog_hit', 2), ('frog_sleep', 2)]],
    'bat': [[('bat_fly', 6)], [('bat_screech', 4)], [('bat_hang', 3), ('bat_cheer', 3)], [('bat_hit', 2)]],
    'broom': [[('broom_idle', 4)]],
    'mun': [[('mun_idle', 4)], [('mun_run', 6)], [('mun_cheer', 4), ('mun_cast', 3)], [('mun_scared', 3), ('mun_sleep', 2)]],
}
# tấm hiệu ứng: khung cắt tay (trái, trên, phải, dưới) theo pixel ảnh gốc; soft = chỉ giữ nét (không tô kín bên trong)
MANUAL = {
    'fx': [
        ('fx_poof', [(240, 35, 345, 170), (370, 60, 470, 165), (500, 45, 640, 170), (660, 30, 790, 170), (820, 45, 940, 165)], True),
        ('fx_eyes', [(232, 205, 418, 300), (438, 205, 618, 300), (632, 205, 805, 300)], False),
        ('fx_page', [(35, 380, 165, 505), (180, 385, 322, 505), (322, 335, 440, 485), (445, 375, 602, 528)], False),
        ('fx_hat', [(600, 318, 728, 468), (730, 345, 862, 482), (858, 445, 1018, 532)], False),
    ],
}
# vùng cắt bỏ trước khi xử lý (nhãn hàng bên trái tấm cú) : (trái, trên, phải, dưới) tỉ lệ
CROP = {'owl': (0.158, 0.035, 1, 1), 'broom': (0, 0.33, 1, 0.87)}
# giấy kẻ dòng: xóa các đường kẻ dài thẳng trước khi gom nhân vật
LINES = {'frog', 'broom'}
SEGTH = {'frog': 0.4, 'broom': 0.35}   # ngưỡng gom nhân vật cao hơn: bỏ vân giấy, nét kẻ mờ
# vùng nhãn chữ xóa trước (pixel ảnh gốc) — nhãn nằm sát nhân vật nên tự nhận không chắc
MASKS = {'broom': [(15, 0, 185, 34)],
         'drops': [(0, 197, 1264, 217), (0, 380, 1264, 397), (0, 566, 1264, 585), (0, 776, 1264, 795)],
         'little_ink': [(0, 293, 1264, 315), (0, 554, 1264, 576), (0, 801, 1264, 823)],
         'pages': [(0, 294, 1264, 314), (0, 554, 1264, 576), (0, 806, 1264, 829)],
         'king_misc': [(0, 293, 1264, 314), (0, 553, 1264, 573), (0, 801, 1264, 843)],
         'cauldron': [(0, 321, 1440, 342), (0, 676, 1440, 697)],
         'frog': [(38, 8, 178, 40), (38, 178, 182, 207), (38, 353, 232, 382), (38, 533, 217, 562), (593, 533, 707, 562), (948, 533, 1122, 562)],
         'bat': [(22, 8, 308, 52), (22, 56, 152, 88), (22, 230, 268, 264), (22, 418, 212, 452), (678, 418, 878, 452), (22, 636, 172, 670)],
         'mun': [(15, 5, 200, 46), (15, 207, 190, 246), (15, 395, 225, 436), (705, 397, 890, 440), (15, 627, 228, 669), (760, 630, 948, 672)]}
ATTACH = {'bat': 160}   # khoảng gắn mảnh nhỏ (sóng âm bay xa)
MAINFRAC = {'mun': 0.2, 'bat': 0.33, 'broom': 0.3}   # mảnh nhỏ hơn tỉ lệ này so với nhân vật lớn nhất = đồ đi kèm
FILL = {'dog_page': 6}   # nét phác có khe hở: nối khe rồi tô kín phần bên trong nhân vật
UPSCALE = {'owl': 2, 'mun': 2, 'frog': 2, 'bat': 2, 'broom': 2}
CUTS = {'dog_page': [0.229, 0.414, 0.597, 0.781], 'bat': [(0.818, 0.5, 0.76)]}   # tấm có nhân vật chạm nhau: cắt dọc cưỡng bức
DIL = {'frog': 8, 'bat': 8, 'broom': 10, 'mun': 7, 'owl': 6, 'little_ink': 5, 'pages': 5, 'king_misc': 5, 'dog_page': 4}   # tấm xếp sát: giãn ít


def gemini_mark(im):
    """Xóa dấu ✦ của Gemini ở góc dưới phải (vẽ đè màu nền xung quanh)."""
    a = np.asarray(im).astype(np.float32)
    h, w = a.shape[:2]
    y0, x0 = int(h * 0.80), int(w * 0.86)
    reg = a[y0:, x0:]
    bg = np.median(np.concatenate([reg[0], reg[-1], reg[:, 0], reg[:, -1]]), axis=0)
    d = np.abs(reg - bg).max(axis=2)
    m = d > 18
    lab, n = ndi.label(ndi.binary_dilation(m, iterations=4))
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if np.ptp(ys) < h * 0.09 and np.ptp(xs) < w * 0.06:   # chỉ xóa đốm nhỏ (không phải sprite)
            reg[lab == i] = bg
    a[y0:, x0:] = reg
    return Image.fromarray(a.astype(np.uint8))


def matte(rgb, soft_only=False):
    a = rgb.astype(np.float32)
    h, w = a.shape[:2]
    border = np.concatenate([a[:3].reshape(-1, 3), a[-3:].reshape(-1, 3), a[:, :3].reshape(-1, 3), a[:, -3:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    rng = np.maximum(bg, 255 - bg)
    soft = np.clip((np.abs(a - bg) / rng).max(axis=2), 0, 1)
    soft = np.clip((soft - 0.06) / 0.94, 0, 1)            # bỏ hạt nhiễu / vân giấy
    light = bg.mean() > 128
    # loang nền từ viền
    passable = soft < (0.30 if light else 0.42)
    seeds = np.zeros_like(passable); seeds[0] = seeds[-1] = True; seeds[:, 0] = seeds[:, -1] = True
    lab, _ = ndi.label(passable)
    outside_ids = np.unique(lab[seeds & passable])
    outside = np.isin(lab, outside_ids[outside_ids > 0])
    # viền mờ ngay sát nền (khử răng cưa của nét) cũng tính là nền -> hết chấm trắng quanh nét
    outside = outside | (ndi.binary_dilation(outside, iterations=2) & (soft < 0.6))
    if soft_only: outside = np.ones_like(outside)
    alpha = np.where(outside, soft, 1.0)
    # lỗ nhỏ trong vùng đặc (khe giữa nét) cũng coi là đặc
    solid = ndi.binary_fill_holes(alpha > 0.5)
    alpha = np.where(solid & ~outside, 1.0, alpha)
    alpha = np.maximum(alpha * (soft > 0.02), ndi.gaussian_filter(alpha, 0.9) * (alpha > 0))   # làm mềm mép đặc
    al = np.maximum(alpha, 1e-3)[..., None]
    col = np.where(outside[..., None], bg + (a - bg) / al, a)
    return np.clip(col, 0, 255), alpha, light


def slice_sheet(name, rows):
    im = Image.open(f'{SRC}/{name}.png').convert('RGB')
    if name in CROP:
        l, t, r, b = CROP[name]; W0, H0 = im.size
        im = im.crop((int(l * W0), int(t * H0), int(r * W0), int(b * H0)))
    if name in MASKS:
        dr = ImageDraw.Draw(im); bgc = im.getpixel((3, im.height - 3))
        for b in MASKS[name]: dr.rectangle(b, fill=bgc)
    im = gemini_mark(im)
    if name in UPSCALE:   # tấm nhỏ hiển thị to: phóng trước khi tách nền để viền mượt
        im = im.resize((im.width * UPSCALE[name], im.height * UPSCALE[name]), Image.LANCZOS)
    rgb = np.asarray(im)
    col, alpha, light = matte(rgb)
    H, W = alpha.shape
    if name in FILL:
        inner = ndi.binary_fill_holes(ndi.binary_closing(alpha > 0.45, iterations=FILL[name]))
        col = np.where(inner[..., None] & (alpha < 0.99)[..., None], rgb.astype(np.float32), col)
        alpha = np.where(inner, 1.0, alpha)
    if name in LINES:
        ml = alpha > 0.06
        L = int(W * 0.12)
        mh = ndi.binary_closing(ml, structure=np.ones((1, 25))); mv = ndi.binary_closing(ml, structure=np.ones((25, 1)))   # nối đường kẻ đứt quãng
        lines = ndi.binary_opening(mh, structure=np.ones((1, L))) | ndi.binary_opening(mv, structure=np.ones((L, 1)))
        lines = ndi.binary_dilation(lines, iterations=3)
        alpha = np.where(lines & (alpha < 0.8), 0, alpha)
    m = alpha > SEGTH.get(name, 0.12)
    # bỏ nhãn chữ trước (gom chữ thành từ bằng giãn nhẹ), rồi mới giãn mạnh để gom nhân vật
    l0, _ = ndi.label(ndi.binary_dilation(m, iterations=4))
    for i, sl in enumerate(ndi.find_objects(l0), 1):
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if hh < H * 0.06 and ww > hh * 2.2:
            m[sl][l0[sl] == i] = False
            alpha[sl][l0[sl] == i] = 0
    dm = ndi.binary_dilation(m, iterations=DIL.get(name, 10))
    for c in CUTS.get(name, []):
        fx, a, b = c if isinstance(c, tuple) else (c, 0, 1)
        x = int(fx * W); dm[int(a * H):int(b * H), x - 2:x + 2] = False
    lab, n = ndi.label(dm)
    comps = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        hh, ww = ys.stop - ys.start, xs.stop - xs.start
        area = int((lab[sl] == i).sum())
        comps.append(dict(id=i, y0=ys.start, y1=ys.stop, x0=xs.start, x1=xs.stop, h=hh, w=ww, area=area))
    # nhãn chữ: thấp, dài; hàng chữ trên cùng của tấm cú
    def is_label(c):
        return c['h'] < H * 0.075 and c['w'] > c['h'] * 2.2
    big = [c for c in comps if not is_label(c)]
    amax = max(c['area'] for c in big)
    mf = MAINFRAC.get(name, 0.12)
    main = [c for c in big if c['area'] > amax * mf]
    small = [c for c in big if c['area'] <= amax * mf]
    # mảnh nhỏ (giấy bay, tia lửa) gắn vào nhân vật gần nhất nếu đủ gần
    for s in small:
        cx, cy = (s['x0'] + s['x1']) / 2, (s['y0'] + s['y1']) / 2
        best = min(main, key=lambda c: max(0, c['x0'] - cx, cx - c['x1']) + max(0, c['y0'] - cy, cy - c['y1']))
        dist = max(0, best['x0'] - cx, cx - best['x1']) + max(0, best['y0'] - cy, cy - best['y1'])
        if dist < ATTACH.get(name, 70) and s['area'] > 60:
            best.setdefault('extra', []).append(s)
    # hàng: gom theo tâm y
    main.sort(key=lambda c: (c['y0'] + c['y1']) / 2)
    groups = []   # cùng hàng = chồng nhau theo chiều dọc
    for c in main:
        if groups:
            gy0 = min(e['y0'] for e in groups[-1]); gy1 = max(e['y1'] for e in groups[-1])
            ov = min(gy1, c['y1']) - max(gy0, c['y0'])
            if ov > 0.4 * min(c['h'], gy1 - gy0):
                groups[-1].append(c); continue
        groups.append([c])
    for g in groups: g.sort(key=lambda c: c['x0'])
    want = [sum(k for _, k in r) for r in rows]
    got = [len(g) for g in groups]
    if got != want:
        raise SystemExit(f'{name}: muốn {want} khung/hàng, tìm thấy {got}')
    out = {}
    for g, row in zip(groups, rows):
        i = 0
        for anim, k in row:
            frames = []
            for c in g[i:i + k]:
                ids = [c['id']] + [e['id'] for e in c.get('extra', [])]
                mk = np.isin(lab, ids)
                x0 = min([c['x0']] + [e['x0'] for e in c.get('extra', [])]); x1 = max([c['x1']] + [e['x1'] for e in c.get('extra', [])])
                y0 = min([c['y0']] + [e['y0'] for e in c.get('extra', [])]); y1 = max([c['y1']] + [e['y1'] for e in c.get('extra', [])])
                a = np.where(mk, alpha, 0)[y0:y1, x0:x1]
                rgba = np.dstack([col[y0:y1, x0:x1], a * 255]).astype(np.uint8)
                frames.append(dict(img=Image.fromarray(rgba, 'RGBA'), x0=x0, y0=y0, x1=x1, y1=y1))
            i += k
            out[anim] = frames
    return out


def pack(frames):
    """Đặt các khung vào ô chung: căn giữa ngang theo tâm khung, giữ độ cao tương đối trong tấm (để nhún nhảy giữ nguyên)."""
    top = min(f['y0'] for f in frames); bot = max(f['y1'] for f in frames)
    cw = max(f['x1'] - f['x0'] for f in frames) + 8
    ch = bot - top + 8
    cells = []
    for f in frames:
        cell = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        cell.alpha_composite(f['img'], ((cw - f['img'].width) // 2, f['y0'] - top + 4))
        cells.append(cell)
    return cells


def slice_manual(name, specs, up=2):
    src = Image.open(f'{SRC}/{name}.png').convert('RGB')
    out = {}
    for anim, boxes, soft in specs:
        frames = []
        for b in boxes:
            im = src.crop(b).resize(((b[2] - b[0]) * up, (b[3] - b[1]) * up), Image.LANCZOS)
            pad = Image.new('RGB', (im.width + 8, im.height + 8), im.getpixel((0, 0)))   # viền nền để loang được
            pad.paste(im, (4, 4))
            col, alpha, _ = matte(np.asarray(pad), soft)
            rgba = np.dstack([col, alpha * 255]).astype(np.uint8)
            frames.append(dict(img=Image.fromarray(rgba, 'RGBA'), x0=b[0] * up, y0=b[1] * up, x1=b[0] * up + pad.width, y1=b[1] * up + pad.height))
        out[anim] = frames
    return out


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    info = {}
    import sys
    only = sys.argv[1:]
    for name, specs in MANUAL.items():
        if only and name not in only: continue
        for anim, frames in slice_manual(name, specs).items():
            d = f'{OUT}/{anim}'; os.makedirs(d, exist_ok=True)
            for j, f in enumerate(frames): f['img'].save(f'{d}/{j + 1:02d}.png')
            info[anim] = dict(n=len(frames), size=frames[0]['img'].size)
            print(f'{anim:16s} {len(frames)} khung (tay)')
    for name, rows in SHEETS.items():
        if only and name not in only: continue
        for anim, frames in slice_sheet(name, rows).items():
            d = f'{OUT}/{anim}'; os.makedirs(d, exist_ok=True)
            for j, cell in enumerate(pack(frames)):
                cell.save(f'{d}/{j + 1:02d}.png')
            info[anim] = dict(n=len(frames), size=pack(frames)[0].size)
            print(f'{anim:16s} {len(frames)} khung  {info[anim]["size"]}')
    try: old = json.load(open(f'{OUT}/_info.json'))
    except Exception: old = {}
    old.update(info); json.dump(old, open(f'{OUT}/_info.json', 'w'), indent=1)
    # tấm soát: mỗi hoạt ảnh 1 hàng trên nền ca rô + nền tím game
    rows = []
    for anim in info:
        cells = [Image.open(f'{OUT}/{anim}/{j + 1:02d}.png') for j in range(info[anim]['n'])]
        k = 120 / max(c.height for c in cells)
        cells = [c.resize((max(1, int(c.width * k)), max(1, int(c.height * k)))) for c in cells]
        rows.append((anim, cells))
    Wc = max(sum(c.width + 6 for c in cs) + 130 for _, cs in rows)
    sheet = Image.new('RGB', (Wc, len(rows) * 126), (150, 120, 190))
    d = ImageDraw.Draw(sheet)
    for r, (anim, cs) in enumerate(rows):
        y = r * 126; x = 130
        for yy in range(y, y + 126, 12):
            for xx in range(0, Wc, 12):
                if ((xx // 12) + (yy // 12)) % 2: d.rectangle([xx, yy, xx + 11, yy + 11], fill=(120, 95, 160))
        d.text((4, y + 50), anim, fill='white')
        for c in cs:
            sheet.paste(c, (x, y + 3), c); x += c.width + 6
    sheet.save(f'{OUT}/_contact.png')
