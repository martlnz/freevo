import { revalidatePath } from "next/cache";
import { ingestScreenshot } from "@/lib/routing";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const rawClientId = form.get("clientId");
    const clientId = typeof rawClientId === "string" && rawClientId.trim() ? rawClientId.trim() : null;

    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: "Thiếu tệp ảnh chụp màn hình." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await ingestScreenshot({
      buffer,
      mimeType: file.type || "image/png",
      filenameHint: file.name,
      clientId,
    });

    revalidatePath("/");
    revalidatePath("/inbox");
    if (data.clientId) {
      revalidatePath(`/clients/${data.clientId}`);
    }

    return Response.json({ ok: true, data });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Không thể xử lý ảnh chụp màn hình.";
    return Response.json({ ok: false, error }, { status: 400 });
  }
}
