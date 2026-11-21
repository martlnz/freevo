"use server";
import { revalidatePath } from "next/cache";
import { createPR, updateChange, mergePR, rejectPR, getPR } from "@/lib/pr";
import { rollback } from "@/lib/versions";
import { respond } from "@/lib/confirmations";
import { wrap } from "@/lib/result";
import type { PRChange } from "@/lib/types";

/** Returns the new PR id; the UI navigates to /pr/[id]. */
export async function createPRAction(clientId: string) {
  return wrap(async () => {
    const pr = await createPR(clientId);
    revalidatePath(`/clients/${clientId}`);
    return { id: pr.id };
  });
}

export async function updateChangeAction(
  prId: string,
  index: number,
  patch: Partial<Pick<PRChange, "accepted" | "selectedEvidence" | "title" | "detail">>,
) {
  return wrap(async () => {
    const changes = await updateChange(prId, index, patch);
    revalidatePath(`/pr/${prId}`);
    return changes;
  });
}

/** Returns { versionNo, token, confirmUrl }. */
export async function mergePRAction(prId: string) {
  return wrap(async () => {
    const r = await mergePR(prId);
    const pr = await getPR(prId);
    revalidatePath(`/pr/${prId}`);
    revalidatePath(`/clients/${pr.clientId}`);
    return r;
  });
}

export async function rejectPRAction(prId: string) {
  return wrap(async () => {
    const pr = await rejectPR(prId);
    revalidatePath(`/pr/${prId}`);
    revalidatePath(`/clients/${pr.clientId}`);
    return { id: prId };
  });
}

export async function rollbackAction(clientId: string, versionNo: number) {
  return wrap(async () => {
    const v = await rollback(clientId, versionNo);
    revalidatePath(`/clients/${clientId}`);
    return { versionNo: v.number };
  });
}

export async function respondConfirmationAction(token: string, formData: FormData) {
  return wrap(async () => {
    const decision = formData.get("decision");
    const comment = formData.get("comment");
    const c = await respond(token, {
      approved: decision === "approve" || decision === "confirmed" || decision === "true",
      comment: typeof comment === "string" ? comment : undefined,
    });
    revalidatePath(`/c/${token}`);
    return { status: c.status };
  });
}
