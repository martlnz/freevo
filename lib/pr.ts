import { randomUUID } from "node:crypto";
import { db } from "./db";
import { proposeDiff, type LlmUsage } from "./llm";
import type { PRChange, Req, ReqSnapshot } from "./types";

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

function parsePR<T extends { changes: string }>(pr: T): Omit<T, "changes"> & { changes: PRChange[] } {
  return { ...pr, changes: JSON.parse(pr.changes) as PRChange[] };
}

export async function createPR(clientId: string) {
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Không tìm thấy khách hàng.");
  const version = await db.version.findFirst({ where: { clientId }, orderBy: { number: "desc" } });
  const snapshot: ReqSnapshot = version ? JSON.parse(version.snapshot) : { requirements: [] };
  const messages = await db.message.findMany({ where: { clientId, prId: null }, orderBy: { sentAt: "asc" } });
  if (messages.length === 0) throw new Error("Không có tin nhắn mới");

  const refToId = new Map<string, string>();
  const llmMsgs = messages.map((m, i) => {
    const ref = `m${i + 1}`;
    refToId.set(ref, m.id);
    return { ref, channel: m.channel, sentAt: m.sentAt, role: m.sender, text: m.text };
  });

  const { proposal, usage } = await proposeDiff(snapshot, version?.number ?? 0, llmMsgs);

  const byId = new Map(snapshot.requirements.map((r) => [r.id, r]));
  const changes: PRChange[] = [];
  for (const c of proposal.changes ?? []) {
    const evidence = [
      ...new Set((c.evidence_refs ?? []).map((r) => refToId.get(r)).filter((x): x is string => !!x)),
    ];
    if (evidence.length === 0) continue;
    if (c.op === "add") {
      if (!c.title?.trim()) continue;
      if (snapshot.requirements.some((r) => norm(r.title) === norm(c.title!))) continue;
    } else {
      if (!c.req_id || !byId.has(c.req_id)) continue;
    }
    const old = c.req_id ? byId.get(c.req_id) : undefined;
    changes.push({
      op: c.op,
      ...(c.op !== "add" ? { reqId: c.req_id } : {}),
      ...(c.op !== "remove" ? { title: c.title, detail: c.detail, status: c.status ?? "agreed" } : {}),
      ...(old ? { before: `${old.title}: ${old.detail}` } : {}),
      reason: c.reason ?? "",
      evidence,
      accepted: true,
      selectedEvidence: [...evidence],
    });
  }

  const roleUpdates = (proposal.message_roles ?? []).filter((r) => refToId.has(r.ref));
  const pr = await db.$transaction(async (tx) => {
    for (const r of roleUpdates) {
      const id = refToId.get(r.ref)!;
      const m = messages.find((x) => x.id === id);
      if (m && m.sender === "unknown" && (r.role === "client" || r.role === "freelancer")) {
        await tx.message.update({ where: { id }, data: { sender: r.role } });
      }
    }
    const created = await tx.pullRequest.create({
      data: {
        clientId,
        status: "open",
        changes: JSON.stringify(changes),
        summary: proposal.summary ?? "",
        effortDelta: Math.round(Number(proposal.effort_delta) || 0),
        baseVersionNo: version?.number ?? 0,
      },
    });
    if (proposal.detected_budget != null && Number(proposal.detected_budget) > 0) {
      await tx.client.update({
        where: { id: clientId },
        data: { budget: Math.round(Number(proposal.detected_budget)) },
      });
    }
    await tx.message.updateMany({ where: { id: { in: messages.map((m) => m.id) } }, data: { prId: created.id } });
    return created;
  });
  return { ...parsePR(pr), usage: usage as LlmUsage };
}

export async function getPR(id: string) {
  const pr = await db.pullRequest.findUnique({
    where: { id },
    include: { client: true, confirmation: true },
  });
  if (!pr) throw new Error("Không tìm thấy PR.");
  const messages = await db.message.findMany({ where: { prId: id }, orderBy: { sentAt: "asc" } });
  return { ...parsePR(pr), messages };
}

export async function updateChange(
  prId: string,
  index: number,
  patch: Partial<Pick<PRChange, "accepted" | "selectedEvidence" | "title" | "detail">>,
) {
  const pr = await db.pullRequest.findUnique({ where: { id: prId } });
  if (!pr) throw new Error("Không tìm thấy PR.");
  if (pr.status !== "open") throw new Error("PR đã đóng, không thể chỉnh sửa.");
  const changes = JSON.parse(pr.changes) as PRChange[];
  const c = changes[index];
  if (!c) throw new Error("Không tìm thấy thay đổi.");
  if (patch.accepted !== undefined) c.accepted = !!patch.accepted;
  if (patch.selectedEvidence !== undefined) {
    c.selectedEvidence = patch.selectedEvidence.filter((e) => c.evidence.includes(e));
  }
  if (patch.title !== undefined) c.title = patch.title;
  if (patch.detail !== undefined) c.detail = patch.detail;
  await db.pullRequest.update({ where: { id: prId }, data: { changes: JSON.stringify(changes) } });
  return changes;
}

export async function mergePR(prId: string) {
  const pr = await db.pullRequest.findUnique({ where: { id: prId } });
  if (!pr) throw new Error("Không tìm thấy PR.");
  if (pr.status !== "open") throw new Error("PR này đã được xử lý.");
  return db.$transaction(async (tx) => {
    const latest = await tx.version.findFirst({ where: { clientId: pr.clientId }, orderBy: { number: "desc" } });
    const reqs: Req[] = latest ? (JSON.parse(latest.snapshot) as ReqSnapshot).requirements : [];
    const changes = JSON.parse(pr.changes) as PRChange[];
    for (const c of changes) {
      if (!c.accepted) continue;
      if (c.op === "add") {
        const max = reqs.reduce((m, r) => Math.max(m, parseInt(r.id.replace("REQ-", ""), 10) || 0), 0);
        const id = `REQ-${String(max + 1).padStart(3, "0")}`;
        reqs.push({ id, title: c.title ?? "", detail: c.detail ?? "", status: c.status ?? "agreed" });
        c.reqId = id;
      } else if (c.op === "modify") {
        const r = reqs.find((x) => x.id === c.reqId);
        if (!r) continue;
        if (c.title !== undefined) r.title = c.title;
        if (c.detail !== undefined) r.detail = c.detail;
        if (c.status !== undefined) r.status = c.status;
      } else {
        const i = reqs.findIndex((x) => x.id === c.reqId);
        if (i >= 0) reqs.splice(i, 1);
      }
    }
    const number = (latest?.number ?? 0) + 1;
    await tx.version.create({
      data: { clientId: pr.clientId, number, snapshot: JSON.stringify({ requirements: reqs }), prId, note: pr.summary },
    });
    const token = randomUUID();
    await tx.confirmation.create({ data: { prId, token } });
    await tx.pullRequest.update({
      where: { id: prId },
      data: { status: "merged", mergedAt: new Date(), mergedVersionNo: number, changes: JSON.stringify(changes) },
    });
    return { versionNo: number, token, confirmUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/c/${token}` };
  });
}

export async function rejectPR(prId: string) {
  const pr = await db.pullRequest.findUnique({ where: { id: prId } });
  if (!pr) throw new Error("Không tìm thấy PR.");
  if (pr.status !== "open") throw new Error("PR này đã được xử lý.");
  return parsePR(await db.pullRequest.update({ where: { id: prId }, data: { status: "rejected" } }));
}
