# Doodle Dog – Vẽ bùa đuổi ma

Web game một người chơi kiểu Google Doodle Halloween 2016. Canvas 2D thuần, không framework,
không bước build: thư mục `web/` chính là trang web hoàn chỉnh.

```bash
npm start          # chạy thử: http://localhost:3000   (thêm ?unlock để mở hết màn, ?debug cho kiểm thử)
npm test           # 16 test: nhận dạng bùa + luật game
npm run balance    # bot giả lập 3 mức người chơi -> tỉ lệ qua từng màn
npm run check      # kiểm tra kiểu (TypeScript trên JSDoc) + test
```

Thử trên điện thoại cùng Wi-Fi: chạy `npm start`, mở `http://<IP-máy-tính>:3000`.

| Tài liệu | Nội dung |
|---|---|
| `docs/ARCHITECTURE.md` | Cấu trúc thư mục, luồng dữ liệu, cách thêm màn / bùa / hiệu ứng |
| `docs/DEPLOY.md` | Đưa lên Netlify, kiểm tra iPhone/Android, âm thanh |
| `docs/ONLINE.md` | Chơi online 2 người: vì sao Netlify một mình không đủ, các phương án |
| `docs/sprite_compare.png` | Đối chiếu cỡ nhân vật trước/sau chuẩn hóa |

`_future/` là code online thử nghiệm từ bản đầu, **chưa dùng được** với luật game hiện tại (xem `docs/ONLINE.md`).
