// End-to-end flow test for lib/ (mock LLM). Run: npm run test:flow
process.env.LLM_MOCK = "1";

import { db } from "../lib/db";
import { createClient } from "../lib/clients";
import { assignMessageToClient, listUnassignedMessages } from "../lib/messages";
import { createPR, getPR, updateChange, mergePR, rejectPR } from "../lib/pr";
import { getLatestVersion, listVersions, rollback } from "../lib/versions";
import { getPricing } from "../lib/pricing";
import { getByToken, respond } from "../lib/confirmations";
import { wrap } from "../lib/result";

let fails = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond || extra === undefined ? "" : "  -> " + JSON.stringify(extra)}`);
  if (!cond) fails++;
}
const isErr = (r: { ok: boolean; error?: string }) => r.ok === false && typeof r.error === "string";

async function main() {
  const client = await db.client.findFirstOrThrow({ where: { name: "Demo dự phòng" } });
  const pr = await createPR(client.id);
  check("createPR: open, có thay đổi", pr.status === "open" && pr.changes.length > 0, pr.status);
  check("createPR: baseVersionNo = 2", pr.baseVersionNo === 2, pr.baseVersionNo);

  // pricing with 10% tax (effort computed from merged PRs: 9 + 1 = 10, budget = 7,000,000)
  process.env.TAX_RATE = "0.1";
  const p = await getPricing(client.id, pr.id);
  const unit = (6000000 / 8 + 9500000 / 12 + 4500000 / 6 + 12000000 / 15) / 4;
  check("pricing: unitPrice đúng", Math.abs(p.unitPrice - unit) < 1e-6, p.unitPrice);
  check("pricing: currentEffort = 9 + 1 (từ PRs đã merge)", p.currentEffort === 10, p.currentEffort);
  check("pricing: proposedEffort = current + delta", p.proposedEffort === p.currentEffort + pr.effortDelta, p);
  check("pricing: suggested làm tròn 100k", p.suggestedPrice === Math.round((p.proposedEffort * unit) / 100000) * 100000, p.suggestedPrice);
  check("pricing: budget = 7,000,000 & overBudget", p.budget === 7000000 && p.netBudget === 6300000 && p.overBudget === (p.suggestedPrice > 7000000), p);
  check("pricing: netSuggested = giá * 0.9", p.netSuggested === Math.round(p.suggestedPrice * 0.9), p);
  check("pricing: priceForNet(9,000,000) = 10,000,000", p.priceForNet(9000000) === 10000000, p.priceForNet(9000000));

  // toggle accepted, then merge
  const off = pr.changes.findIndex((c) => c.op === "add");
  const upd = await updateChange(pr.id, off, { accepted: false });
  check("updateChange: accepted=false", upd[off].accepted === false);
  const upd2 = await updateChange(pr.id, off, { accepted: true });
  check("updateChange: accepted=true lại", upd2[off].accepted === true);
  const upd3 = await updateChange(pr.id, off, { accepted: false });
  check("updateChange: tắt lần nữa", upd3[off].accepted === false);
  const bad = await wrap(() => updateChange(pr.id, 999, { accepted: true }));
  check("updateChange: index sai -> Result lỗi", isErr(bad), bad);

  const m = await mergePR(pr.id);
  check("merge: v2 -> v3", m.versionNo === 3, m.versionNo);
  check("merge: confirmUrl chứa token", m.confirmUrl.endsWith(`/c/${m.token}`), m.confirmUrl);
  const v3 = await getLatestVersion(client.id);
  check("merge: thay đổi bị tắt không áp dụng (không có Giới thiệu)", !v3!.snapshot.requirements.some((r) => /giới thiệu/i.test(r.title)));
  check("merge: thay đổi được chấp nhận có áp dụng (REQ-003 nâu)", /6F4E37/i.test(v3!.snapshot.requirements.find((r) => r.id === "REQ-003")?.detail ?? ""));
  const gp = await getPR(pr.id);
  check("PR merged, mergedVersionNo=3", gp.status === "merged" && gp.mergedVersionNo === 3);

  const conf = await getByToken(m.token);
  check("getByToken: pending + versionNo", conf.status === "pending" && conf.versionNo === 3);
  const r1 = await wrap(() => respond(m.token, { approved: true, comment: "ok" }));
  check("respond approve -> confirmed", r1.ok && r1.data.status === "confirmed", r1);
  const r2 = await wrap(() => respond(m.token, { approved: false }));
  check("respond lần 2 -> Result lỗi", isErr(r2), r2);
  check("respond lần 2 không đổi trạng thái", (await getByToken(m.token)).status === "confirmed");

  // edge cases
  const mm = await wrap(() => mergePR(pr.id));
  check("merge lần 2 -> Result lỗi", isErr(mm), mm);
  check("merge lần 2 không tạo version mới", (await listVersions(client.id)).length === 3);
  const ut = await wrap(() => getByToken("khong-ton-tai"));
  check("getByToken token lạ -> Result lỗi", isErr(ut), ut);
  const ur = await wrap(() => respond("khong-ton-tai", { approved: true }));
  check("respond token lạ -> Result lỗi", isErr(ur), ur);

  // reject then merge
  await db.message.create({ data: { clientId: client.id, channel: "manual", sender: "client", text: "Thêm trang Giới thiệu nữa nhé", sentAt: new Date() } });
  const pr2 = await createPR(client.id);
  const rej = await wrap(() => rejectPR(pr2.id));
  check("reject: status rejected", rej.ok && rej.data.status === "rejected", rej);
  const rm = await wrap(() => mergePR(pr2.id));
  check("reject rồi merge -> Result lỗi", isErr(rm), rm);
  const re = await wrap(() => updateChange(pr2.id, 0, { accepted: true }));
  check("sửa PR đã reject -> Result lỗi", isErr(re), re);
  const nm = await wrap(() => createPR(client.id));
  check("createPR không có tin mới -> Result lỗi", isErr(nm), nm);

  // rollback
  const rb = await rollback(client.id, 1);
  const vs = await listVersions(client.id);
  check("rollback v1 -> v4, giữ lịch sử", rb.number === 4 && vs.length === 4, vs.map((v) => v.number));
  check("rollback: snapshot v4 = v1", vs[0].snapshot.requirements.length === 5 && JSON.stringify(vs[0].snapshot) === JSON.stringify(vs[3].snapshot));
  const rbBad = await wrap(() => rollback(client.id, 99));
  check("rollback version không tồn tại -> Result lỗi", isErr(rbBad), rbBad);

  // auto-scan on client creation (Chị Lan + lan.spa@example.com) -> PR v1 -> budget 9,500,000
  const unassignedBefore = await listUnassignedMessages();
  check("seed có 3 tin chưa phân loại", unassignedBefore.length === 3, unassignedBefore.length);
  const lan = await createClient({ name: "Chị Lan", emails: ["lan.spa@example.com"], projectName: "Website Spa Sen" }, { autoCreateInitialPR: true });
  check("createClient quét đúng 2 email lan.spa@example.com", lan.attachedCount === 2, lan.attachedCount);
  check("createClient tự dựng PR khởi tạo v1", !!lan.initialPrId, lan.initialPrId);
  const lanAfter = await db.client.findUniqueOrThrow({ where: { id: lan.id } });
  check("createPR tự cập nhật budget = 9,500,000", lanAfter.budget === 9500000, lanAfter.budget);
  const lanMerged = await mergePR(lan.initialPrId!);
  check("merge PR khởi tạo tạo đúng v1", lanMerged.versionNo === 1, lanMerged.versionNo);
  const lanPricing = await getPricing(lan.id);
  check("currentEffort của Chị Lan lấy từ PR v1 = 12", lanPricing.currentEffort === 12, lanPricing.currentEffort);

  // assign remaining unassigned Zalo message to Anh Minh
  const unassignedAfter = await listUnassignedMessages();
  check("còn 1 tin Zalo chưa phân loại có gợi ý Anh Minh", unassignedAfter.length === 1 && !!unassignedAfter[0].suggestedClientId, unassignedAfter);
  await assignMessageToClient(unassignedAfter[0].id, unassignedAfter[0].suggestedClientId!);
  check("sau khi gán còn 0 tin chưa phân loại", (await listUnassignedMessages()).length === 0);

  console.log(fails === 0 ? "\nTẤT CẢ PASS" : `\n${fails} FAIL`);
  process.exitCode = fails === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error("FAIL  lỗi:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
