import { db } from "./db";

export type MessageInput = {
  clientId: string;
  channel: "zalo" | "gmail" | "manual";
  sender?: "client" | "freelancer" | "unknown";
  text: string;
  sentAt?: Date;
};

export async function addMessage(data: MessageInput) {
  if (!data.text || !data.text.trim()) throw new Error("Nội dung tin nhắn không được để trống.");
  return db.message.create({
    data: {
      clientId: data.clientId,
      channel: data.channel,
      sender: data.sender ?? "unknown",
      text: data.text.trim(),
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
