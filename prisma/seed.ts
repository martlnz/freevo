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

async function seedClient(name: string, opts: { zaloMessages: boolean }) {
  const now = Date.now();
  const c = await db.client.create({
    data: {
      name,
      emails: JSON.stringify(["minh.cafe@example.com"]),
      projectName: "Landing page quán cà phê Mộc",
      contractPrice: 7000000,
      baseEffort: 9,
    },
  });
  await db.version.create({ data: { clientId: c.id, number: 1, snapshot: JSON.stringify({ requirements: V1 }), note: "Bản đầu tiên" } });
  const pr = await db.pullRequest.create({
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
    data: { clientId: c.id, channel: "gmail", sender: "client", text: "Chào em, anh muốn thêm nút gọi điện ở góc màn hình cho người dùng điện thoại.", sentAt: new Date(now - 6 * DAY), prId: pr.id },
  });
  const e2 = await db.message.create({
    data: { clientId: c.id, channel: "gmail", sender: "client", text: "Nút gọi cho nổi lên, bấm là gọi luôn nhé em.", sentAt: new Date(now - 6 * DAY + 3600000), prId: pr.id },
  });
  const changes = JSON.parse((await db.pullRequest.findUniqueOrThrow({ where: { id: pr.id } })).changes);
  changes[0].evidence = [e1.id, e2.id];
  changes[0].selectedEvidence = [e1.id, e2.id];
  await db.pullRequest.update({ where: { id: pr.id }, data: { changes: JSON.stringify(changes) } });
  await db.version.create({ data: { clientId: c.id, number: 2, snapshot: JSON.stringify({ requirements: V2 }), prId: pr.id, note: pr.summary } });
  await db.confirmation.create({ data: { prId: pr.id, status: "confirmed", respondedAt: new Date(now - 4 * DAY) } });
  await db.pastProject.createMany({ data: PAST.map((p) => ({ ...p, clientId: c.id })) });

  await db.message.create({
    data: { clientId: c.id, channel: "gmail", sender: "client", text: "Chào em, anh bổ sung: trang menu anh muốn có ảnh cho từng món nhé.", sentAt: new Date(now - DAY) },
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
  const minh = await seedClient("Anh Minh", { zaloMessages: false });
  const demo = await seedClient("Demo dự phòng", { zaloMessages: true });
  console.log(`Seed xong: Anh Minh (${minh.id}), Demo dự phòng (${demo.id})`);
}

main().finally(() => db.$disconnect());
