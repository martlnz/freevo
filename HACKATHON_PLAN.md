# HACKATHON PLAN — "Git cho yêu cầu khách hàng" (Freelancer Hub)

> Tài liệu này là spec để Claude Code triển khai. Đọc hết một lần, sau đó làm **tuần tự theo milestone (M0 → M6)**.
> Sau mỗi milestone: chạy thử, commit, báo lại kết quả rồi mới sang milestone tiếp.

---

## 0. Bối cảnh & ràng buộc

**Bài toán:** Freelancer trao đổi với khách qua nhiều kênh (Zalo, Gmail). Yêu cầu thay đổi liên tục, rải rác, không ai nhớ đã chốt gì.

**Giải pháp:** Hệ thống coi yêu cầu khách hàng như mã nguồn:
hội thoại → AI đề xuất **PR** (thêm / sửa / xóa yêu cầu, mỗi thay đổi kèm **tin nhắn làm bằng chứng**) → freelancer duyệt từng thay đổi → **merge** thành **version** mới → có **rollback** → gửi **link cho khách xác nhận** → **gợi ý giá** dựa trên khối lượng thay đổi.

**Ràng buộc:**
- 1 người làm, **3 tiếng**. Ưu tiên tuyệt đối: chạy được luồng demo. Không over-engineer.
- Chạy **local**, không deploy. Không đăng nhập, không phân quyền (một freelancer duy nhất).
- Zalo: dùng **Zalo Bot Platform (API chính thức)**, chế độ **long-polling** (không cần URL công khai). Freelancer **chuyển tiếp** tin nhắn của khách sang bot.
- Gmail: **chỉ dữ liệu seed**, không tích hợp thật.

---

## 1. Stack

| Thành phần | Lựa chọn |
|---|---|
| App | Next.js (App Router) + TypeScript |
| UI | Tailwind + shadcn/ui (dùng mặc định, không tùy biến nhiều) |
| DB | PostgreSQL 16 chạy Docker |
| ORM | Prisma (nếu Docker lỗi quá 5 phút → đổi sang SQLite) |
| LLM | Anthropic SDK (`@anthropic-ai/sdk`), model **Claude Haiku 5.5** (`claude-haiku-5-5`), ép JSON bằng **structured outputs** (`output_config.format` kiểu `json_schema`), để thinking adaptive, `effort: "high"` |
| Bot | Script Node chạy bằng `tsx`, gọi HTTP API của Zalo Bot Platform |

**Quy ước kiến trúc:**
- Mọi logic nghiệp vụ nằm trong `lib/` (`createPR`, `mergePR`, `rollback`, `pricing`…) để **web và worker bot dùng chung**.
- Mutation trên web dùng **Server Actions**. Chỉ tạo Route Handler khi thật cần.

---

## 1.1 Backend nằm ở đâu

Không có server riêng: **backend chạy bên trong Next.js trên Node**. Mọi truy cập DB, gọi LLM, gọi Zalo đều chạy ở server, không bao giờ chạy trên trình duyệt.

```
Trình duyệt (form, nút bấm)
      │  gọi
      ▼
Server Actions  (app/actions/*.ts, 'use server')   ← cửa vào cho thao tác GHI
Server Components (app/**/page.tsx)                ← ĐỌC dữ liệu khi render trang
      │  gọi
      ▼
lib/  (logic nghiệp vụ + Prisma, có `import 'server-only'`)   ← "backend" thật sự
      │
      ▼
PostgreSQL (Docker)          LLM API          Zalo Bot API
      ▲
      │  cũng gọi lib/
scripts/zalo-bot.ts (worker chạy riêng bằng tsx)
```

**Lớp `lib/` — hàm nghiệp vụ (backend):**

| File | Hàm |
|---|---|
| `lib/clients.ts` | `listClients()`, `getClientDetail(id)`, `createClient(data)`, `updateClient(id, data)`, `findOrCreateClientByName(name)` |
| `lib/messages.ts` | `addMessage(data)`, `listMessages(clientId)`, `listPendingMessages(clientId)` |
| `lib/pr.ts` | `createPR(clientId)`, `getPR(id)`, `updateChange(prId, index, patch)`, `mergePR(prId)`, `rejectPR(prId)` |
| `lib/versions.ts` | `getLatestVersion(clientId)`, `listVersions(clientId)`, `rollback(clientId, versionNo)` |
| `lib/confirmations.ts` | `getByToken(token)`, `respond(token, { approved, comment })` |
| `lib/pricing.ts` | `getPricing(clientId, prId?)` |

Validate dữ liệu vào (tên khách không rỗng, email đúng định dạng, giá ≥ 0) ngay trong `lib/` để web và bot cùng được kiểm tra.

**Lớp Server Actions (`app/actions/`) — cửa vào từ giao diện:**

| Action | Gọi | Kết quả |
|---|---|---|
| `createClientAction(formData)` | `createClient` | redirect `/clients/[id]` |
| `updateClientAction(id, formData)` | `updateClient` | revalidate trang khách |
| `addManualMessageAction(clientId, formData)` | `addMessage` (channel `manual`) | revalidate |
| `createPRAction(clientId)` | `createPR` | redirect `/pr/[id]` |
| `updateChangeAction(prId, index, patch)` | `updateChange` (bật/tắt thay đổi, chọn bằng chứng) | revalidate |
| `mergePRAction(prId)` | `mergePR` | trả về link xác nhận |
| `rejectPRAction(prId)` | `rejectPR` | revalidate |
| `rollbackAction(clientId, versionNo)` | `rollback` | revalidate |
| `respondConfirmationAction(token, formData)` | `respond` | revalidate trang khách xem |

Mỗi action bọc try/catch và trả `{ ok: true, data }` hoặc `{ ok: false, error }` để UI hiển thị lỗi.

**Route Handlers (`app/api/`)**: MVP **không bắt buộc**. Chỉ thêm `GET /api/health` (trả `{ ok: true }`) để kiểm tra server. Nếu sau này tách frontend riêng thì bọc các hàm `lib/` thành REST API, logic giữ nguyên.

---

## 2. Biến môi trường (`.env`)

```
DATABASE_URL=postgresql://app:app@localhost:5432/freelancer_hub
ANTHROPIC_API_KEY=
LLM_MODEL=claude-haiku-5-5
ZALO_BOT_TOKEN=
APP_URL=http://localhost:3000        # đổi thành http://<IP-LAN>:3000 nếu mở trên điện thoại
TAX_RATE=0.1                         # khấu trừ thuế TNCN mặc định, cấu hình được
ACTIVE_CLIENT_TTL_HOURS=2
```

---

## 3. Cấu trúc thư mục

```
/app
  /page.tsx                     # danh sách khách hàng
  /clients/[id]/page.tsx        # hộp tin, yêu cầu hiện tại, lịch sử version, danh sách PR
  /pr/[id]/page.tsx             # duyệt PR
  /c/[token]/page.tsx           # trang công khai cho khách xác nhận
  /clients/new/page.tsx         # form tạo khách mới
  /actions                      # Server Actions (cửa vào backend từ giao diện)
    clients.ts  messages.ts  pr.ts  versions.ts  confirmations.ts
  /api/health/route.ts          # kiểm tra server sống
/lib                            # BACKEND: logic nghiệp vụ + Prisma (server-only)
  db.ts                         # Prisma client singleton
  types.ts                      # Requirement, Snapshot, Change, LLM output
  llm.ts                        # gọi LLM
  clients.ts                    # CRUD khách, findOrCreateClientByName
  messages.ts                   # thêm / liệt kê tin nhắn
  pr.ts                         # createPR, updateChange, mergePR, rejectPR
  versions.ts                   # getLatestVersion, listVersions, rollback
  confirmations.ts              # đọc theo token, ghi phản hồi của khách
  pricing.ts                    # tính giá
  zalo.ts                       # getUpdates, sendMessage, deleteWebhook
/scripts
  zalo-bot.ts                   # worker long-polling
  test-create-pr.ts             # test createPR không cần UI
/prisma
  schema.prisma
  seed.ts
docker-compose.yml
```

`package.json` scripts:
```
"dev": "next dev -H 0.0.0.0",
"zalo-bot": "tsx scripts/zalo-bot.ts",
"db:reset": "prisma migrate reset --force",
"test:pr": "tsx scripts/test-create-pr.ts"
```

---

## 4. Database

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: freelancer_hub
    ports: ["5432:5432"]
```

`prisma/schema.prisma`:
```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Client {
  id            String        @id @default(cuid())
  name          String        @unique
  emails        String[]
  projectName   String?
  contractPrice Int           @default(0)   // VND
  baseEffort    Int           @default(0)   // điểm khối lượng ban đầu
  note          String?
  createdAt     DateTime      @default(now())
  messages      Message[]
  prs           PullRequest[]
  versions      Version[]
}

model Message {
  id         String       @id @default(cuid())
  clientId   String?                        // null = chưa phân loại
  client     Client?      @relation(fields: [clientId], references: [id])
  channel    String                         // "zalo" | "gmail" | "manual"
  senderRole String       @default("unknown") // "client" | "freelancer" | "unknown"
  senderName String?
  content    String
  sentAt     DateTime     @default(now())
  prId       String?                        // null = chưa xử lý (thuộc phiên hiện tại)
  pr         PullRequest? @relation(fields: [prId], references: [id])
  raw        Json?
  createdAt  DateTime     @default(now())
}

model PullRequest {
  id              String    @id @default(cuid())
  clientId        String
  client          Client    @relation(fields: [clientId], references: [id])
  baseVersionNo   Int
  status          String    @default("open") // "open" | "merged" | "rejected"
  summary         String
  effortDelta     Int       @default(0)
  changes         Json                        // Change[]
  mergedVersionNo Int?
  createdAt       DateTime  @default(now())
  messages        Message[]
}

model Version {
  id            String         @id @default(cuid())
  clientId      String
  client        Client         @relation(fields: [clientId], references: [id])
  versionNo     Int
  snapshot      Json                          // Snapshot
  note          String?
  sourcePrId    String?
  createdAt     DateTime       @default(now())
  confirmations Confirmation[]
  @@unique([clientId, versionNo])
}

model Confirmation {
  id          String    @id @default(cuid())
  versionId   String
  version     Version   @relation(fields: [versionId], references: [id])
  token       String    @unique
  status      String    @default("pending")  // "pending" | "approved" | "commented"
  comment     String?
  respondedAt DateTime?
}

model PastProject {
  id           String @id @default(cuid())
  title        String
  effortPoints Int
  price        Int    // VND
}

model BotState {
  chatId         String   @id
  activeClientId String?
  updatedAt      DateTime @updatedAt
}
```

**Khái niệm "phiên":** không có bảng riêng. Phiên hiện tại của một khách = các `Message` có `clientId` đó và `prId = null`.

---

## 5. Kiểu dữ liệu (`lib/types.ts`)

```ts
export type Requirement = {
  id: string;            // "REQ-001", cố định, không bao giờ đổi
  title: string;
  detail: string;
  status: "agreed" | "pending";
};
export type Snapshot = { requirements: Requirement[] };

export type Change = {
  op: "add" | "modify" | "remove";
  reqId?: string;               // bắt buộc với modify/remove; với add được gán khi merge
  title?: string;               // giá trị MỚI (add/modify)
  detail?: string;
  status?: "agreed" | "pending";
  before?: string;              // text hiển thị trạng thái cũ (modify/remove), server tự điền
  reason: string;
  evidence: string[];           // Message.id thật
  accepted: boolean;            // mặc định true
  selectedEvidence: string[];   // mặc định = evidence
};
```

---

## 6. `createPR(clientId)` — phần quan trọng nhất

**Các bước:**
1. Lấy version mới nhất của khách (snapshot) và các tin nhắn đang chờ (`prId = null`), sắp theo `sentAt`.
2. Nếu không có tin nhắn → trả lỗi "Không có tin nhắn mới".
3. Gán **mã ngắn** cho tin nhắn: `m1, m2, …` (map sang id thật ở server). Không đưa cuid vào prompt.
4. Gọi LLM (`LLM_MODEL`) với `output_config: { effort: "high", format: { type: "json_schema", schema: <schema bên dưới> } }`, để thinking adaptive (mặc định). **Không** dùng `tool_choice` ép tool: trên Haiku 5.5, ép tool sẽ bỏ qua bước thinking, làm giảm chất lượng suy luận "lấy ý chốt cuối". Không gửi `temperature`/`top_p`/`top_k` và không prefill (Haiku 5.5 trả lỗi 400). Parse JSON bằng `JSON.parse`, lỗi parse → ném lỗi rõ ràng.
5. **Kiểm tra kết quả ở server:**
   - Bỏ thay đổi có `evidence_refs` rỗng hoặc chứa mã không tồn tại.
   - Bỏ `modify`/`remove` có `req_id` không có trong snapshot.
   - Bỏ `add` trùng tiêu đề gần như y hệt một yêu cầu đã có.
   - Điền `before` từ snapshot cho `modify`/`remove`.
   - Đổi `evidence_refs` → `evidence` (id thật); `accepted = true`; `selectedEvidence = evidence`.
6. Cập nhật `senderRole` cho các tin nhắn có role `unknown` theo `message_roles` từ LLM.
7. Tạo `PullRequest` và gán `prId` cho tất cả tin nhắn của phiên (trong 1 transaction).

**JSON schema của output** (`propose_requirement_diff`; structured outputs có thể bỏ qua `minItems`, bước kiểm tra ở server vẫn lọc evidence rỗng):
```json
{
  "type": "object",
  "required": ["summary", "effort_delta", "message_roles", "changes"],
  "properties": {
    "summary": { "type": "string", "description": "1 câu tiếng Việt tóm tắt phiên" },
    "effort_delta": { "type": "integer", "description": "Điểm khối lượng tăng (+) hoặc giảm (-). 1 điểm ≈ nửa ngày công" },
    "message_roles": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["ref", "role"],
        "properties": {
          "ref": { "type": "string" },
          "role": { "enum": ["client", "freelancer"] }
        }
      }
    },
    "changes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["op", "reason", "evidence_refs"],
        "properties": {
          "op": { "enum": ["add", "modify", "remove"] },
          "req_id": { "type": "string" },
          "title": { "type": "string" },
          "detail": { "type": "string" },
          "status": { "enum": ["agreed", "pending"] },
          "reason": { "type": "string" },
          "evidence_refs": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
        }
      }
    }
  }
}
```

**System prompt (dùng nguyên văn, có thể chỉnh nhẹ):**
```
Bạn là trợ lý quản lý yêu cầu cho freelancer. Bạn nhận:
(1) DANH SÁCH YÊU CẦU HIỆN TẠI của dự án, mỗi yêu cầu có ID cố định (REQ-xxx).
(2) CÁC TIN NHẮN MỚI trong phiên trao đổi giữa freelancer và khách, mỗi tin có mã (m1, m2...), kênh, thời gian, và vai trò người gửi nếu đã biết.

Nhiệm vụ: xác định sau phiên này, danh sách yêu cầu cần THÊM, SỬA, XÓA gì.

Quy tắc bắt buộc:
1. Chỉ ghi nhận trạng thái ĐƯỢC THỐNG NHẤT CUỐI CÙNG. Nếu khách đổi ý nhiều lần, chỉ lấy lần cuối.
2. Mỗi thay đổi PHẢI dẫn ít nhất một mã tin nhắn làm bằng chứng (evidence_refs). Ưu tiên dẫn cả tin khách yêu cầu và tin hai bên chốt.
3. Chỉ dùng thao tác add / modify / remove. modify và remove phải dùng đúng req_id có sẵn. KHÔNG viết lại toàn bộ danh sách.
4. Với modify: title/detail là giá trị MỚI đầy đủ (không phải chỉ phần khác biệt).
5. Điều gì đang bàn nhưng chưa chốt → status "pending". Điều đã chốt → "agreed".
6. Không bịa. Không suy diễn yêu cầu không có trong tin nhắn. Bỏ qua chào hỏi, cảm ơn.
7. Nếu vai trò người gửi là unknown, suy luận từ nội dung và cách xưng hô (người nhờ làm, yêu cầu = client; người xác nhận sẽ làm = freelancer) và trả trong message_roles.
8. effort_delta: ước lượng thay đổi khối lượng công việc, 1 điểm ≈ nửa ngày công.
9. Viết reason, title, detail, summary bằng tiếng Việt, ngắn gọn.
```

**User message:**
```
YÊU CẦU HIỆN TẠI (version {n}):
REQ-001 | Trang chủ | Banner + slogan | agreed
...

TIN NHẮN MỚI:
[m1] (gmail, 2026-11-20 09:12, client) Chào em, anh gửi thêm: ...
[m2] (zalo, 2026-11-21 14:01, unknown) Em ơi anh nghĩ lại rồi ...
...
```

`scripts/test-create-pr.ts`: chạy `createPR` trên khách seed và in JSON PR ra console.

---

## 7. `mergePR(prId)` / `rejectPR(prId)` / `rollback(clientId, versionNo)`

**mergePR:**
1. Lấy snapshot của version **mới nhất** (không phải baseVersionNo — đơn giản hóa).
2. Áp lần lượt các `Change` có `accepted = true`:
   - `add`: tạo `REQ-xxx` mới = số lớn nhất hiện có + 1 (đệm 3 chữ số), gán ngược `reqId` vào change.
   - `modify`: cập nhật title/detail/status theo reqId (bỏ qua nếu không tìm thấy).
   - `remove`: xóa theo reqId.
3. Tạo `Version` mới (`versionNo` + 1, `sourcePrId`, `note` = summary).
4. Tạo `Confirmation` với `token` ngẫu nhiên (`crypto.randomUUID()`).
5. PR → `merged`, lưu `mergedVersionNo` và `changes` đã cập nhật.
6. Trả về link `${APP_URL}/c/${token}`.

**rejectPR:** PR → `rejected`. Tin nhắn vẫn gắn với PR (không quay lại phiên).

**rollback(clientId, versionNo):** tạo version mới với snapshot của version đích, `note = "Rollback về v{versionNo}"`. **Không xóa** version nào (giống `git revert`).

---

## 8. Gợi ý giá (`lib/pricing.ts`)

```
unitPrice        = trung bình (price / effortPoints) của PastProject
currentEffort    = client.baseEffort + tổng effortDelta của các PR đã merge
proposedEffort   = currentEffort + effortDelta của PR đang xem
suggestedPrice   = làm tròn 100.000 (proposedEffort × unitPrice)
net(price)       = price × (1 − TAX_RATE)
priceForNet(x)   = làm tròn lên 100.000 (x / (1 − TAX_RATE))
```

Panel trên trang PR hiển thị: giá hợp đồng hiện tại, khối lượng trước/sau, giá đề xuất, thực nhận sau thuế của giá hiện tại và giá đề xuất, ô nhập "Muốn thực nhận" → "Cần báo giá".
Ghi chú nhỏ dưới panel: "Thuế suất cấu hình được, kiểm tra quy định hiện hành."

---

## 9. Worker Zalo Bot (`scripts/zalo-bot.ts`)

**Trước khi code:** đọc tài liệu chính thức tại `https://bot.zaloplatforms.com/docs` để xác nhận định dạng endpoint (token đặt ở đâu trong URL), tên trường trong payload `getUpdates`, và `sendMessage`. **Không đoán.**

**Khởi động:** gọi `deleteWebhook` một lần (polling và webhook loại trừ nhau), sau đó lặp `getUpdates` với timeout ~30 giây. Log **payload thô** của mỗi update ra console và file `zalo-raw.log` (để kiểm tra tin chuyển tiếp có giữ người gửi gốc / thời gian gốc không).

**Xử lý tin nhắn (theo `chat_id` của người gửi = freelancer):**

| Đầu vào | Hành vi |
|---|---|
| `/help` | Hướng dẫn ngắn các lệnh |
| `/khach` | Liệt kê khách đánh số. Tin tiếp theo là một số → chọn khách đó |
| `/khach <tên>` | Tìm khách theo tên (không phân biệt hoa thường); chưa có thì tạo mới. Lưu `BotState.activeClientId`. Trả lời: "Đang làm việc với: <tên>" (+ "Đã tạo khách mới" nếu mới tạo) |
| `/xong` | Gọi `createPR(activeClientId)`. Trả lời: tóm tắt + số thay đổi + link `${APP_URL}/pr/<id>`. Nếu không có tin mới → báo |
| Tin văn bản khác (kể cả tin chuyển tiếp) | Nếu chưa chọn khách hoặc `BotState.updatedAt` quá `ACTIVE_CLIENT_TTL_HOURS` → lưu với `clientId = null`, nhắc dùng `/khach`. Ngược lại lưu `Message` (channel `zalo`, `senderRole` từ payload nếu có, không thì `unknown`, `raw` = payload). Trả lời ngắn: "✓ <tên khách> (N tin chờ)" |

Mỗi lần nhận tin có khách hợp lệ → cập nhật `BotState.updatedAt`.
Lỗi khi gọi LLM → bot trả lời "Có lỗi khi tổng hợp, thử lại /xong" và log lỗi; worker không được crash (bọc try/catch toàn vòng lặp).

---

## 10. Giao diện

**`/` — Khách hàng:** bảng khách (tên, dự án, version hiện tại, số tin chờ, số PR mở). Nút **"+ Khách mới"**. Click dòng → trang khách.

**`/clients/new` — Tạo khách mới:** form gồm tên (bắt buộc), tên dự án, email (nhiều email cách nhau bằng dấu phẩy), giá hợp đồng (VND), điểm khối lượng ban đầu, ghi chú. Submit → `createClientAction` → tạo luôn **Version 1 rỗng** → chuyển sang trang khách. Khách tạo nhanh qua bot (`/khach <tên>`) cũng tạo Version 1 rỗng và được bổ sung thông tin ở tab "Thông tin".

**`/clients/[id]` — Trang khách** (tabs):
- **Thông tin:** form sửa các trường như trang tạo mới (`updateClientAction`). Hiển thị trạng thái xác nhận của version mới nhất.
- **Hộp tin:** tin nhắn theo thời gian, icon kênh (Zalo/Gmail/Thủ công), nhãn vai trò ("Khách" / "Freelancer" / "AI đoán: …"), tin chờ được highlight. Nút **"Tổng hợp phiên"** → `createPR` → chuyển sang trang PR. Ô textarea **"Thêm tin nhắn thủ công"** + chọn vai trò (phương án dự phòng khi bot lỗi).
- **Yêu cầu hiện tại:** bảng snapshot version mới nhất (ID, tiêu đề, chi tiết, trạng thái).
- **Lịch sử version:** danh sách v1, v2… (thời gian, note, PR nguồn). Xem snapshot. Nút **Rollback** (có confirm dialog).
- **PR:** danh sách PR với trạng thái.

**`/pr/[id]` — Duyệt PR:**
- Đầu trang: summary, base version, trạng thái.
- Danh sách thay đổi: badge màu **xanh = thêm, vàng = sửa, đỏ = xóa**; hiển thị before → after; reason; **switch chấp nhận/bỏ**.
- Dưới mỗi thay đổi: **thẻ bằng chứng** render như bong bóng chat (khách bên trái, freelancer bên phải, icon kênh, thời gian), mỗi thẻ có checkbox (lưu vào `selectedEvidence`).
- Panel **gợi ý giá** (mục 8).
- Nút **Merge** (→ hiển thị link xác nhận + nút copy) và **Từ chối**.

**`/c/[token]` — Trang cho khách** (không cần đăng nhập):
- Tên dự án, version mới, danh sách thay đổi đã chấp nhận (chỉ kèm bằng chứng đã chọn), danh sách yêu cầu đầy đủ.
- Nút **"Tôi đồng ý"** và ô **phản hồi**. Sau khi gửi → hiển thị trạng thái. Trang khách hàng phía freelancer hiển thị trạng thái xác nhận của version.

---

## 11. Dữ liệu seed (`prisma/seed.ts`) — câu chuyện demo

**Khách:** "Anh Minh" · email `minh.cafe@example.com` · dự án "Landing page quán cà phê Mộc" · `contractPrice = 7000000` · `baseEffort = 9`.

**Version 1:**
| ID | Tiêu đề | Chi tiết |
|---|---|---|
| REQ-001 | Trang chủ | Banner ảnh quán + slogan |
| REQ-002 | Trang menu | Danh sách đồ uống kèm giá |
| REQ-003 | Màu chủ đạo | Xanh navy |
| REQ-004 | Form đặt bàn | Gửi thông tin về email chủ quán |
| REQ-005 | Bản đồ | Nhúng Google Maps vị trí quán |

**Version 2** (tạo từ 1 PR đã merge, kèm 2 email đã xử lý gắn vào PR đó): thêm `REQ-006 | Nút gọi điện | Nút gọi nhanh nổi ở góc màn hình (mobile)`.

**Tin nhắn chờ (seed, chưa xử lý):**
- gmail · client · hôm qua: "Chào em, anh bổ sung: trang menu anh muốn có ảnh cho từng món nhé."

**PastProject:**
| Tiêu đề | Điểm | Giá (VND) |
|---|---|---|
| Landing page tiệm bánh | 8 | 6.000.000 |
| Website spa | 12 | 9.500.000 |
| Landing page sự kiện | 6 | 4.500.000 |
| Web giới thiệu công ty | 15 | 12.000.000 |

**Tin nhắn Zalo để CHUYỂN TIẾP khi demo** (chuẩn bị trước: một tài khoản Zalo khác đóng vai khách gửi cho freelancer, freelancer trả lời đúng như dưới):
1. Khách: "Em ơi anh nghĩ lại rồi, màu xanh navy hơi lạnh, đổi sang đỏ đô nha"
2. Khách: "À thôi, đỏ đô hơi chói, đổi sang nâu cà phê đi em"
3. Freelancer: "Dạ, nâu đậm kiểu #6F4E37 được không anh?"
4. Khách: "Ok nâu đó. Thêm cho anh trang Giới thiệu kể câu chuyện quán nữa"
5. Khách: "Còn Google Maps thì bỏ đi, anh để địa chỉ dạng chữ là được"
6. Freelancer: "Dạ em chốt: màu nâu #6F4E37, thêm trang Giới thiệu, bỏ Maps, menu có ảnh từng món. Em gửi bản cập nhật nhé"
7. Khách: "Ok em"

**PR mong đợi:** modify REQ-003 (→ nâu #6F4E37, **không** phải đỏ đô) · modify REQ-002 (thêm ảnh từng món, bằng chứng là email) · add "Trang Giới thiệu" · remove REQ-005 · effort_delta dương.

Seed cũng tạo sẵn bộ 7 tin này dưới dạng **tin thủ công trong một khách thứ hai "Demo dự phòng"** (copy y hệt dữ liệu Anh Minh) để demo được khi bot lỗi.

---

## 12. Milestones (tổng 3 tiếng)

| # | Thời gian | Nội dung | Tiêu chí hoàn thành |
|---|---|---|---|
| M0 | 0:00–0:15 | Khởi tạo Next.js, shadcn, Docker Postgres, Prisma schema, migrate. Viết `lib/zalo.ts` tối thiểu + chạy thử `getUpdates`, chuyển tiếp 1 tin sang bot, xem payload thô | DB chạy; biết payload chuyển tiếp chứa gì |
| M1 | 0:15–0:35 | `seed.ts` theo mục 11; backend `lib/clients.ts`, `lib/messages.ts`, `lib/versions.ts`, `mergePR`, `rejectPR`, `rollback` | `npm run db:reset` ra đúng dữ liệu; gọi thử tạo khách, merge, rollback bằng script OK |
| M2 | 0:35–1:05 | `lib/llm.ts`, `createPR` + kiểm tra ở server; `scripts/test-create-pr.ts` | PR với bộ tin demo ra đúng "PR mong đợi" |
| M3 | 1:05–1:45 | Server Actions trong `app/actions/`; trang `/`, `/clients/new`, `/clients/[id]` (thông tin, hộp tin, yêu cầu, lịch sử, nút tổng hợp, thêm tin thủ công), `/pr/[id]` (thay đổi, bằng chứng, merge) | **Luồng lõi chạy trọn trên web**: tạo khách → thêm tin → tổng hợp → duyệt → merge → version mới |
| M4 | 1:45–2:15 | `scripts/zalo-bot.ts` theo mục 9 | Chuyển tiếp thật → `/xong` → bot gửi link PR mở được |
| M5 | 2:15–2:35 | Theo thứ tự: nút Rollback trên UI → trang `/c/[token]` → panel giá | Làm được đến đâu tính đến đó |
| M6 | 2:35–3:00 | **Đóng băng code.** `db:reset`, chạy kịch bản demo 2 lần, sửa lỗi chặn demo duy nhất | Demo chạy 2 lần liên tiếp không lỗi |

**Quy tắc cắt cứng:**
- Hết **1:45** mà M3 chưa xong → bỏ M4, dồn sức cho M3, demo bằng tin thủ công.
- Hết **2:15** mà bot chưa nhận được tin → bỏ bot.
- Sau **2:35** không thêm tính năng mới.

---

## 13. Quy tắc làm việc cho Claude Code

1. Làm đúng thứ tự milestone. Không làm trước tính năng của milestone sau.
2. Không thêm đăng nhập, test framework, i18n, state management library, hay abstraction không cần thiết.
3. Không tự thêm dependency ngoài: next, react, tailwind, shadcn/ui, prisma, @prisma/client, @anthropic-ai/sdk, tsx, zod (tùy chọn). Cần thêm thì hỏi trước.
4. Mọi logic nghiệp vụ trong `lib/`; UI và worker chỉ gọi hàm trong `lib/`.
5. Lỗi phải hiện rõ trên UI (toast hoặc dòng chữ đỏ), không nuốt lỗi.
6. Text giao diện bằng tiếng Việt. Tên biến, hàm, file bằng tiếng Anh.
7. Với API Zalo: đọc tài liệu chính thức, không đoán tên endpoint/trường dữ liệu.
8. Kết thúc mỗi milestone: liệt kê file đã tạo/sửa, lệnh để chạy thử, và commit với message `M<n>: <mô tả>`.

---

## 14. Kịch bản demo (~3 phút)

1. **Vấn đề (20s):** khách nhắn cả Gmail lẫn Zalo, đổi ý liên tục, cuối cùng không ai nhớ đã chốt gì.
2. Mở trang khách **Anh Minh**: đang ở v2, có 1 email chưa xử lý.
3. **Trực tiếp trên điện thoại:** gõ `/khach Anh Minh` cho bot → chuyển tiếp 7 tin Zalo → bot xác nhận "✓ Anh Minh" → gõ `/xong` → bot gửi link PR.
4. Mở PR: "+1 thêm, ~2 sửa, −1 xóa". Chỉ vào REQ-003: AI lấy **nâu**, không phải đỏ đô, bằng chứng trỏ đúng tin. Bằng chứng của menu đến từ **Gmail** → gộp đa kênh.
5. Bỏ chọn một thẻ bằng chứng, xem panel giá: khối lượng tăng → nên báo thêm X để thực nhận Y.
6. **Merge → v3** → mở link khách (trên điện thoại cùng Wi-Fi) → bấm "Tôi đồng ý" → trạng thái cập nhật.
7. **Rollback về v2** → lịch sử không bao giờ mất.
8. **Kết (20s):** Zalo Bot API chính thức, không rủi ro tài khoản. Lộ trình: Gmail OAuth, tự phát hiện kết thúc phiên, Zalo OA cho agency, gợi ý giá thông minh hơn.

**Trước giờ demo 10 phút:** `npm run db:reset`, chạy `npm run dev` và `npm run zalo-bot`, gửi `/help` kiểm tra bot, mở sẵn tab trang khách. Luôn có **video quay dự phòng**.
