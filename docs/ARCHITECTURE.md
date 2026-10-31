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
   │  └─ recognizer.js     nét vẽ -> tên bùa: lấy mẫu → làm mượt → rút gọn RDP → bỏ móc → đếm góc gập
   │                       (ngón tay: làm mượt mạnh hơn chuột, xem TUNE)
   ├─ engine/              lớp nền tảng dùng lại được cho game khác
   │  ├─ loop.js           60 bước logic/giây cố định + phát hiện giật để hạ chất lượng
   │  ├─ input.js          Pointer Events (chuột/cảm ứng/bút), chỉ nhận ngón đầu tiên
   │  ├─ audio.js          mở khóa âm thanh iOS/Android, SFX WebAudio, nhạc nền <audio>
   │  └─ assets.js         nạp sprite/ảnh theo manifest + font, tự thử lại khi mạng lỗi
   ├─ game/
   │  ├─ session.js        trạng thái phiên: cutscene → tutorial → intro → play → clear/over/won; sự kiện Sim -> hiệu ứng/âm thanh
   │  ├─ tutorial.js       màn tập: 10 bước (STEPS), mỗi bước đặt ma + nét mẫu, chờ người chơi làm đúng
   │  └─ effects.js        hạt mực, vòng sóng, tia sét, thông báo, rung (thuần hình ảnh)
   ├─ render/
   │  ├─ view.js           khung nhìn: canvas phủ kín màn hình, thế giới 960x540 ở giữa (bám đáy)
   │  ├─ draw.js           vẽ 1 khung hình từ trạng thái (không đổi trạng thái); HUD phóng to trên màn thấp
   │  ├─ ink.js            phong cách bút mực: nét vẽ, chữ, tim, bong bóng bùa
   │  ├─ sigil.js          hiệu ứng niệm bùa (4 kiểu, SIGIL_STYLE) + tia quét theo nét vẽ
   │  ├─ cutscene.js       phim mở đầu ~12.5s vẽ bằng canvas từ sprite có sẵn (kịch bản theo mốc giây, CUES = âm thanh)
   │  ├─ guide.js          bàn tay mực vẽ mẫu + băng lời dặn của màn tập
   │  ├─ outro.js          đoạn kết hạ boss, khớp nhịp assets/audio/ult.mp3: thời gian ngưng → lãnh địa sao → điểm sáng → bắn (sấm) → nổ
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

## Phim mở đầu + màn tập

- Lần đầu bấm **Chơi ngay**: phim mở đầu → màn tập → màn 1. Học xong lưu `localStorage['dd-tut']`, lần sau vào thẳng màn 1.
- Nút **Bỏ qua ⏭** (góc trên): phim → màn tập → màn 1. Xem lại: bảng *Cách chơi* → *Xem phim mở đầu + màn tập*.
- Màn tập dùng chính `Sim` ở chế độ level 0 (`sim.tut`): ma đứng yên, không cắn, không tự qua màn.
- Sửa kịch bản phim: các mốc giây trong `render/cutscene.js`. Thêm/bớt bước tập: mảng `STEPS` trong `game/tutorial.js`
  (test `npm test` tự đi hết màn tập bằng nét mẫu, nên bước nào có nét mẫu không nhận ra được sẽ báo lỗi).

## Lá chắn + boss màn 4

- Vẽ **vòng kín bao quanh nhân vật** = `SHIELD` (recognizer nhận `around: [CX, CY]`; vòng ở chỗ khác vẫn là tim).
  Bật 5 giây (`BAL.shieldSec`): hất ma gần ra xa, ma chạm vòng bị đẩy ngược (sự kiện `block`), đồ rơi bị phá. Mỗi màn 1 lần (`sim.shieldUsed`), HUD có biểu tượng còn/đang chắn/đã dùng.
- Đồ boss ném có **báo trước** `BAL.symWarn` giây (vòng nhấp nháy + "!" trên mặt đất) rồi mới rơi; rơi chậm hơn, thưa hơn.
- Dãy bùa của boss luôn được kẹp vào trong màn hình (dưới dòng tiêu đề), thấy ngay từ lúc boss xuất hiện.
- Thông báo (toast) xếp **từ đáy màn hình lên**, tối đa 2 cái: ma bay tới từ phía trên nên không che ký hiệu.

## Boss cuối + đoạn kết

- Boss **lướt vào từ mép phải** (`sim.bossEnter`, tốc độ `BAL.bossEnter`), dừng ở x = W − 140 rồi mới tiến về nhân vật.
  Sang pha 2 / cắn trúng: lướt vào lại từ mép phải.
- Hết bùa pha cuối: Sim **giữ boss lại** (`sim.finale`, sự kiện `finale`, `tick()` dừng). Session chuyển sang trạng thái
  `outro` và vẽ `render/outro.js`; tới `OUTRO_HIT` gọi `sim.finishBoss()` (boss mất, cộng điểm, `won`); tới `OUTRO_DUR`
  hiện bảng **Bạn đã chiến thắng** (DOM, nền làm mờ bằng `backdrop-filter`) → *Tiếp tục* → **Còn tiếp…** → tự về menu.
- Trong phim mở đầu và đoạn kết, khung nhìn được mở rộng phủ kín mọi bề rộng màn hình (`fitView(..., free=true)`).

## Bảng thông báo đầu game (ui/menu.js)

1. **Mở trong app** (Zalo, Messenger, Facebook, Instagram, TikTok, LINE, WebView Android): khuyên mở bằng trình duyệt thật.
   Android có nút *Mở bằng Chrome* (`intent://…;package=com.android.chrome`); iPhone không có cách tự mở Safari nên chỉ hướng dẫn
   + *Sao chép link*. *Vẫn chơi ở đây* → ghi nhớ trong phiên (`sessionStorage['dd-inapp']`).
2. **Lần đầu vào trang** (chưa có `localStorage['dd-tut']`): bảng chào → *Bắt đầu* (toàn màn hình + phim mở đầu + màn tập) hoặc *Bỏ qua hướng dẫn*.
3. **Trước khi vào game**: nếu chưa toàn màn hình, hỏi bật (mỗi lần mở web hỏi 1 lần, `sessionStorage['dd-fs']`). iPhone: hướng dẫn *Thêm vào MH chính*.

### Âm thanh đoạn kết

`web/assets/audio/ult.mp3` (7.9 giây) cắt từ đoạn KHÔNG có giọng nói của file người dùng gửi (`raw/outro_snd/src2.mp3`):
ghép 20.85–23.4s (cú đập + ầm rền) với 25.4–31.0s (riser → tiếng vút → lắng → nổ), xem `tools/build_assets.py`.
Mốc hình trong `render/outro.js` (bảng `T`): cú đập 0.15s = thời gian ngưng · riser 2.6–4.45s = sao hội tụ ·
tiếng vút 4.55s = bắn · tiếng nổ 6.05s = trúng boss · hết 7.85s = bảng chiến thắng. Đổi âm thanh khác thì chỉnh bảng `T`.
Nhạc nền tạm im trong đoạn kết (`audio.duck`).
