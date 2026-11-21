// Unit-style test: drives the bot handler with fake messages (no Zalo calls). Run with LLM_MOCK=1.
process.env.ZALO_DRY = "1";
import { handle } from "./zalo-bot";
import { db } from "../lib/db";

async function main() {
  const chat = "test-chat";
  await db.botState.deleteMany({ where: { id: "zalo" } });
  for (const t of ["/help", "xin chào, nhờ làm thêm trang giỏ hàng", "/khach", "/khach Demo dự phòng", "/xong"]) {
    console.log("USER>", t);
    await handle(chat, t);
  }
}
main().then(() => process.exit(0));
