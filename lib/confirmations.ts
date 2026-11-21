import { db } from "./db";
import type { PRChange, ReqSnapshot } from "./types";

export async function getByToken(token: string) {
  const c = await db.confirmation.findUnique({
    where: { token },
    include: { pr: { include: { client: true } } },
  });
  if (!c) throw new Error("Liên kết xác nhận không hợp lệ.");
  const [version, messages, versions] = await Promise.all([
    c.pr.mergedVersionNo
      ? db.version.findUnique({
          where: { clientId_number: { clientId: c.pr.clientId, number: c.pr.mergedVersionNo } },
        })
      : Promise.resolve(null),
    db.message.findMany({ where: { prId: c.prId }, orderBy: { sentAt: "asc" } }),
    db.version.findMany({ where: { clientId: c.pr.clientId }, orderBy: { number: "desc" } }),
  ]);
  return {
    ...c,
    changes: JSON.parse(c.pr.changes) as PRChange[],
    snapshot: (version ? JSON.parse(version.snapshot) : { requirements: [] }) as ReqSnapshot,
    versionNo: c.pr.mergedVersionNo,
    messages,
    versions,
  };
}

export async function respond(token: string, input: { approved: boolean; comment?: string }) {
  const c = await db.confirmation.findUnique({ where: { token } });
  if (!c) throw new Error("Liên kết xác nhận không hợp lệ.");
  if (c.status !== "pending") throw new Error("Bản cập nhật này đã được phản hồi.");
  return db.confirmation.update({
    where: { token },
    include: { pr: { select: { clientId: true } } },
    data: {
      status: input.approved ? "confirmed" : "declined",
      note: input.comment?.trim() || null,
      respondedAt: new Date(),
    },
  });
}
