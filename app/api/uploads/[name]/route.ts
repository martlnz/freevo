import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";

export const dynamic = "force-dynamic";

const SAFE_NAME = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)$/i;

const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!SAFE_NAME.test(name)) {
    return new Response("Not Found", { status: 404 });
  }
  const filePath = resolve(process.cwd(), "public", "uploads", name);
  try {
    const buf = readFileSync(filePath);
    const mime = EXT_MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
