"""
Tạo toàn bộ asset tối ưu cho web từ asset gốc.

    python3 tools/build_assets.py <thư_mục_gốc>                 # chạy tất cả
    python3 tools/build_assets.py <thư_mục_gốc> --only font,music

<thư_mục_gốc> chứa các file webp/png/jpeg nhân vật + thư mục `zip_assets/`
(chính là thư mục `assets/` trong zip gốc: background/, ghosts/, audio/, fonts/).

Đầu ra: web/assets/ (sprites/, img/, audio/, fonts/, icons/) + web/assets/manifest.json
Cần: pip install pillow numpy scipy fonttools brotli ; ffmpeg
"""
import argparse
import json
import math
import os
import statistics as st
import subprocess

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'web', 'assets')
MANIFEST = os.path.join(OUT, 'manifest.json')

BODY_SIZE = 125        # căn bậc hai diện tích thân nhân vật (px) -> mọi animation cùng cỡ
GHOST_SIZE = 90
MAX_TEXTURE = 4096     # GPU điện thoại cũ không nhận ảnh rộng hơn

# tên animation: (file gốc, số frame tối đa, fps, lặp?)
ANIMS = {
    'idle':   ('idle_trong_suot_v2.webp', 20, 10, True),
    'run':    ('dog_run_12fps_1.webp', 18, 12, True),
    'win':    ('dog_win_improved.webp', 20, 12, True),
    'lose':   ('dog_lose.webp', 8, 8, False),
    'cast_h': ('lam_phep_ngang_trong_suot.webp', 3, 8, False),  # bùa dọc / ngang / V / chéo
    'love':   ('dog_love.webp', 2, 6, False),                   # bùa tim (hồi máu)
    'bolt':   ('mascot_transparent.webp', 2, 6, False),         # bùa sét
    'wave':   ('cast_wand_wave.webp', 16, 14, True),            # đang vẽ
    'hit':    ('dog_hit.webp', 2, 8, False),                    # bị ma cắn
    'alert':  ('dog_alert.webp', 3, 6, True),                   # có đợt ma mới
}
# nền theo màn (khóa dùng trong core/config.js -> LEVELS[].bg)
BACKGROUNDS = {
    'bg1': 'IMG_5715.png',
    'bg2': 'Gemini_Generated_Image_jyox74jyox74jyox.png',
    'bg3': 'zip_assets/background/3.png',
    'bg4': 'zip_assets/background/10.png',
    'menu': 'zip_assets/background/6.png',
}
FONT_SRC = 'zip_assets/fonts/2.ttf'   # Momo Signature: viết tay, đủ dấu tiếng Việt
MUSIC_GAIN = 0.32                     # iOS bỏ qua audio.volume -> giảm âm lượng ngay trong file


def load_manifest():
    if os.path.exists(MANIFEST):
        return json.load(open(MANIFEST))
    return {'sprites': {}, 'images': {}}


def alpha_bbox(im):
    return im.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()


def pick_frames(im, max_frames):
    n = im.n_frames
    m = min(max_frames, n)
    idx = sorted({round(i * (n - 1) / max(1, m - 1)) for i in range(m)})
    frames = []
    for i in idx:
        im.seek(i)
        frames.append(im.convert('RGBA'))
    return frames


def check_texture(name, width):
    if width > MAX_TEXTURE:
        raise SystemExit(f'{name}: dải ảnh rộng {width}px > {MAX_TEXTURE}px, hãy giảm số frame')


def build_sprites(src, man):
    """Mọi animation được cắt sát, chuẩn hóa cùng cỡ thân, chân neo đáy giữa."""
    rows = []
    print(f"{'anim':7}{'gốc':>12}{'thân':>7}{'scale':>7}{'ô':>12}")
    for key, (file, max_frames, fps, loop) in ANIMS.items():
        frames = pick_frames(Image.open(os.path.join(src, file)), max_frames)
        boxes = [alpha_bbox(f) for f in frames]
        union = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
        body = st.median(math.sqrt((b[2] - b[0]) * (b[3] - b[1])) for b in boxes)
        scale = BODY_SIZE / body
        w = math.ceil((union[2] - union[0]) * scale)
        h = math.ceil((union[3] - union[1]) * scale)
        check_texture(key, w * len(frames))
        strip = Image.new('RGBA', (w * len(frames), h))
        for i, f in enumerate(frames):
            strip.paste(f.crop(union).resize((w, h), Image.LANCZOS), (i * w, 0))
        strip.save(f'{OUT}/sprites/{key}.webp', quality=78, method=6)
        man['sprites'][key] = dict(w=w, h=h, n=len(frames), fps=fps, loop=int(loop))
        rows.append((key, strip, frames, w, h))
        print(f"{key:7}{str(frames[0].size):>12}{body:>7.0f}{scale:>7.2f}{str((w, h)):>12}")
    compare_sheet(rows)


def compare_sheet(rows):
    """docs/sprite_compare.png: hàng trên = gốc (chỉ ép cao), hàng dưới = đã chuẩn hóa, chung đường nền."""
    sheet = Image.new('RGB', (len(rows) * 230, 420), '#1b1f4a')
    g = ImageDraw.Draw(sheet)
    for i, (key, strip, frames, w, h) in enumerate(rows):
        old = frames[len(frames) // 2]
        ow = round(old.width * 150 / old.height)
        o = old.resize((ow, 150))
        sheet.paste(o, (i * 230 + 10, 20), o)
        cell = strip.crop((0, 0, w, h))
        sheet.paste(cell, (i * 230 + 10, 400 - h), cell)
        g.text((i * 230 + 10, 4), key + ' (goc)', fill='white')
        g.text((i * 230 + 10, 405), key + ' (moi)', fill='#9be7ff')
    g.line((0, 170, sheet.width, 170), fill='#555')
    g.line((0, 400, sheet.width, 400), fill='#555')
    sheet.save(os.path.join(ROOT, 'docs', 'sprite_compare.png'))


def build_ghosts(src, man):
    """Tách 5 frame ma bay từ bảng IMG_5717 (nền tối) -> dải ảnh trong suốt + bản boss nhuộm đỏ tím."""
    from scipy import ndimage as ndi
    im = np.array(Image.open(f'{src}/IMG_5717.jpeg').convert('RGB')).astype(int)
    band = im[75:205]   # bỏ dòng tiêu đề và nhãn chữ
    bg = np.median(np.concatenate([band[:6].reshape(-1, 3), band[-6:].reshape(-1, 3)]), axis=0)
    dist = np.abs(band - bg).sum(2)
    core = ndi.binary_fill_holes(ndi.binary_opening(dist > 80, iterations=1))
    cols = np.where(ndi.binary_dilation(core.any(0), iterations=14))[0]
    groups = [g for g in np.split(cols, np.where(np.diff(cols) > 1)[0] + 1) if len(g) > 25][:5]
    glow = np.clip((dist - 25) / 110, 0, 1) * 0.75   # giữ quầng sáng xanh mờ quanh viền
    alpha = np.where(core, 1.0, glow)
    rgb = np.where(core[..., None], band, np.array([150, 195, 255])).astype('uint8')
    rgba = np.dstack([rgb, (alpha * 255).astype('uint8')])
    frames = []
    for g in groups:
        f = Image.fromarray(rgba[:, g[0]:g[-1] + 1], 'RGBA')
        frames.append(f.crop(f.getbbox()))
    scale = GHOST_SIZE / st.median(math.sqrt(f.width * f.height) for f in frames)
    cw = max(round(f.width * scale) for f in frames)
    ch = max(round(f.height * scale) for f in frames)
    strip = Image.new('RGBA', (cw * len(frames), ch))
    for i, f in enumerate(frames):
        f = f.resize((round(f.width * scale), round(f.height * scale)), Image.LANCZOS)
        strip.paste(f, (i * cw + (cw - f.width) // 2, (ch - f.height) // 2), f)
    strip.save(f'{OUT}/sprites/ghost.webp', quality=85, method=6)
    man['sprites']['ghost'] = dict(w=cw, h=ch, n=len(frames), fps=8, loop=1)

    x = np.array(strip).astype(float)
    x[..., 1] *= .5
    x[..., 2] *= .8
    x[..., 0] = np.minimum(255, x[..., 0] * 1.05 + 25)
    Image.fromarray(x.astype('uint8'), 'RGBA').save(f'{OUT}/sprites/boss.webp', quality=85, method=6)
    man['sprites']['boss'] = dict(man['sprites']['ghost'])

    heart = Image.open(f'{src}/zip_assets/ghosts/heart_ghost.png').convert('RGBA')
    heart = heart.crop(alpha_bbox(heart))
    k = 75 / math.sqrt(heart.width * heart.height)
    heart.resize((round(heart.width * k), round(heart.height * k)), Image.LANCZOS).save(f'{OUT}/img/ghost_heart.webp', quality=88)
    man['images']['ghost_heart'] = 'img/ghost_heart.webp'


def build_backgrounds(src, man):
    """Nền 960x540 WebP (~25-70KB). Nền không nằm trong manifest: CSS tải theo màn, màn sau được nạp trước."""
    for key, file in BACKGROUNDS.items():
        Image.open(os.path.join(src, file)).convert('RGB').resize((960, 540), Image.LANCZOS) \
            .save(f'{OUT}/img/{key}.webp', quality=72, method=6)


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *args], check=True)


def build_audio(src, man):
    """1 = nhạc nền (đã giảm âm lượng sẵn), 3 = bùa, 4 = sét, 5 = bị cắn. Mono MP3 chạy mọi trình duyệt."""
    a = f'{src}/zip_assets/audio'
    ffmpeg('-i', f'{a}/1.ogg', '-af', f'volume={MUSIC_GAIN}', '-ac', '1', '-b:a', '56k', f'{OUT}/audio/1.mp3')
    for n in ('3', '4', '5'):
        ffmpeg('-i', f'{a}/{n}.ogg', '-ac', '1', '-b:a', '64k', f'{OUT}/audio/{n}.mp3')


def build_font(src, man):
    """Cắt font chỉ còn Latin + tiếng Việt + dấu câu -> woff2 vài chục KB."""
    from fontTools import subset
    os.makedirs(f'{OUT}/fonts', exist_ok=True)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    font = subset.load_font(os.path.join(src, FONT_SRC), opts)
    s = subset.Subsetter(opts)
    vietnamese = [0x102, 0x103, 0x110, 0x111, 0x128, 0x129, 0x168, 0x169, 0x1A0, 0x1A1, 0x1AF, 0x1B0]
    s.populate(unicodes=list(range(0x20, 0x7F)) + list(range(0xC0, 0x100)) + vietnamese
               + list(range(0x300, 0x324)) + list(range(0x1EA0, 0x1EFA))
               + [0xB7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x20AB])
    s.subset(font)
    subset.save_font(font, f'{OUT}/fonts/hand.woff2', opts)


def build_icons(src, man):
    """Icon cài ứng dụng (Android) + apple-touch-icon (iPhone) từ frame idle."""
    os.makedirs(f'{OUT}/icons', exist_ok=True)
    im = Image.open(f'{src}/idle_trong_suot_v2.webp')
    im.seek(0)
    dog = im.convert('RGBA')
    dog = dog.crop(alpha_bbox(dog))
    for size in (180, 192, 512):
        icon = Image.new('RGBA', (size, size), '#0b1030')
        d = ImageDraw.Draw(icon)
        d.ellipse((size * .06, size * .06, size * .94, size * .94), fill='#fbf7ec')
        k = size * .72 / max(dog.size)
        sp = dog.resize((round(dog.width * k), round(dog.height * k)), Image.LANCZOS)
        icon.paste(sp, ((size - sp.width) // 2, (size - sp.height) // 2 + round(size * .03)), sp)
        icon.convert('RGB').quantize(64).save(f'{OUT}/icons/icon-{size}.png', optimize=True)


STEPS = {'sprites': build_sprites, 'ghosts': build_ghosts, 'backgrounds': build_backgrounds,
         'audio': build_audio, 'font': build_font, 'icons': build_icons}

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--only', default=','.join(STEPS))
    args = ap.parse_args()
    for d in ('sprites', 'img', 'audio'):
        os.makedirs(f'{OUT}/{d}', exist_ok=True)
    man = load_manifest()
    for step in args.only.split(','):
        print('==', step)
        STEPS[step](os.path.abspath(args.src), man)
    json.dump(man, open(MANIFEST, 'w'), indent=1)
