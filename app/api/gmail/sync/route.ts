import { revalidatePath } from "next/cache";
import { syncGmailInbox } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const data = await syncGmailInbox();
    revalidatePath("/");
    revalidatePath("/inbox");
    for (const cid of data.matchedClientIds) {
      revalidatePath(`/clients/${cid}`);
    }
    return Response.json({ ok: true, data });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Không thể đồng bộ Gmail.";
    return Response.json({ ok: false, error }, { status: 400 });
  }
}
