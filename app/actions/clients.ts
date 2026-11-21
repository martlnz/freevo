"use server";
import { revalidatePath } from "next/cache";
import { createClient, updateClient, type ClientInput } from "@/lib/clients";
import { addMessage, assignMessageToClient, assignMessagesByContact } from "@/lib/messages";
import { wrap } from "@/lib/result";

function str(f: FormData, k: string) {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function parseForm(f: FormData): ClientInput {
  const emails = str(f, "emails").split(/[,;\s]+/).filter(Boolean);
  const budget = str(f, "budget");
  return {
    name: str(f, "name"),
    phone: str(f, "phone") || null,
    emails,
    zaloId: str(f, "zaloId") || null,
    note: str(f, "note") || null,
    projectName: str(f, "projectName") || null,
    ...(budget ? { budget: Number(budget) } : {}),
  };
}

/** Creates a client, scans unassigned messages matching contacts, and auto-creates PR for v1 if matched. */
export async function createClientAction(formData: FormData) {
  return wrap(async () => {
    const c = await createClient(parseForm(formData), { autoCreateInitialPR: true });
    revalidatePath("/");
    revalidatePath("/inbox");
    return { id: c.id, initialPrId: c.initialPrId, attachedCount: c.attachedCount };
  });
}

export async function updateClientAction(id: string, formData: FormData) {
  return wrap(async () => {
    const f = parseForm(formData);
    await updateClient(id, f);
    revalidatePath("/");
    revalidatePath("/inbox");
    revalidatePath(`/clients/${id}`);
    return { id };
  });
}

export async function addManualMessageAction(clientId: string, formData: FormData) {
  return wrap(async () => {
    const sender = str(formData, "sender");
    const m = await addMessage({
      clientId,
      channel: "manual",
      sender: sender === "client" || sender === "freelancer" ? sender : "unknown",
      text: str(formData, "text"),
    });
    revalidatePath("/");
    revalidatePath(`/clients/${clientId}`);
    return { id: m.id };
  });
}

export async function assignMessageAction(messageId: string, clientId: string) {
  return wrap(async () => {
    const m = await assignMessageToClient(messageId, clientId);
    revalidatePath("/");
    revalidatePath("/inbox");
    revalidatePath(`/clients/${clientId}`);
    return {
      id: m.id,
      clientId,
      learnedEmail: m.learnedEmail,
      totalAssignedCount: m.totalAssignedCount,
    };
  });
}

export async function assignContactMessagesAction(contact: string, clientId: string) {
  return wrap(async () => {
    const r = await assignMessagesByContact(contact, clientId);
    revalidatePath("/");
    revalidatePath("/inbox");
    revalidatePath(`/clients/${clientId}`);
    return { count: r.count, learnedEmail: r.learnedEmail };
  });
}
