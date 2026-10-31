# Đưa game lên mạng

`web/` là trang tĩnh hoàn chỉnh – không cần máy chủ, không cần lệnh build.
Netlify tự cấp HTTPS (bắt buộc để cài như ứng dụng, chơi offline và để âm thanh ổn định trên điện thoại).

## Netlify

**Cách 1 – kéo thả (nhanh nhất):** vào https://app.netlify.com/drop rồi kéo **thư mục `web`**
(không phải cả dự án) vào trang -> nhận link `ten-ngau-nhien.netlify.app`.
Cập nhật: trang site → Deploys → kéo thả lại thư mục `web`. Đổi tên: Site configuration → Change site name.

**Cách 2 – nối GitHub (tự deploy mỗi lần push):** đẩy dự án lên GitHub → Netlify → Add new site →
Import an existing project → chọn repo. Build command: để trống. Publish directory: `web`
(`netlify.toml` đã khai báo sẵn).

**Cách 3 – dòng lệnh:** `npx netlify-cli deploy --dir=web --prod`

Cloudflare Pages / GitHub Pages / Vercel cũng được: thư mục xuất bản `web`, không lệnh build.
File `web/_headers` (không cache `sw.js`) được cả Cloudflare lẫn Netlify đọc.

## Toàn màn hình trên điện thoại

- **Android / iPad / PC:** bấm "Chơi ngay" trên điện thoại Android là tự vào toàn màn hình và khóa ngang; nút ⛶ ở góc menu.
- **iPhone:** Safari không cho web tự bật toàn màn hình. Nút ⛶ mở hướng dẫn: *Chia sẻ → Thêm vào MH chính*
  (mở từ biểu tượng là kín màn hình như ứng dụng), hoặc *aA → Ẩn thanh công cụ*.
- Khi đang chơi trang bị khóa: không cuộn, không kéo-để-tải-lại, không phóng to 2 ngón/chạm đúp (`lockPage()` trong `engine/input.js`).

## Âm thanh trên điện thoại – đã xử lý gì

| Vấn đề | Cách xử lý |
|---|---|
| Trình duyệt chặn tiếng trước khi chạm | Âm thanh mở khóa đúng lúc bấm "Chơi ngay" / chọn màn |
| iPhone bỏ qua chỉnh âm lượng của `<audio>` | Nhạc nền đã giảm âm lượng sẵn trong file `1.mp3` |
| iPhone ngắt âm thanh sau cuộc gọi / chuyển app | Tự tạm dừng; chạm lại là phát tiếp |
| Safari phát nhạc bằng yêu cầu Range, service worker làm hỏng | Service worker bỏ qua file âm thanh |
| Tiếng hiệu ứng đầu tiên bị mất | Dữ liệu SFX tải sẵn khi mở trang |

Lưu ý: iPhone gạt **công tắc im lặng** thì hiệu ứng (WebAudio) tắt theo quy định của iOS, nhạc nền vẫn kêu.

## Kiểm tra sau khi deploy (5 phút)

1. **Android (Chrome):** mở link → "Chơi ngay" → game vào toàn màn hình, khóa ngang, có nhạc.
   Menu Chrome ⋮ → "Cài đặt ứng dụng" để có icon ngoài màn hình chính.
2. **iPhone (Safari):** mở link, xoay ngang → "Chơi ngay" → có nhạc + tiếng bùa (tắt công tắc im lặng).
   Chia sẻ → "Thêm vào MH chính" để chơi không có thanh địa chỉ.
3. Cầm dọc: phải hiện "Xoay ngang điện thoại để chơi". Đang chơi mà về màn hình chính: game tự tạm dừng.
4. Bật chế độ máy bay rồi mở lại từ icon: màn chơi vẫn chạy (offline).
5. Deploy bản mới: người chơi tải lại trang là nhận code mới; ảnh mới có hiệu lực từ lần mở sau.
   Muốn xóa sạch cache cũ: đổi `VERSION` trong `web/sw.js`.

## Đã kiểm thử (trình duyệt Chromium giả lập điện thoại)

- Khung 844×390 (iPhone 14), 667×375 (iPhone SE), 640×360 (Android nhỏ), 1180×820 (iPad), dọc 390×844.
- Mọi nút ≥ 44px, chữ ≥ 15px; menu và bảng hướng dẫn vừa khung 640×360 không cần cuộn.
- Chơi tự động trọn 4 màn → boss → thắng; tạm dừng giữ nguyên thời gian; không lỗi JavaScript.
- CPU chậm 4×: giữ chất lượng cao, 60 hình/giây. CPU chậm 6×: tự hạ độ phân giải, ~57 hình/giây.
- Chưa thử trên máy thật: cần bạn thử trên iPhone và một máy Android tầm thấp.
