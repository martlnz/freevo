import { db } from "./db";
import type { ReqSnapshot } from "./types";

export type ClientInput = {
  name: string;
  phone?: string | null;
  emails?: string[];
  zaloId?: string | null;
  note?: string | null;
  projectName?: string | null;
  contractPrice?: number;
  baseEffort?: number;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(d: Partial<ClientInput>, requireName: boolean) {
  if (requireName || d.name !== undefined) {
    if (!d.name || !d.name.trim()) throw new Error("Tên khách không được để trống.");
  }
  for (const e of d.emails ?? []) {
    if (!EMAIL_RE.test(e)) throw new Error(`Email không hợp lệ: ${e}`);
  }
  if (d.contractPrice !== undefined && !(d.contractPrice >= 0)) throw new Error("Giá phải lớn hơn hoặc bằng 0.");
  if (d.baseEffort !== undefined && !(d.baseEffort >= 0)) throw new Error("Khối lượng phải lớn hơn hoặc bằng 0.");
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
    include: { _count: { select: { prs: true } } },
  });
  const pending = await db.message.groupBy({ by: ["clientId"], where: { prId: null }, _count: true });
  const pm = new Map(pending.map((p) => [p.clientId, p._count]));
  return rows.map((c) => ({
    ...c,
    emails: parseEmails(c.emails),
    pendingCount: pm.get(c.id) ?? 0,
    prCount: c._count.prs,
  }));
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
  return {
    ...c,
    emails: parseEmails(c.emails),
    pendingCount,
    latestSnapshot: (latest ? JSON.parse(latest.snapshot) : { requirements: [] }) as ReqSnapshot,
  };
}

export async function createClient(data: ClientInput) {
  validate(data, true);
  const c = await db.client.create({
    data: {
      name: data.name.trim(),
      phone: data.phone || null,
      emails: JSON.stringify(data.emails ?? []),
      zaloId: data.zaloId || null,
      note: data.note || null,
      projectName: data.projectName || null,
      contractPrice: data.contractPrice ?? 0,
      baseEffort: data.baseEffort ?? 0,
    },
  });
  await db.version.create({
    data: { clientId: c.id, number: 1, snapshot: JSON.stringify({ requirements: [] }), note: "Khởi tạo" },
  });
  return c;
}

export async function updateClient(id: string, data: Partial<ClientInput>) {
  validate(data, false);
  const { emails, name, ...rest } = data;
  return db.client.update({
    where: { id },
    data: {
      ...rest,
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(emails !== undefined ? { emails: JSON.stringify(emails) } : {}),
    },
  });
}

export async function findOrCreateClientByName(name: string) {
  if (!name.trim()) throw new Error("Tên khách không được để trống.");
  const found = await db.client.findFirst({ where: { name: name.trim() } });
  return found ?? createClient({ name });
}
