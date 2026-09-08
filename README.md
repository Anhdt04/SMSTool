# SMCS VNPT - Công Cụ Tra Cứu Thuê Bao Tự Động

Ứng dụng hỗ trợ tự động hóa tra cứu thông tin sản phẩm và trạng thái số thuê bao trên hệ thống SMCS VNPT (`smcs.vnpt.com.vn`), tự động lọc điều kiện nghiệp vụ và đẩy thông báo về Telegram.

---

##  Tính Năng Nổi Bật

- **Tra cứu tự động & Hàng đợi linh hoạt**: Hỗ trợ nạp danh sách hàng loạt số điện thoại (tự động chuẩn hóa đầu `84...`).
- **Tùy chỉnh độ trễ (Delay)**: Điều chỉnh thời gian nghỉ giữa các lần tra cứu (từ 50ms - 0.1s trở lên).
- **Cơ chế Tra cứu Xoay vòng (Loop)**: Liên tục kiểm tra danh sách số cho đến khi tìm thấy trạng thái mục tiêu.
- **Tự động nhận diện 2 Điều Kiện Nghiệp Vụ**:
  - **ĐK 1 (Kho chung VNP + Sẵn sàng sử dụng)**: Thông báo Telegram kèm ngày thay đổi; tự động thêm số vào **Ô Riêng (Quick Copy)** để người dùng copy nhanh bằng 1 click.
  - **ĐK 2 (Kho chung VNP + Đã book số)**: Thông báo Telegram kèm giờ thực tế; **tự động loại bỏ vĩnh viễn** số này khỏi các vòng xoay tiếp theo.
- **Tích hợp Telegram Bot**: Chống spam tin nhắn (mỗi trạng thái của 1 số chỉ báo đúng 1 lần).
- **Xuất dữ liệu ra Excel**: Bảng kết quả 4 cột cho phép click sắp xếp tăng/giảm và nút copy chuẩn TSV để dán trực tiếp (`Ctrl + V`) sang Excel.
- **2 Chế độ hoạt động**:
  - `Giả Lập (Mock)`: Chạy thử nghiệm đầy đủ tính năng ngay trên máy cục bộ không cần mạng nội bộ.
  - `Trực Tiếp (Live)`: Kết nối trực tiếp vào hệ thống SMCS VNPT thông qua Cookie đăng nhập.
- **Tự động lưu cấu hình**: Toàn bộ thiết lập (Cookie, Delay, Telegram, Checkbox) được lưu lại tự động.

---

## 🛠️ Cài Đặt & Khởi Chạy

### Yêu cầu môi trường
- Node.js (phiên bản 18+ trở lên)
- Trình duyệt Chrome / Edge

### Các bước khởi chạy

1. **Cài đặt thư viện dependencies:**
```bash
npm install
```

2. **Khởi động server:**
```bash
npm start
```

3. **Mở giao diện người dùng:**
Truy cập trình duyệt tại địa chỉ:
👉 [http://localhost:3000](http://localhost:3000)

4. **Chạy kiểm thử tự động (Unit Test):**
```bash
npm test
```

---

## 📁 Cấu Trúc Thư Mục

```
├── server.js                      # Backend Express phục vụ REST API & SSE
├── config.json                    # Cấu hình lưu trữ tự động của người dùng
├── src/
│   ├── config/settings.js         # Quản lý đọc/ghi cấu hình
│   ├── providers/
│   │   ├── smcsProvider.js        # Base interface
│   │   ├── mockProvider.js        # Giả lập phản hồi phục vụ test
│   │   └── liveProvider.js        # Kết nối trực tiếp tới SMCS VNPT
│   ├── services/
│   │   ├── parserService.js       # Chuẩn hóa SĐT và đánh giá ĐK 1 & 2
│   │   ├── telegramService.js     # Gửi tin Telegram chống trùng lặp
│   │   └── queueService.js        # Điều phối hàng đợi, delay, xoay vòng
│   └── public/
│       ├── index.html             # Giao diện người dùng trực quan
│       ├── style.css              # Glassmorphic Dark theme
│       └── app.js                 # Xử lý sự kiện và kết nối thời gian thực
└── test/
    └── test_logic.js              # 10 bài unit test kiểm thử toàn bộ logic
```
