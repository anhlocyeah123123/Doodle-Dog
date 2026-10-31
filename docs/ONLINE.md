# Chơi online 2 người

## Hiện trạng: chưa chơi online được

- Bản hiện tại chỉ có chế độ 1 người (theo yêu cầu tập trung chơi đơn).
- `_future/` chứa code co-op/đấu của bản đầu, viết cho luật cũ (`Sim` một màn, không có đợt, không boss) –
  cần viết lại phần đồng bộ, không dùng ngay được.
- **Netlify chỉ phục vụ trang tĩnh + hàm serverless chạy ngắn, không giữ được kết nối WebSocket lâu dài.**
  Vì vậy máy chủ phòng `_future/server/server.js` (Node + ws) KHÔNG chạy được trên Netlify.

## Nền tảng sẵn có cho online

- `Sim` không phụ thuộc DOM, có seed: 2 máy cùng seed + cùng chuỗi bùa -> cùng diễn biến (đã có test).
- Mọi thay đổi trạng thái đi qua `cast()` / `pop()` -> chỉ cần gửi các lệnh này qua mạng (vài chục byte).

## Phương án (giữ trang trên Netlify, thêm một kênh thời gian thực)

| Phương án | Cần làm | Ưu | Nhược |
|---|---|---|---|
| **A. Supabase Realtime** (khuyên dùng) | Tạo project miễn phí, lấy URL + anon key | Ổn định cả trên 4G/5G; có kênh phòng, presence; không tự vận hành máy chủ | Phụ thuộc dịch vụ ngoài; giới hạn gói miễn phí (đủ cho game nhỏ) |
| B. WebRTC P2P (PeerJS) | Không cần tài khoản | Miễn phí, độ trễ thấp nhất (máy-nối-máy) | ~10–20% mạng di động (NAT chặt) không nối được nếu không có máy chủ TURN trả phí |
| C. Máy chủ Node riêng (Render/Fly.io/Railway) | Deploy `server/` riêng, trang vẫn ở Netlify | Toàn quyền, chống gian lận được | Tự vận hành; gói miễn phí của Render "ngủ" sau 15 phút (lần vào đầu chờ ~30–50 giây) |

## Thiết kế đề xuất khi làm

- **Co-op:** máy chủ phòng (host) chạy `Sim` thật; máy kia gửi `{t:'cast', s}`; host gửi ảnh chụp trạng thái 10–12 lần/giây,
  máy kia nội suy vị trí ma cho mượt. Máu và điểm dùng chung.
- **Đấu bùa:** mỗi người một `Sim` riêng; diệt ma -> gửi `{t:'atk', n}` đẩy ma sang màn đối thủ; sét đẩy 3 con.
- Thêm `net/transport.js` (giao diện `send/on`) để đổi qua lại A/B/C mà không sửa logic game.
- Phòng bằng mã 4 ký tự; xử lý rớt mạng (tạm dừng 10 giây chờ nối lại).
