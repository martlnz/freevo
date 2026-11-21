# freevo: git cho yêu cầu khách hàng

## Freevo là gì?

Freelancer nhận yêu cầu từ khách qua nhiều kênh (Zalo, Gmail). Yêu cầu đổi liên tục và không ai nhớ đã chốt gì. Freevo coi yêu cầu khách hàng như mã nguồn: AI đọc hội thoại và đề xuất một **PR** gồm các thay đổi (thêm, sửa, xóa yêu cầu), mỗi thay đổi kèm tin nhắn làm bằng chứng. Freelancer duyệt, **merge** thành **version** mới, có thể **rollback**, gửi link cho khách xác nhận, và nhận gợi ý giá theo khối lượng thay đổi.

## Pitch (3 dòng)

1. Khách đổi ý qua Zalo và Gmail, cuối cùng không ai nhớ đã chốt gì.
2. Freevo đọc hội thoại, đề xuất PR với bằng chứng từng tin nhắn, freelancer chỉ việc duyệt.
3. Mỗi thay đổi thành một version có thể rollback, kèm gợi ý giá theo khối lượng công việc.

## Tính năng

- **Quản lý khách:** tạo khách, sửa thông tin, hộp tin đa kênh (Zalo, Gmail seed, nhập tay).
- **Tổng hợp phiên thành PR:** AI xác định vai trò người gửi, tách thêm / sửa / xóa yêu cầu. Server lọc bằng chứng không hợp lệ.
- **Duyệt PR:** bật/tắt từng thay đổi, chọn tin nhắn làm bằng chứng.
- **Merge và version:** mỗi lần merge tạo version mới. Rollback không xóa version cũ (giống `git revert`).
- **Link xác nhận cho khách:** trang công khai `/c/[token]` để khách đồng ý hoặc phản hồi.
- **Gợi ý giá:** tính từ điểm khối lượng và dự án cũ, hiển thị số thực nhận sau thuế.
- **Bot Zalo (long-polling):** freelancer chuyển tiếp tin khách sang bot, gõ `/xong` để nhận link PR. Đang triển khai (M4).

## Tech stack

- Next.js 15 (App Router) + TypeScript, Tailwind CSS
- Prisma ORM, SQLite mặc định (có thể chuyển sang PostgreSQL)
- Anthropic SDK (`@anthropic-ai/sdk`), model `claude-haiku-5-5`, structured outputs (JSON schema)
- Zalo Bot Platform (API chính thức), worker chạy bằng `tsx`
- Logic nghiệp vụ nằm trong `lib/`, dùng chung cho web và bot

## Cài đặt

Yêu cầu: Node.js 20+, npm.

```bash
# 1. Cài thư viện
npm i

# 2. Tạo file cấu hình, rồi điền ANTHROPIC_API_KEY và ZALO_BOT_TOKEN
cp .env.example .env

# 3. Tạo database và dữ liệu mẫu (Anh Minh, Demo dự phòng)
npm run db:reset

# 4. Chạy web tại http://localhost:3000
npm run dev

# 5. Terminal khác: chạy bot Zalo
npm run zalo-bot
```

Không có API key? Đặt `LLM_MOCK=1` trong `.env` để dùng PR mẫu cố định.

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | Chuỗi kết nối database |
| `ANTHROPIC_API_KEY` | (trống) | API key Anthropic, bắt buộc khi không dùng mock |
| `LLM_MODEL` | `claude-haiku-5-5` | Model dùng để tổng hợp PR |
| `LLM_MOCK` | (không đặt) | `1` = dùng PR mẫu, không gọi LLM |
| `ZALO_BOT_TOKEN` | (trống) | Token bot từ Zalo Bot Platform |
| `APP_URL` | `http://localhost:3000` | Gốc của link gửi khách. Đổi thành `http://<IP-LAN>:3000` để mở trên điện thoại |
| `TAX_RATE` | `0.1` | Thuế khấu trừ TNCN dùng cho gợi ý giá |
| `ACTIVE_CLIENT_TTL_HOURS` | `2` | Sau bao lâu không hoạt động, bot quên khách đang chọn |

## Chuyển sang PostgreSQL

Mặc định dùng SQLite cho nhanh. Để dùng PostgreSQL:

1. Trong `prisma/schema.prisma`, đổi `provider = "sqlite"` thành `provider = "postgresql"`.
2. Trong model `Client`, đổi `emails String @default("[]")` thành `emails String[]`. SQLite lưu danh sách email dạng chuỗi JSON, còn PostgreSQL có kiểu mảng. Sau đó cập nhật `parseEmails` trong `lib/clients.ts` cho khớp.
3. Đặt `DATABASE_URL=postgresql://app:app@localhost:5432/freelancer_hub`.
4. Thêm `docker-compose.yml` với service `postgres:16` (user và password `app`, database `freelancer_hub`, cổng 5432), rồi chạy `docker compose up -d`.
5. Chạy `npx prisma db push`, sau đó `npm run db:reset`.

## Scripts

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy web ở chế độ phát triển (Turbopack) |
| `npm run build` | Build production (Turbopack) |
| `npm run start` | Chạy bản build production |
| `npm run lint` | Kiểm tra ESLint |
| `npm run db:reset` | Xóa database, tạo lại schema, seed dữ liệu mẫu |
| `npm run test:pr` | Chạy `createPR` trên khách "Demo dự phòng", in JSON PR ra console |
| `npm run zalo-bot` | Worker Zalo long-polling. Chưa có trong `package.json`, thêm ở M4 |

## Cấu trúc

- `app/`: giao diện (App Router) và Server Actions (`app/actions/`)
- `lib/`: logic nghiệp vụ và Prisma (`createPR`, `mergePR`, `rollback`, `pricing`, ...)
- `prisma/`: schema và seed
- `scripts/`: tiện ích chạy ngoài web (`test-create-pr.ts`, và worker Zalo sắp có)

Xem thêm `HACKATHON_PLAN.md` (spec đầy đủ) và `DEMO.md` (kịch bản demo).
