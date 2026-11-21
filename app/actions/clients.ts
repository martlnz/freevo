"use server";
import { revalidatePath } from "next/cache";
import { createClient, updateClient, type ClientInput } from "@/lib/clients";
import { addMessage } from "@/lib/messages";
import { wrap } from "@/lib/result";

function str(f: FormData, k: string) {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
}

function parseForm(f: FormData): ClientInput {
  const emails = str(f, "emails").split(/[,;\s]+/).filter(Boolean);
  const price = str(f, "contractPrice");
  const effort = str(f, "baseEffort");
  return {
    name: str(f, "name"),
    phone: str(f, "phone") || null,
    emails,
    zaloId: str(f, "zaloId") || null,
    note: str(f, "note") || null,
    projectName: str(f, "projectName") || null,
    ...(price ? { contractPrice: Number(price) } : {}),
    ...(effort ? { baseEffort: Number(effort) } : {}),
  };
}

/** Returns the new client id; the UI navigates to /clients/[id]. */
export async function createClientAction(formData: FormData) {
  return wrap(async () => {
    const c = await createClient(parseForm(formData));
    revalidatePath("/");
    return { id: c.id };
  });
}

export async function updateClientAction(id: string, formData: FormData) {
  return wrap(async () => {
    const f = parseForm(formData);
    await updateClient(id, f);
    revalidatePath("/");
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
