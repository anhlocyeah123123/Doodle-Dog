# Kiến trúc

```
web/                       <- toàn bộ trang web (xuất bản thẳng lên Netlify)
├─ index.html              khung HTML: canvas + menu + bảng hướng dẫn/tạm dừng + màn xoay ngang
├─ sw.js                   service worker: offline, cập nhật bản mới
├─ manifest.json           cài như ứng dụng (icon, toàn màn hình, khóa ngang)
├─ assets/                 do tools/build_assets.py sinh ra – KHÔNG sửa tay
└─ src/
   ├─ main.js              khởi động: nạp asset, nối UI + phiên chơi + vòng lặp, chất lượng hình
   ├─ style.css            giao diện sổ vẽ, co giãn theo màn hình, mức tối thiểu cho điện thoại
   ├─ core/                LOGIC THUẦN – không DOM, không âm thanh -> chạy được trong Node/test/bot
   │  ├─ config.js         MỌI con số cân bằng + kịch bản 4 màn (LEVELS) + bảng bùa -> animation
   │  ├─ sim.js            mô phỏng 1 màn: đợt ma, ma nhiều bùa, ma tim, sét, boss 2 pha, ký tự rơi
   │  └─ recognizer.js     nét vẽ -> tên bùa (hình học, không học máy)
   ├─ engine/              lớp nền tảng dùng lại được cho game khác
   │  ├─ loop.js           60 bước logic/giây cố định + phát hiện giật để hạ chất lượng
   │  ├─ input.js          Pointer Events (chuột/cảm ứng/bút), chỉ nhận ngón đầu tiên
   │  ├─ audio.js          mở khóa âm thanh iOS/Android, SFX WebAudio, nhạc nền <audio>
   │  └─ assets.js         nạp sprite/ảnh theo manifest + font, tự thử lại khi mạng lỗi
   ├─ game/
   │  ├─ session.js        trạng thái phiên: intro → play → clear/over/won; sự kiện Sim -> hiệu ứng/âm thanh/animation
   │  └─ effects.js        hạt mực, vòng sóng, tia sét, thông báo, rung (thuần hình ảnh)
   ├─ render/
   │  ├─ draw.js           vẽ 1 khung hình từ trạng thái (không đổi trạng thái)
   │  ├─ ink.js            phong cách bút mực: nét vẽ, chữ, tim, bong bóng bùa
   │  ├─ sigil.js          hiệu ứng niệm bùa (4 kiểu, SIGIL_STYLE) + tia quét theo nét vẽ
   │  └─ cache.js          đệm hình chữ/bong bóng -> không vẽ chữ lại mỗi khung (rất tốn trên máy yếu)
   └─ ui/menu.js           DOM: menu, chọn màn, hướng dẫn, tạm dừng, âm thanh, toàn màn hình
tests/                     test.js (luật + nhận dạng), balance.js (bot đo độ khó)
tools/                     build_assets.py (tạo asset), serve.js (server chạy thử)
```

## Luồng dữ liệu (một chiều)

```
ngón tay ─► input.js ─► session.stroke() ─► recognizer ─► sim.cast()
                                                          │
loop.js ─► session.update(dt) ─► sim.tick(dt) ─► sim.ev[] (sự kiện) ─► effects + audio + animation
       └─► draw(view)  ◄── chỉ đọc trạng thái
```

`core/` không biết gì về màn hình hay âm thanh: nó chỉ đẩy sự kiện vào `sim.ev`
(danh sách sự kiện ghi ở đầu `sim.js`). Nhờ vậy cùng một `Sim` dùng được cho test, bot cân bằng,
và sau này chạy trên máy chủ/máy chủ phòng khi làm online (cùng seed -> cùng diễn biến).

## Làm thường gặp

- **Chỉnh độ khó / thêm màn:** thêm 1 dòng vào `LEVELS` trong `core/config.js`, thêm nền vào `BACKGROUNDS`
  trong `tools/build_assets.py`, chạy `npm run assets <thư_mục_gốc> -- --only backgrounds`, rồi `npm run balance`.
- **Đổi kiểu hiệu ứng niệm bùa:** `SIGIL_STYLE` trong `core/config.js` (xem thử: thêm `?sigil=1..4` vào URL).
- **Bùa quét nhiều ma:** vùng trúng ở `inArea()` trong `core/sim.js`; độ rộng `BAL.beamBand`, `BAL.vPad`.
- **Đổi animation của bùa:** `SPELL_ANIM` trong `core/config.js`. Thêm animation mới: thêm vào `ANIMS` trong build_assets.
- **Thêm bùa mới:** 1) nhận dạng trong `recognizer.js` + test, 2) thêm vào `POOL`/`GLYPH`, 3) hiệu ứng trong `session.handleEvents`.
- **Thêm hiệu ứng:** `fx.add({t:'tên', ...})` trong session + một nhánh trong `drawFx` (render/draw.js).

## Hiệu năng (đã đo, xem docs/DEPLOY.md)

- Ảnh nền là CSS phía sau canvas trong suốt -> trình duyệt tự ghép, không vẽ lại.
- Chữ và bong bóng được đệm vào canvas nhỏ; nét vẽ = 3 lệnh vẽ cho cả nét.
- JS mỗi khung < 1ms ngay cả khi CPU chậm 6 lần; phần nặng là trình duyệt dựng hình
  -> loop.js phát hiện giật và hạ độ phân giải canvas 1.5× → 1× → 0.75×, giảm hạt, bỏ nét phụ.
- Máy ≤ 4 nhân hoặc ≤ 2GB RAM bắt đầu ở mức giữa.
- Sprite: mỗi dải ảnh < 4096px (giới hạn GPU cũ, build_assets.py tự kiểm tra). Tổng asset ~1.7MB, nhạc tải sau lần chạm đầu.

## Quy ước

- Mọi file `// @ts-check` + JSDoc: `npm run typecheck` bắt lỗi kiểu mà không cần bước build.
- Chú thích bằng tiếng Việt, tên biến tiếng Anh.
- `core/` không được import từ `engine/`, `render/`, `game/`, `ui/`.
