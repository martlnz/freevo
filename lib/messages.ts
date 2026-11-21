import { db } from "./db";

export type MessageInput = {
  clientId?: string | null;
  channel: "zalo" | "gmail" | "manual";
  sender?: "client" | "freelancer" | "unknown";
  text: string;
  contact?: string | null;
  sourceImage?: string | null;
  suggestedClientId?: string | null;
  suggestedReason?: string | null;
  sentAt?: Date;
};

const normContact = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
const normDigits = (s: string) => s.replace(/\D/g, "");

export async function addMessage(data: MessageInput) {
  if (!data.text || !data.text.trim()) throw new Error("Nội dung tin nhắn không được để trống.");
  return db.message.create({
    data: {
      clientId: data.clientId ?? null,
      channel: data.channel,
      sender: data.sender ?? "unknown",
      text: data.text.trim(),
      contact: data.contact?.trim() || null,
      sourceImage: data.sourceImage || null,
      suggestedClientId: data.suggestedClientId || null,
      suggestedReason: data.suggestedReason || null,
      sentAt: data.sentAt ?? new Date(),
    },
  });
}

export function listMessages(clientId: string) {
  return db.message.findMany({ where: { clientId }, orderBy: { sentAt: "asc" } });
}

export function listPendingMessages(clientId: string) {
  return db.message.findMany({ where: { clientId, prId: null }, orderBy: { sentAt: "asc" } });
}

export function countUnassignedMessages() {
  return db.message.count({ where: { clientId: null } });
}

export async function listUnassignedMessages() {
  const [msgs, clients] = await Promise.all([
    db.message.findMany({ where: { clientId: null }, orderBy: { sentAt: "desc" } }),
    db.client.findMany({ select: { id: true, name: true } }),
  ]);
  const byId = new Map(clients.map((c) => [c.id, c.name]));
  return msgs.map((m) => ({
    ...m,
    suggestedClientName: m.suggestedClientId ? (byId.get(m.suggestedClientId) ?? null) : null,
  }));
}

export async function assignMessageToClient(messageId: string, clientId: string) {
  const [msg, client] = await Promise.all([
    db.message.findUnique({ where: { id: messageId } }),
    db.client.findUnique({ where: { id: clientId } }),
  ]);
  if (!msg) throw new Error("Không tìm thấy tin nhắn.");
  if (!client) throw new Error("Không tìm thấy khách hàng.");
  return db.message.update({
    where: { id: messageId },
    data: { clientId, suggestedClientId: null, suggestedReason: null },
  });
}

export async function assignMessagesByContact(contact: string, clientId: string) {
  const target = normContact(contact);
  if (!target) throw new Error("Thông tin liên hệ không hợp lệ.");
  const client = await db.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Không tìm thấy khách hàng.");
  const unassigned = await db.message.findMany({ where: { clientId: null, contact: { not: null } } });
  const ids = unassigned.filter((m) => m.contact && normContact(m.contact) === target).map((m) => m.id);
  if (ids.length === 0) return { count: 0 };
  const r = await db.message.updateMany({
    where: { id: { in: ids } },
    data: { clientId, suggestedClientId: null, suggestedReason: null },
  });
  return { count: r.count };
}

export async function scanAndAttachMessagesForClient(client: {
  id: string;
  name: string;
  emails: string[];
  phone: string | null;
  zaloId: string | null;
}): Promise<{ attachedCount: number }> {
  const unassigned = await db.message.findMany({ where: { clientId: null, contact: { not: null } } });
  if (unassigned.length === 0) return { attachedCount: 0 };

  const emailSet = new Set(client.emails.map((e) => normContact(e)).filter(Boolean));
  const phoneDigits = client.phone ? normDigits(client.phone) : "";
  const zaloIdNorm = client.zaloId ? normContact(client.zaloId) : "";
  const nameNorm = normContact(client.name);

  const matchIds = unassigned
    .filter((m) => {
      if (!m.contact) return false;
      const cNorm = normContact(m.contact);
      if (emailSet.has(cNorm)) return true;
      if (zaloIdNorm && cNorm === zaloIdNorm) return true;
      const cDigits = normDigits(m.contact);
      if (phoneDigits.length >= 8 && cDigits.length >= 8 && phoneDigits === cDigits) return true;
      if (nameNorm.length >= 3 && cNorm === nameNorm) return true;
      return false;
    })
    .map((m) => m.id);

  if (matchIds.length === 0) return { attachedCount: 0 };
  const updated = await db.message.updateMany({
    where: { id: { in: matchIds } },
    data: { clientId: client.id, suggestedClientId: null, suggestedReason: null },
  });
  return { attachedCount: updated.count };
}
