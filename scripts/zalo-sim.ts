try {
  process.loadEnvFile(".env");
} catch {
  // .env file may be absent
}

type DemoMessage = {
  sender: "client" | "freelancer";
  text: string;
};

const DEMO_CLIENT_NAME = "Demo dự phòng";

const DEMO_MESSAGES: DemoMessage[] = [
  {
    sender: "client",
    text: "Em ơi anh nghĩ lại rồi, màu xanh navy hơi lạnh, đổi sang đỏ đô nha",
  },
  {
    sender: "client",
    text: "À thôi, đỏ đô hơi chói, đổi sang nâu cà phê đi em",
  },
  {
    sender: "freelancer",
    text: "Dạ, nâu đậm kiểu #6F4E37 được không anh?",
  },
  {
    sender: "client",
    text: "Ok nâu đó. Thêm cho anh trang Giới thiệu kể câu chuyện quán nữa",
  },
  {
    sender: "client",
    text: "Còn Google Maps thì bỏ đi, anh để địa chỉ dạng chữ là được",
  },
  {
    sender: "freelancer",
    text: "Dạ em chốt: màu nâu #6F4E37, thêm trang Giới thiệu, bỏ Maps, menu có ảnh từng món. Em gửi bản cập nhật nhé",
  },
  {
    sender: "client",
    text: "Ok em",
  },
];

function printUsage() {
  console.error('Usage:');
  console.error('  npm run zalo-sim -- "<client name>" "<message text>" [more messages]');
  console.error("  npm run zalo-sim -- --demo");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exitCode = args.length === 0 ? 1 : 0;
    return;
  }

  const [{ db }, { findOrCreateClientByName }, { addMessage, listMessages }] = await Promise.all([
    import("../lib/db"),
    import("../lib/clients"),
    import("../lib/messages"),
  ]);

  try {
    if (args[0] === "--demo") {
      const client = await findOrCreateClientByName(DEMO_CLIENT_NAME);
      const existing = new Set((await listMessages(client.id)).map((m) => m.text.trim()));
      const now = Date.now();
      const hourMs = 60 * 60 * 1000;
      const stepMs = Math.floor(hourMs / (DEMO_MESSAGES.length + 1));

      let savedCount = 0;
      for (let i = 0; i < DEMO_MESSAGES.length; i++) {
        const item = DEMO_MESSAGES[i];
        if (existing.has(item.text.trim())) {
          continue;
        }
        const sentAt = new Date(now - hourMs + (i + 1) * stepMs);
        const saved = await addMessage({
          clientId: client.id,
          channel: "zalo",
          sender: item.sender,
          text: item.text,
          sentAt,
        });
        existing.add(saved.text.trim());
        savedCount++;
        console.log(`[${saved.sentAt.toISOString()}] (${saved.channel}/${saved.sender}) ${client.name}: ${saved.text}`);
      }

      if (savedCount === 0) {
        console.log(`Không có tin mới nào cần thêm cho "${client.name}" (đã có đủ ${DEMO_MESSAGES.length} tin).`);
      }
      return;
    }

    const [clientName, ...messages] = args;
    if (!clientName || messages.length === 0) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    const client = await findOrCreateClientByName(clientName);
    for (const text of messages) {
      const saved = await addMessage({
        clientId: client.id,
        channel: "zalo",
        sender: "client",
        text,
      });
      console.log(`[${saved.sentAt.toISOString()}] (${saved.channel}/${saved.sender}) ${client.name}: ${saved.text}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
