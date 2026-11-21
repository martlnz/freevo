import { db } from "./db";
import type { ReqSnapshot } from "./types";

export async function getLatestVersion(clientId: string) {
  const v = await db.version.findFirst({ where: { clientId }, orderBy: { number: "desc" } });
  return v ? { ...v, snapshot: JSON.parse(v.snapshot) as ReqSnapshot } : null;
}

export async function listVersions(clientId: string) {
  const vs = await db.version.findMany({ where: { clientId }, orderBy: { number: "desc" } });
  return vs.map((v) => ({ ...v, snapshot: JSON.parse(v.snapshot) as ReqSnapshot }));
}

export async function rollback(clientId: string, versionNo: number) {
  return db.$transaction(async (tx) => {
    const target = await tx.version.findUnique({ where: { clientId_number: { clientId, number: versionNo } } });
    if (!target) throw new Error(`Không tìm thấy phiên bản v${versionNo}.`);
    const latest = await tx.version.findFirst({ where: { clientId }, orderBy: { number: "desc" } });
    return tx.version.create({
      data: {
        clientId,
        number: (latest?.number ?? 0) + 1,
        snapshot: target.snapshot,
        note: `Rollback về v${versionNo}`,
      },
    });
  });
}
