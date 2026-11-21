import { db } from "./db";
import { scanAndAttachMessagesForClient } from "./messages";
import { createPR } from "./pr";
import type { ReqSnapshot } from "./types";

export type ClientInput = {
  name: string;
  phone?: string | null;
  emails?: string[];
  zaloId?: string | null;
  note?: string | null;
  projectName?: string | null;
  budget?: number | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(d: Partial<ClientInput>, requireName: boolean) {
  if (requireName || d.name !== undefined) {
    if (!d.name || !d.name.trim()) throw new Error("Tên khách không được để trống.");
  }
  for (const e of d.emails ?? []) {
    if (!EMAIL_RE.test(e)) throw new Error(`Email không hợp lệ: ${e}`);
  }
  if (d.budget !== undefined && d.budget !== null && !(d.budget >= 0)) {
    throw new Error("Ngân sách phải lớn hơn hoặc bằng 0.");
  }
}

export function parseEmails(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function listClients() {
  const rows = await db.client.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { prs: true } },
      versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, prId: true } },
      prs: {
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, effortDelta: true, confirmation: { select: { status: true } } },
      },
    },
  });
  const pending = await db.message.groupBy({
    by: ["clientId"],
    where: { clientId: { not: null }, prId: null },
    _count: true,
  });
  const pm = new Map(pending.filter((p) => p.clientId).map((p) => [p.clientId as string, p._count]));
  return rows.map(({ versions, prs, _count, ...c }) => {
    const latestVersion = versions[0];
    const openPrs = prs.filter((p) => p.status === "open");
    const currentEffort = prs.filter((p) => p.status === "merged").reduce((s, p) => s + p.effortDelta, 0);
    const versionPr = latestVersion?.prId
      ? prs.find((p) => p.id === latestVersion.prId && p.confirmation)
      : undefined;
    const latestMergedConf =
      versionPr?.confirmation ?? prs.find((p) => p.status === "merged" && p.confirmation)?.confirmation ?? null;
    return {
      ...c,
      emails: parseEmails(c.emails),
      pendingCount: pm.get(c.id) ?? 0,
      prCount: _count.prs,
      currentEffort,
      currentVersionNo: latestVersion?.number ?? 0,
      openPrCount: openPrs.length,
      latestOpenPrId: openPrs[0]?.id ?? null,
      latestConfirmationStatus: latestMergedConf?.status ?? null,
    };
  });
}

export async function getClientDetail(id: string) {
  const c = await db.client.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { number: "desc" } },
      prs: { orderBy: { createdAt: "desc" }, include: { confirmation: true } },
      pastProjects: true,
    },
  });
  if (!c) throw new Error("Không tìm thấy khách hàng.");
  const pendingCount = await db.message.count({ where: { clientId: id, prId: null } });
  const latest = c.versions[0];
  const currentEffort = c.prs.filter((p) => p.status === "merged").reduce((s, p) => s + p.effortDelta, 0);
  const latestPrWithConf =
    (latest?.prId ? c.prs.find((p) => p.id === latest.prId && p.confirmation) : undefined) ??
    c.prs.find((p) => p.status === "merged" && p.confirmation);
  const latestConfirmation = latestPrWithConf?.confirmation
    ? {
        prId: latestPrWithConf.id,
        mergedVersionNo: latestPrWithConf.mergedVersionNo,
        token: latestPrWithConf.confirmation.token,
        status: latestPrWithConf.confirmation.status,
        note: latestPrWithConf.confirmation.note,
        respondedAt: latestPrWithConf.confirmation.respondedAt,
      }
    : null;
  return {
    ...c,
    emails: parseEmails(c.emails),
    pendingCount,
    currentEffort,
    latestSnapshot: (latest ? JSON.parse(latest.snapshot) : { requirements: [] }) as ReqSnapshot,
    latestConfirmation,
  };
}

export async function createClient(data: ClientInput, opts?: { autoCreateInitialPR?: boolean }) {
  validate(data, true);
  const emails = data.emails ?? [];
  const c = await db.client.create({
    data: {
      name: data.name.trim(),
      phone: data.phone || null,
      emails: JSON.stringify(emails),
      zaloId: data.zaloId || null,
      note: data.note || null,
      projectName: data.projectName || null,
      budget: data.budget ?? null,
    },
  });

  const { attachedCount } = await scanAndAttachMessagesForClient({
    id: c.id,
    name: c.name,
    emails,
    phone: c.phone,
    zaloId: c.zaloId,
  });

  let initialPrId: string | null = null;
  if (opts?.autoCreateInitialPR && attachedCount > 0) {
    try {
      const pr = await createPR(c.id);
      initialPrId = pr.id;
    } catch {
      // Keep client & attached messages if LLM fails transiently
    }
  }

  return { ...c, attachedCount, initialPrId };
}

export async function updateClient(id: string, data: Partial<ClientInput>) {
  validate(data, false);
  const { emails, name, ...rest } = data;
  const updated = await db.client.update({
    where: { id },
    data: {
      ...rest,
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(emails !== undefined ? { emails: JSON.stringify(emails) } : {}),
    },
  });
  await scanAndAttachMessagesForClient({
    id: updated.id,
    name: updated.name,
    emails: parseEmails(updated.emails),
    phone: updated.phone,
    zaloId: updated.zaloId,
  });
  return updated;
}

export async function findOrCreateClientByName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tên khách không được để trống.");
  const all = await db.client.findMany({ orderBy: { createdAt: "asc" } });
  const found = all.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase());
  return found ?? createClient({ name: trimmed });
}
