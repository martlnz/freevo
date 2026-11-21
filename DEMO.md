# Kịch bản demo (3 phút)

Mục tiêu: chứng minh luồng "hội thoại đa kênh → PR có bằng chứng → merge → version → rollback" chạy trọn vẹn.

## Chuẩn bị (10 phút trước giờ)

- [ ] `npm run db:reset` (dữ liệu sạch: Anh Minh ở v2 với 1 email chưa xử lý, khách "Demo dự phòng")
- [ ] Chạy `npm run dev` và `npm run zalo-bot` ở hai terminal riêng
- [ ] Điện thoại: gửi `/help` cho bot, xác nhận bot trả lời
- [ ] Điện thoại và laptop cùng Wi-Fi; `APP_URL` đã đổi thành `http://<IP-LAN>:3000` rồi khởi động lại `dev`
- [ ] Tài khoản Zalo thứ hai (đóng vai khách) sẵn sàng; 7 tin trong HACKATHON_PLAN.md mục 11 đã soạn sẵn
- [ ] Tab trình duyệt mở sẵn: `/` và trang khách Anh Minh
- [ ] Video quay dự phòng đã mở sẵn, kiểm tra âm thanh
- [ ] `.env` đang dùng LLM thật (không có `LLM_MOCK`); biết cách bật `LLM_MOCK=1` nếu API lỗi

## Kịch bản

| Thời gian | Màn hình / thao tác | Nói gì |
|---|---|---|
| 0:00–0:20 | Slide hoặc chỉ vào hộp tin | "Khách nhắn cả Gmail lẫn Zalo, đổi ý liên tục, cuối cùng không ai nhớ đã chốt gì." |
| 0:20–0:35 | `/` → bấm **Anh Minh** | "Khách Anh Minh đang ở v2, có một email chưa xử lý." |
| 0:35–1:10 | Điện thoại, chat với bot: gửi `/khach Anh Minh` | "Tôi chuyển tiếp tin nhắn khách sang bot, không cần copy tay." |
| 1:10–1:30 | Chuyển tiếp lần lượt 7 tin Zalo. Bot đáp "✓ Anh Minh (N tin chờ)" | "Bot lưu từng tin theo thứ tự, không bỏ sót." |
| 1:30–1:40 | Điện thoại: gửi `/xong` | "Bot tổng hợp phiên và gửi link PR." |
| 1:40–2:00 | Mở link PR trên laptop. Chỉ vào REQ-003 và thẻ bằng chứng | "AI lấy màu nâu #6F4E37, không phải đỏ đô, vì khách đã đổi ý. Bằng chứng trỏ đúng tin nhắn." |
| 2:00–2:10 | Chỉ vào thẻ bằng chứng của REQ-002 (từ Gmail) | "Yêu cầu ảnh món đến từ email, nhưng PR vẫn gộp chung." |
| 2:10–2:25 | Bỏ chọn một thẻ bằng chứng, xem panel giá | "Khối lượng và giá đề xuất cập nhật ngay, kèm số thực nhận sau thuế." |
| 2:25–2:40 | Bấm **Merge** → v3, copy link khách, mở trên điện thoại, bấm "Tôi đồng ý" | "Khách xác nhận trên điện thoại, trạng thái cập nhật ngay." |
| 2:40–2:50 | Lịch sử version → **Rollback** về v2 | "Rollback không xóa gì. Lịch sử luôn còn." |
| 2:50–3:00 | Slide kết | "Zalo Bot API chính thức, không rủi ro tài khoản. Tiếp theo: Gmail OAuth và Zalo OA cho agency." |

## Kế hoạch dự phòng

Dùng khi bot hoặc mạng lỗi. Không dừng demo.

1. **Bot không phản hồi:** bỏ qua bước điện thoại. Mở khách **"Demo dự phòng"** (đã có sẵn 7 tin nhập tay), bấm **Tổng hợp phiên**, tiếp tục từ mốc 1:40.
2. **LLM lỗi hoặc hết hạn mức:** đặt `LLM_MOCK=1` trong `.env`, khởi động lại `npm run dev`. PR mẫu cố định được trả về.
3. **Web lỗi hoàn toàn:** mở video quay sẵn, thuyết minh theo cùng mốc thời gian.
4. **Mất mạng ở hội trường:** app chạy local, chỉ cần internet để gọi LLM. Khi mất mạng, dùng mock như bước 2.

## Hỏi đáp dự kiến từ ban giám khảo

**1. Tại sao chọn Zalo?**
Khách hàng Việt Nam nhắn tin qua Zalo nhiều nhất. Freevo dùng Zalo Bot Platform chính thức (long-polling, không cần URL công khai), không dùng tài khoản cá nhân nên không rủi ro bị khóa. Gmail hiện chỉ là dữ liệu seed.

**2. Tại sao lại là "version" và rollback?**
Yêu cầu khách thay đổi như mã nguồn, nên cần lịch sử và khả năng quay lại. Mỗi lần merge là một version. Rollback tạo version mới chứ không xóa cũ, giống `git revert`. Hai bên luôn biết đã chốt gì và từ lúc nào.

**3. AI có chính xác không? Làm sao tin được?**
Mỗi thay đổi bắt buộc có tin nhắn làm bằng chứng. Server bỏ thay đổi không có bằng chứng hoặc trỏ tới tin không tồn tại. Freelancer duyệt từng thay đổi và bỏ chọn bằng chứng nếu cần. AI chỉ đề xuất, không tự merge.

**4. Logic giá được tính thế nào?**
Giá đề xuất = khối lượng công việc × đơn giá trung bình từ dự án cũ. Khối lượng tăng thì giá đề xuất tăng. Freelancer nhập số muốn thực nhận, hệ thống tính giá cần báo sau thuế (`TAX_RATE`, cấu hình được). Đây là gợi ý, không thay thế cách báo giá của freelancer. Thuế cần kiểm tra theo quy định hiện hành.

**5. Mở rộng lên nhiều freelancer, nhiều khách thì sao?**
Hiện chạy local, một freelancer. Logic nằm trong `lib/` và web lẫn bot đều dùng chung, nên thêm kênh hay giao diện không phải viết lại. Chuyển sang PostgreSQL theo các bước trong README. Bước tiếp theo: đăng nhập, phân quyền theo freelancer, Zalo OA cho agency.
