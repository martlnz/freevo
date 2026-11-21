// Reset the local dev SQLite DB: delete prisma/dev.db (+ -journal) only, re-push schema, re-seed.
// Replaces `prisma db push --force-reset`. Only touches the gitignored dev DB files.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(__dirname, "..");
for (const f of ["prisma/dev.db", "prisma/dev.db-journal"]) {
  rmSync(resolve(root, f), { force: true });
  console.log(`Đã xóa (nếu có): ${f}`);
}

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true, env: process.env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("npx", ["prisma", "db", "push", "--skip-generate"]);
run("npx", ["tsx", "--env-file=.env", "prisma/seed.ts"]);
