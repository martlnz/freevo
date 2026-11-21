import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const V1 = [
  { id: "REQ-001", title: "Trang chủ", detail: "Banner ảnh quán + slogan", status: "agreed" },
  { id: "REQ-002", title: "Trang menu", detail: "Danh sách đồ uống kèm giá", status: "agreed" },
  { id: "REQ-003", title: "Màu chủ đạo", detail: "Xanh navy", status: "agreed" },
  { id: "REQ-004", title: "Form đặt bàn", detail: "Gửi thông tin về email chủ quán", status: "agreed" },
  { id: "REQ-005", title: "Bản đồ", detail: "Nhúng Google Maps vị trí quán", status: "agreed" },
];
const V2 = [
  ...V1,
  { id: "REQ-006", title: "Nút gọi điện", detail: "Nút gọi nhanh nổi ở góc màn hình (mobile)", status: "agreed" },
];

const PAST = [
  { name: "Landing page tiệm bánh", hours: 8, price: 6000000 },
  { name: "Website spa", hours: 12, price: 9500000 },
  { name: "Landing page sự kiện", hours: 6, price: 4500000 },
  { name: "Web giới thiệu công ty", hours: 15, price: 12000000 },
];

const ZALO = [
  "Em ơi anh nghĩ lại rồi, màu xanh navy hơi lạnh, đổi sang đỏ đô nha",
  "À thôi, đỏ đô hơi chói, đổi sang nâu cà phê đi em",
  "Dạ, nâu đậm kiểu #6F4E37 được không anh?",
  "Ok nâu đó. Thêm cho anh trang Giới thiệu kể câu chuyện quán nữa",
  "Còn Google Maps thì bỏ đi, anh để địa chỉ dạng chữ là được",
  "Dạ em chốt: màu nâu #6F4E37, thêm trang Giới thiệu, bỏ Maps, menu có ảnh từng món. Em gửi bản cập nhật nhé",
  "Ok em",
];

const DAY = 86400000;

async function seedClient(name: string, opts: { zaloMessages: boolean; email: string }) {
  const now = Date.now();
  const c = await db.client.create({
    data: {
      name,
      emails: JSON.stringify([opts.email]),
      projectName: "Landing page quán cà phê Mộc",
      budget: 7000000,
    },
  });

  // PR #1 (initial v1): 9 effort points derived from initial scope messages + budget 7M
  const pr1 = await db.pullRequest.create({
    data: {
      clientId: c.id,
      status: "merged",
      summary: "Khởi tạo phạm vi ban đầu cho landing page quán cà phê Mộc.",
      effortDelta: 9,
      baseVersionNo: 0,
      mergedVersionNo: 1,
      mergedAt: new Date(now - 10 * DAY),
      createdAt: new Date(now - 10 * DAY),
      changes: JSON.stringify(
        V1.map((r) => ({
          op: "add",
          reqId: r.id,
          title: r.title,
          detail: r.detail,
          status: "agreed",
          reason: "Yêu cầu ban đầu qua email.",
          evidence: [],
          accepted: true,
          selectedEvidence: [],
        })),
      ),
    },
  });
  const initMsg1 = await db.message.create({
    data: {
      clientId: c.id,
      channel: "gmail",
      sender: "client",
      contact: opts.email,
      text: "Chào em, anh cần làm landing page quán cà phê Mộc gồm trang chủ, menu, màu xanh navy, form đặt bàn và Google Maps. Ngân sách bên anh khoảng 7 triệu em nhé.",
      sentAt: new Date(now - 11 * DAY),
      prId: pr1.id,
    },
  });
  const initMsg2 = await db.message.create({
    data: {
      clientId: c.id,
      channel: "gmail",
      sender: "freelancer",
      contact: opts.email,
      text: "Dạ em đã nhận đủ thông tin và lên danh sách 5 hạng mục ban đầu cho bản v1 ạ.",
      sentAt: new Date(now - 11 * DAY + 1800000),
      prId: pr1.id,
    },
  });
  const pr1Changes = JSON.parse(pr1.changes).map((ch: Record<string, unknown>) => ({
    ...ch,
    evidence: [initMsg1.id, initMsg2.id],
    selectedEvidence: [initMsg1.id, initMsg2.id],
  }));
  await db.pullRequest.update({ where: { id: pr1.id }, data: { changes: JSON.stringify(pr1Changes) } });
  await db.version.create({
    data: { clientId: c.id, number: 1, snapshot: JSON.stringify({ requirements: V1 }), prId: pr1.id, note: "Bản đầu tiên" },
  });

  // PR #2 (v2): +1 effort point
  const pr2 = await db.pullRequest.create({
    data: {
      clientId: c.id,
      status: "merged",
      summary: "Thêm nút gọi điện nổi trên mobile.",
      effortDelta: 1,
      baseVersionNo: 1,
      mergedVersionNo: 2,
      mergedAt: new Date(now - 5 * DAY),
      createdAt: new Date(now - 5 * DAY),
      changes: JSON.stringify([
        {
          op: "add",
          reqId: "REQ-006",
          title: "Nút gọi điện",
          detail: "Nút gọi nhanh nổi ở góc màn hình (mobile)",
          status: "agreed",
          reason: "Khách muốn gọi nhanh từ điện thoại.",
          evidence: [],
          accepted: true,
          selectedEvidence: [],
        },
      ]),
    },
  });
  const e1 = await db.message.create({
    data: {
      clientId: c.id,
      channel: "gmail",
      sender: "client",
      contact: opts.email,
      text: "Chào em, anh muốn thêm nút gọi điện ở góc màn hình cho người dùng điện thoại.",
      sentAt: new Date(now - 6 * DAY),
      prId: pr2.id,
    },
  });
  const e2 = await db.message.create({
    data: {
      clientId: c.id,
      channel: "gmail",
      sender: "client",
      contact: opts.email,
      text: "Nút gọi cho nổi lên, bấm là gọi luôn nhé em.",
      sentAt: new Date(now - 6 * DAY + 3600000),
      prId: pr2.id,
    },
  });
  const changes2 = JSON.parse((await db.pullRequest.findUniqueOrThrow({ where: { id: pr2.id } })).changes);
  changes2[0].evidence = [e1.id, e2.id];
  changes2[0].selectedEvidence = [e1.id, e2.id];
  await db.pullRequest.update({ where: { id: pr2.id }, data: { changes: JSON.stringify(changes2) } });
  await db.version.create({
    data: { clientId: c.id, number: 2, snapshot: JSON.stringify({ requirements: V2 }), prId: pr2.id, note: pr2.summary },
  });
  await db.confirmation.create({ data: { prId: pr2.id, status: "confirmed", respondedAt: new Date(now - 4 * DAY) } });
  await db.pastProject.createMany({ data: PAST.map((p) => ({ ...p, clientId: c.id })) });

  // Pending Gmail message
  await db.message.create({
    data: {
      clientId: c.id,
      channel: "gmail",
      sender: "client",
      contact: opts.email,
      text: "Chào em, anh bổ sung: trang menu anh muốn có ảnh cho từng món nhé.",
      sentAt: new Date(now - DAY),
    },
  });
  if (opts.zaloMessages) {
    const base = now - 2 * 3600000;
    for (let i = 0; i < ZALO.length; i++) {
      await db.message.create({
        data: { clientId: c.id, channel: "manual", sender: "unknown", text: ZALO[i], sentAt: new Date(base + i * 60000) },
      });
    }
  }
  return c;
}

async function main() {
  const now = Date.now();
  const minh = await seedClient("Anh Minh", { zaloMessages: false, email: "minh.cafe@example.com" });
  const demo = await seedClient("Demo dự phòng", { zaloMessages: true, email: "demo.cafe@example.com" });

  // Unassigned Gmail messages for a not-yet-created client ("lan.spa@example.com")
  await db.message.createMany({
    data: [
      {
        clientId: null,
        channel: "gmail",
        sender: "client",
        contact: "lan.spa@example.com",
        text: "Chào em, chị bên Spa Sen. Chị muốn làm website gồm: trang chủ giới thiệu không gian spa và bảng giá liệu trình nhé.",
        sentAt: new Date(now - 3 * 3600000),
      },
      {
        clientId: null,
        channel: "gmail",
        sender: "client",
        contact: "lan.spa@example.com",
        text: "Thêm form đặt lịch hẹn và bản đồ chỉ đường giúp chị. Ngân sách bên chị dự kiến 9 triệu rưỡi em ạ.",
        sentAt: new Date(now - 2 * 3600000),
      },
      {
        clientId: null,
        channel: "zalo",
        sender: "unknown",
        text: "Em ơi nhớ làm màu nâu cà phê đậm một chút cho hợp phong cách quán Mộc nha",
        suggestedClientId: minh.id,
        suggestedReason: "Nhắc màu nâu cà phê và quán Mộc, khớp dự án của Anh Minh.",
        sentAt: new Date(now - 30 * 60000),
      },
    ],
  });

  console.log(`Seed xong: Anh Minh (${minh.id}), Demo dự phòng (${demo.id}), + 3 tin chưa phân loại`);
}

main().finally(() => db.$disconnect());
