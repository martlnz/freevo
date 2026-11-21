/* Clear all workspace data cleanly without re-seeding.
 * Run: npm run db:clear */
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../lib/db";

async function main() {
  await db.$transaction([
    db.confirmation.deleteMany(),
    db.version.deleteMany(),
    db.message.deleteMany(),
    db.pullRequest.deleteMany(),
    db.pastProject.deleteMany(),
    db.client.deleteMany(),
    db.botState.deleteMany({ where: { id: "gmail" } }),
    db.botState.updateMany({ where: { id: "zalo" }, data: { activeClientId: null } }),
  ]);

  const uploadsDir = resolve(process.cwd(), "public", "uploads");
  let removedUploads = 0;
  if (existsSync(uploadsDir)) {
    for (const file of readdirSync(uploadsDir)) {
      unlinkSync(resolve(uploadsDir, file));
      removedUploads++;
    }
  }

  console.log(`Đã xóa sạch toàn bộ dữ liệu (kèm ${removedUploads} tệp ảnh trong public/uploads).`);
}

main()
  .catch((e) => {
    console.error("db:clear thất bại:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
