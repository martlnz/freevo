// Reset the local dev SQLite DB: try deleting prisma/dev.db (+ -journal) first;
// if locked by a running server on Windows (EPERM/EBUSY), fall back to schema push + row clear.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(__dirname, "..");
let locked = false;

for (const f of ["prisma/dev.db", "prisma/dev.db-journal"]) {
  try {
    rmSync(resolve(root, f), { force: true });
    console.log(`Đã xóa (nếu có): ${f}`);
  } catch (e) {
    locked = true;
    console.warn(`Không xóa trực tiếp được ${f} (${e instanceof Error ? e.message : e}), chuyển sang fallback xóa bảng.`);
  }
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true, env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"]);

async function clearRowsIfLocked() {
  if (!locked) return;
  const { db } = await import("../lib/db");
  try {
    await db.confirmation.deleteMany();
    await db.version.deleteMany();
    await db.pullRequest.deleteMany();
    await db.message.deleteMany();
    await db.pastProject.deleteMany();
    await db.botState.deleteMany();
    await db.client.deleteMany();
    console.log("Đã xóa dữ liệu cũ trong DB đang mở.");
  } finally {
    await db.$disconnect();
  }
}

clearRowsIfLocked()
  .then(() => {
    run("npx", ["tsx", "--env-file=.env", "prisma/seed.ts"]);
  })
  .catch((e) => {
    console.error("Reset DB thất bại:", e);
    process.exit(1);
  });
