import { db } from "../lib/db";
import { createPR, getPR, mergePR } from "../lib/pr";
import { getLatestVersion, listVersions, rollback } from "../lib/versions";
import { getPricing } from "../lib/pricing";
import { getByToken, respond } from "../lib/confirmations";
import { isMock } from "../lib/llm";

let fails = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra)}`);
  if (!cond) fails++;
}

async function main() {
  console.log(`Chế độ LLM: ${isMock() ? "MOCK (LLM_MOCK=1)" : "THẬT (" + (process.env.LLM_MODEL ?? "claude-haiku-5-5") + ")"}`);
  const client = await db.client.findFirstOrThrow({ where: { name: "Demo dự phòng" } });
  const pr = await createPR(client.id);
  console.log(JSON.stringify({ summary: pr.summary, effortDelta: pr.effortDelta, changes: pr.changes, usage: pr.usage }, null, 2));

  const msgs = await db.message.findMany({ where: { clientId: client.id } });
  const ids = new Set(msgs.map((m) => m.id));
  const ch = pr.changes;
  const t = (c: (typeof ch)[number]) => `${c.title ?? ""} ${c.detail ?? ""}`;
  const color = ch.find((c) => c.op === "modify" && c.reqId === "REQ-003");
  const menu = ch.find((c) => c.op === "modify" && c.reqId === "REQ-002");
  const about = ch.find((c) => c.op === "add" && /giới thiệu/i.test(c.title ?? ""));
  // Real model may legitimately turn REQ-005 into a text-address requirement instead of removing it.
  const maps = ch.find((c) => c.reqId === "REQ-005" && (c.op === "remove" || (c.op === "modify" && /không|bỏ|chữ/i.test(t(c)))));

  check("modify REQ-003 sang nâu #6F4E37", !!color && /6F4E37/i.test(t(color)) && /nâu/i.test(t(color)), color);
  check("REQ-003 không phải đỏ đô", !!color && !/đỏ/i.test(t(color)));
  check("modify REQ-002 thêm ảnh từng món", !!menu && /ảnh/i.test(t(menu)), menu);
  check("add Trang Giới thiệu", !!about, about);
  check("REQ-005 (Maps) bị bỏ hoặc đổi thành địa chỉ chữ", !!maps);
  check("effortDelta dương", pr.effortDelta > 0, pr.effortDelta);
  check("mọi evidence là Message.id thật và không rỗng", ch.length > 0 && ch.every((c) => c.evidence.length > 0 && c.evidence.every((e) => ids.has(e))));
  check("modify/remove có before", ch.filter((c) => c.op !== "add").every((c) => !!c.before));
  const pending = await db.message.count({ where: { clientId: client.id, prId: null } });
  check("tin nhắn đã gắn vào PR", pending === 0, pending);
  const roles = await db.message.count({ where: { clientId: client.id, sender: "unknown" } });
  check("vai trò tin nhắn unknown đã được suy luận", roles === 0, roles);

  const pricing = await getPricing(client.id, pr.id);
  check("pricing đề xuất > 0", pricing.suggestedPrice > 0 && pricing.proposedEffort === pricing.currentEffort + pr.effortDelta, pricing);

  const merged = await mergePR(pr.id);
  const v = await getLatestVersion(client.id);
  const reqs = v!.snapshot.requirements;
  check("merge tạo v3", merged.versionNo === 3 && v!.number === 3, merged);
  check("v3: REQ-003 là nâu", /6F4E37/i.test(reqs.find((r) => r.id === "REQ-003")?.detail ?? ""));
  check("v3: REQ-005 không còn là bản đồ nhúng", !/nhúng google maps vị trí/i.test(reqs.find((r) => r.id === "REQ-005")?.detail ?? ""));
  check("v3: có REQ-007 Giới thiệu", /giới thiệu/i.test(reqs.find((r) => r.id === "REQ-007")?.title ?? ""), reqs.map((r) => r.id));
  check("link xác nhận", merged.confirmUrl.endsWith(`/c/${merged.token}`));
  check("PR merged", (await getPR(pr.id)).status === "merged");

  const conf = await getByToken(merged.token);
  check("getByToken pending", conf.status === "pending");
  await respond(merged.token, { approved: true, comment: "ok" });
  check("respond confirmed", (await getByToken(merged.token)).status === "confirmed");

  const rb = await rollback(client.id, 1);
  const vs = await listVersions(client.id);
  check("rollback tạo v4 từ v1, không xóa version", rb.number === 4 && vs.length === 4, vs.map((x) => x.number));
  check("v4 snapshot = v1", JSON.stringify(vs[0].snapshot) === JSON.stringify(vs[3].snapshot));

  console.log(fails === 0 ? "\nTẤT CẢ PASS" : `\n${fails} FAIL`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("FAIL  lỗi:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
