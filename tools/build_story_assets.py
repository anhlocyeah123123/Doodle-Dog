"""Đóng gói khung đã cắt (raw/frames, do tools/slice_sheets.py tạo) thành dải sprite .webp cho cốt truyện 5 màn,
rồi GỘP vào web/assets/manifest.json (giữ nguyên các sprite cũ của build_assets.py).

Mỗi hoạt ảnh: chiều cao THÂN nhân vật ở khung mẫu (đơn vị thế giới 960x540) -> tự tính tỉ lệ.
Ảnh lưu ở độ phân giải R lần kích thước hiển thị cho nét sắc trên điện thoại; manifest ghi k = 1/R để vẽ đúng cỡ.
Chạy: python3 tools/build_story_assets.py   (sau slice_sheets.py)
"""
import json, os
import numpy as np
from PIL import Image

FR = '/home/claude/raw/frames'
OUT = os.path.join(os.path.dirname(__file__), '..', 'web', 'assets')
R = 1.5

# tên: (chiều cao thân ở khung mẫu, khung mẫu, fps, lặp?, chuỗi khung (None = theo thứ tự), nhuộm)
SPEC = {
    # ma thường / ma mới
    'knight_fly': (100, 0, 8, 1, None, None),
    'knight_break': (100, 0, 10, 0, None, None),
    # boss trang sách
    'book_fly': (150, 0, 8, 1, None, None),
    'book_hit': (150, 0, 6, 0, None, None),
    'chand_fly': (200, 0, 8, 1, None, None),
    'chand_hit': (180, 0, 6, 0, None, None),
    'chand_attack': (200, 0, 8, 0, None, None),
    'pumpkin_fly': (160, 0, 8, 1, None, None),
    'cauldron_fly': (170, 0, 8, 1, None, None),
    'cauldron_hit': (175, 0, 6, 0, None, None),
    'cauldron_attack': (175, 0, 8, 0, None, None),
    # Vua Mực + Mực Con
    'king_fly': (175, 0, 8, 1, None, None),
    'king_laugh': (175, 0, 8, 1, None, None),
    'king_carry': (175, 0, 8, 1, None, None),
    'king_hit': (140, 0, 6, 0, None, None),
    'king_defeat': (165, 0, 7, 0, None, None),
    'king_rip': (165, 0, 6, 0, None, None),
    'king_shrink': (165, 0, 5, 0, None, None),
    'ink_shy': (62, 0, 4, 1, None, None),
    'ink_smile': (62, 0, 5, 1, None, None),
    'ink_draw': (62, 0, 4, 0, None, None),
    # cô Cú (đứng trên chồng sách) — 'owl' (12 khung chớp mắt) do màn mở đầu dùng, làm riêng ở menu
    'owl_idle': (120, 0, 6, 1, [0, 0, 0, 0, 0, 3, 0, 0, 1, 2, 1, 0], None),
    'owl_talk': (106, 0, 7, 1, None, None),
    'owl_point': (82, 0, 6, 0, None, None),
    'owl_cheer': (78, 0, 8, 1, None, None),
    'owl_panic': (104, 0, 8, 1, None, None),
    # Mèo Mun (bạn đồng hành từ màn 2)
    'mun_idle': (62, 0, 5, 1, None, None),
    'mun_run': (58, 0, 12, 1, None, None),
    'mun_cheer': (62, 0, 8, 0, None, None),
    'mun_cast': (62, 0, 9, 0, None, None),
    'mun_scared': (62, 0, 8, 0, None, None),
    'mun_sleep': (44, 0, 2, 1, None, None),
    # Ếch Ộp (màn 3+) và Dơi Bin (màn 4+)
    'frog_idle': (66, 0, 5, 1, None, None),
    'frog_hop': (66, 0, 12, 0, [0, 1, 2, 4, 5], None),
    'frog_tongue': (66, 0, 9, 0, None, None),
    'frog_cheer': (70, 0, 7, 0, None, None),
    'frog_hit': (66, 0, 5, 0, None, None),
    'frog_sleep': (50, 0, 2, 1, None, None),
    'bat_fly': (46, 0, 12, 1, None, None),
    'bat_screech': (52, 0, 8, 0, None, None),
    'bat_hang': (60, 0, 3, 1, None, None),
    'bat_cheer': (46, 0, 8, 0, None, None),
    'bat_hit': (52, 0, 6, 0, None, None),
    'broom_idle': (40, 0, 6, 1, None, None),
    # Cún nhặt trang sách
    'dog_page': (135, 3, 4, 0, [0, 1, 3, 4], None),   # khung 3 (sáng rực) tách nền hỏng -> bỏ
    # đồ boss ném
    'drop_pumpkin': (44, 0, 6, 1, None, None),
    'drop_skull': (44, 0, 6, 1, None, None),
    'drop_spider': (40, 0, 6, 1, None, None),
    'drop_potion': (50, 0, 6, 1, None, None),
    # sách + trang
    'spellbook_torn': (95, 0, 1, 1, None, None),
    'page_bolt': (66, 0, 6, 1, None, None),
    'page_shield': (66, 0, 6, 1, None, None),
    'page_hourglass': (66, 0, 6, 1, None, None),
    'page_star': (66, 0, 6, 1, None, None),
    'page_blank': (66, 0, 6, 1, None, None),
    # hiệu ứng
    'fx_poof': (110, 3, 14, 0, None, 'white'),
    'fx_eyes': (120, 0, 3, 0, None, None),
    'fx_hat': (40, 2, 10, 0, None, None),
}


# cần ngay từ đầu (màn tập); còn lại tải ngầm sau khi menu sẵn sàng
EAGER = {'owl_idle', 'owl_talk', 'owl_cheer', 'fx_poof', 'drop_pumpkin'}


def body_h(im):
    """Chiều cao mảng lớn nhất (thân nhân vật) — bỏ qua sao, chữ z, sóng âm bay xa."""
    from scipy import ndimage as ndi
    a = np.asarray(im)[:, :, 3] > 60
    lab, n = ndi.label(ndi.binary_dilation(a, iterations=3))
    if not n: return im.height
    sizes = ndi.sum(a, lab, range(1, n + 1))
    sl = ndi.find_objects(lab)[int(np.argmax(sizes))]
    return sl[0].stop - sl[0].start


def tint_white(im):
    """Nét mực xanh -> nét trắng có viền xanh nhạt (đọc rõ trên nền tối)."""
    a = np.asarray(im).astype(np.float32)
    lum = a[:, :, :3].mean(axis=2, keepdims=True) / 255
    col = np.array([235, 245, 255], np.float32) * (0.75 + 0.25 * lum)
    out = np.dstack([np.broadcast_to(col, a[:, :, :3].shape), a[:, :, 3:]])
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def build():
    man_p = os.path.join(OUT, 'manifest.json')
    man = json.load(open(man_p))
    os.makedirs(os.path.join(OUT, 'sprites'), exist_ok=True)
    total = 0
    import sys
    only = sys.argv[1:]
    for name, (th, ref, fps, loop, seq, tint) in SPEC.items():
        if only and name not in only: continue
        d = os.path.join(FR, name)
        files = sorted(f for f in os.listdir(d) if f.endswith('.png'))
        frames = [Image.open(os.path.join(d, f)).convert('RGBA') for f in files]
        scale = th * R / body_h(frames[ref])
        w, h = max(1, round(frames[0].width * scale)), max(1, round(frames[0].height * scale))
        frames = [f.resize((w, h), Image.LANCZOS) for f in frames]
        if tint == 'white': frames = [tint_white(f) for f in frames]
        order = seq if seq else list(range(len(frames)))
        strip = Image.new('RGBA', (w * len(order), h))
        for j, i in enumerate(order): strip.paste(frames[i], (j * w, 0))
        p = os.path.join(OUT, 'sprites', f'{name}.webp')
        strip.save(p, quality=82, method=6)
        total += os.path.getsize(p)
        man['sprites'][name] = {'w': w, 'h': h, 'n': len(order), 'fps': fps, 'loop': loop, 'k': round(1 / R, 4)}
        if name not in EAGER: man['sprites'][name]['lazy'] = 1   # tải nền sau khi vào menu
        print(f'{name:16s} {w}x{h} x{len(order)}  {os.path.getsize(p) // 1024}KB')
    man['images']['splash'] = 'img/splash.webp'
    json.dump(man, open(man_p, 'w'), indent=1)
    if not only: print('tổng', total // 1024, 'KB')


if __name__ == '__main__':
    build()
