/* Zalo bot worker: long-polls getUpdates, handles text commands, @mention routing, and screenshot images.
 * Run: npm run zalo-bot */
import { appendFileSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { db as prisma } from "../lib/db";
import { listClients, findOrCreateClientByName } from "../lib/clients";
import { addMessage, assignMessageToClient, listPendingMessages } from "../lib/messages";
import { createPR } from "../lib/pr";
import { formatVND } from "../lib/pricing-calc";
import { ingestScreenshot, suggestClientForText } from "../lib/routing";

try { process.loadEnvFile(".env"); } catch {}

const TOKEN = process.env.ZALO_BOT_TOKEN;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TTL_MS = Number(process.env.ACTIVE_CLIENT_TTL_HOURS ?? 2) * 3600_000;
const API = `https://bot-api.zaloplatforms.com/bot${TOKEN}`;
const STATE_ID = "zalo";
const DRY = process.env.ZALO_DRY === "1";

const countPending = async (clientId: string) => (await listPendingMessages(clientId)).length;

function stripAccents(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

async function findOrCreate(name: string) {
  const hit = (await listClients()).find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  if (hit) return { client: hit, created: false };
  return { client: await findOrCreateClientByName(name), created: true };
}

// ---------------------------------------------------------------------------
type ApiResp<T> = { ok: boolean; result?: T; description?: string; error_code?: number };
type Attachment = { type?: string; url?: string; payload?: { url?: string } };
type Update = {
  event_name?: string;
  message?: {
    message_id: string;
    date?: number;
    text?: string;
    caption?: string;
    photo_url?: string;
    image_url?: string;
    attachments?: Attachment[];
    from?: { id: string; display_name?: string };
    chat: { id: string; chat_type?: string };
  };
};

export function extractImageUrl(u: Update): string | null {
  const m = u.message;
  if (!m) return null;
  if (m.photo_url) return m.photo_url;
  if (m.image_url) return m.image_url;
  for (const a of m.attachments ?? []) {
    if (a.type === "image" || a.type === "photo" || !a.type) {
      if (a.payload?.url) return a.payload.url;
      if (a.url) return a.url;
    }
  }
  return null;
}

async function call<T>(method: string, body: object = {}): Promise<ApiResp<T>> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResp<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const send = async (chat_id: string, text: string) => {
  if (DRY) {
    console.log("BOT>", text);
    return;
  }
  const r = await call("sendMessage", { chat_id, text: text.slice(0, 2000) });
  if (!r.ok) console.error("sendMessage failed:", r.error_code, r.description);
};

async function getState() {
  return prisma.botState.upsert({ where: { id: STATE_ID }, update: {}, create: { id: STATE_ID } });
}

async function setActive(clientId: string) {
  await prisma.botState.upsert({
    where: { id: STATE_ID },
    update: { activeClientId: clientId, updatedAt: new Date() },
    create: { id: STATE_ID, activeClientId: clientId },
  });
}

async function getActiveClient() {
  const state = await getState();
  if (!state.activeClientId || Date.now() - state.updatedAt.getTime() > TTL_MS) return null;
  return prisma.client.findUnique({ where: { id: state.activeClientId } });
}

const HELP = [
  "Lệnh:",
  "/khach – liệt kê khách, rồi gõ số để chọn",
  "/khach <tên> – chọn (hoặc tạo mới) khách",
  "@<TênKhách> <tin nhắn> – gắn nhanh tin vào khách đó",
  "/xong – tổng hợp tin thành PR",
  "/help – xem hướng dẫn",
  "Bạn cũng có thể GỬI ẢNH CHỤP MÀN HÌNH đoạn chat: AI sẽ tự đọc tin nhắn, nhận diện tên khách và ngân sách.",
].join("\n");

let awaitingPick: string[] | null = null;
const heldMsgIds = new Map<string, string[]>();

async function attachHeld(chatId: string, clientId: string) {
  const ids = heldMsgIds.get(chatId) ?? [];
  heldMsgIds.delete(chatId);
  let attached = 0;
  for (const id of ids) {
    try {
      await assignMessageToClient(id, clientId);
      attached++;
    } catch {}
  }
  return attached;
}

async function matchMentionPrefix(raw: string) {
  if (!raw.startsWith("@")) return null;
  const rest = raw.slice(1).trim();
  if (!rest) return null;
  const clients = await listClients();
  const restClean = stripAccents(rest);
  // Sort longest client names first so "Anh Minh" matches before "Minh"
  const sorted = [...clients].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    const cname = stripAccents(c.name);
    const compact = cname.replace(/\s+/g, "");
    if (restClean.startsWith(cname + " ")) {
      const msgText = rest.slice(c.name.length).trim();
      if (msgText) return { client: c, text: msgText };
    }
    if (compact.length >= 3 && restClean.startsWith(compact + " ")) {
      const sp = rest.indexOf(" ");
      const msgText = sp > 0 ? rest.slice(sp + 1).trim() : "";
      if (msgText) return { client: c, text: msgText };
    }
  }
  return null;
}

function guessMimeFromPath(p: string): string {
  const ext = extname(p).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

function guessMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function loadPhotoBuffer(photoUrl: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  if (photoUrl.startsWith("data:")) {
    const m = photoUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("Định dạng data URL không hợp lệ.");
    return { buffer: Buffer.from(m[2], "base64"), mimeType: m[1], name: "screenshot.png" };
  }
  if (!/^https?:\/\//i.test(photoUrl)) {
    return { buffer: readFileSync(photoUrl), mimeType: guessMimeFromPath(photoUrl), name: photoUrl };
  }
  const resp = await fetch(photoUrl);
  if (!resp.ok) throw new Error(`Không tải được ảnh (${resp.status}).`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  const rawHeader = resp.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const mimeType = rawHeader.startsWith("image/") ? rawHeader : (guessMimeFromBuffer(buffer) ?? guessMimeFromPath(photoUrl));
  return { buffer, mimeType, name: photoUrl };
}

export async function handleImage(chatId: string, photoUrl: string) {
  try {
    const active = await getActiveClient();
    const { buffer, mimeType, name } = await loadPhotoBuffer(photoUrl);
    const res = await ingestScreenshot({
      buffer,
      mimeType,
      filenameHint: name,
      clientId: active?.id ?? null,
      channelOverride: "zalo",
    });
    console.log("image processed:", {
      client: res.clientName ?? "unassigned",
      extracted: res.extractedCount,
      detectedContactName: res.detectedContactName,
      sourceImage: res.sourceImage,
    });

    if (res.clientId && res.clientName) {
      if (!active) await setActive(res.clientId);
      const pending = await countPending(res.clientId);
      const autoTag = res.matchedAutomatically ? " (tự nhận diện từ ảnh)" : "";
      const budgetTag = res.detectedBudget ? `\n💰 Ngân sách phát hiện: ${formatVND(res.detectedBudget)}` : "";
      return send(
        chatId,
        `📷 Đã đọc ảnh cho ${res.clientName}${autoTag}: tách ${res.extractedCount} tin nhắn (${pending} tin chờ).${budgetTag}`,
      );
    }

    const sug = res.suggestedClientName
      ? `\n💡 AI gợi ý: ${res.suggestedClientName}${res.suggestedReason ? ` — ${res.suggestedReason}` : ""}`
      : "";
    return send(
      chatId,
      `📷 Đã tách ${res.extractedCount} tin nhắn từ ảnh nhưng chưa rõ khách nào. Đã lưu vào Hộp tin chưa phân loại.${sug}\nXem & gán tại: ${APP_URL}/inbox`,
    );
  } catch (e) {
    console.error("handleImage error:", (e as Error).message);
    return send(chatId, `Không đọc được ảnh chụp: ${(e as Error).message}`);
  }
}

export async function handle(chatId: string, text: string) {
  const t = text.trim();
  if (t === "/help" || t === "/start") return send(chatId, HELP);

  if (t === "/khach") {
    const cs = await listClients();
    if (!cs.length) return send(chatId, "Chưa có khách nào. Dùng /khach <tên> để tạo.");
    awaitingPick = cs.map((c) => c.id);
    return send(chatId, "Chọn khách (gõ số):\n" + cs.map((c, i) => `${i + 1}. ${c.name}`).join("\n"));
  }
  if (t.startsWith("/khach ")) {
    const name = t.slice(7).trim();
    if (!name) return send(chatId, "Thiếu tên khách.");
    const { client, created } = await findOrCreate(name);
    await setActive(client.id);
    awaitingPick = null;
    const n = await attachHeld(chatId, client.id);
    return send(
      chatId,
      `Đang làm việc với: ${client.name}` +
        (created ? "\nĐã tạo khách mới" : "") +
        (n ? `\n✓ Đã gắn ${n} tin trước đó` : ""),
    );
  }
  if (awaitingPick && /^\d+$/.test(t)) {
    const id = awaitingPick[Number(t) - 1];
    if (id) {
      const c = await prisma.client.findUnique({ where: { id } });
      if (c) {
        await setActive(id);
        awaitingPick = null;
        const n = await attachHeld(chatId, id);
        return send(chatId, `Đang làm việc với: ${c.name}` + (n ? `\n✓ Đã gắn ${n} tin trước đó` : ""));
      }
    }
    return send(chatId, "Số không hợp lệ, gõ /khach để xem lại danh sách.");
  }

  const mention = await matchMentionPrefix(t);
  if (mention) {
    await addMessage({ clientId: mention.client.id, channel: "zalo", sender: "unknown", text: mention.text });
    await setActive(mention.client.id);
    return send(chatId, `✓ ${mention.client.name} (${await countPending(mention.client.id)} tin chờ)`);
  }

  const active = await getActiveClient();

  if (t === "/xong") {
    if (!active) return send(chatId, "Chưa chọn khách. Dùng /khach <tên> để chọn.");
    if (!(await countPending(active.id))) return send(chatId, `Không có tin mới cho ${active.name}.`);
    try {
      const pr = await createPR(active.id);
      const sum = pr.summary ? `${pr.summary}\n` : "";
      return send(chatId, `Đã tạo PR cho ${active.name}: ${pr.changes.length} thay đổi.\n${sum}${APP_URL}/pr/${pr.id}`);
    } catch (e) {
      console.error("createPR failed:", (e as Error).message);
      return send(chatId, "Có lỗi khi tổng hợp, thử lại /xong");
    }
  }

  if (!active) {
    const sug = await suggestClientForText(t);
    const saved = await addMessage({
      clientId: null,
      channel: "zalo",
      sender: "unknown",
      text: t,
      suggestedClientId: sug?.clientId ?? null,
      suggestedReason: sug?.reason ?? null,
    });
    heldMsgIds.set(chatId, [...(heldMsgIds.get(chatId) ?? []), saved.id]);
    const hint = sug ? `\n💡 AI gợi ý: ${sug.clientName} (${sug.reason})` : "";
    return send(
      chatId,
      `Chưa chọn khách — đã lưu vào Hộp tin chưa phân loại.${hint}\nGõ /khach <tên> để gán ngay hoặc xem tại ${APP_URL}/inbox`,
    );
  }

  await addMessage({ clientId: active.id, channel: "zalo", sender: "unknown", text: t });
  await setActive(active.id);
  return send(chatId, `✓ ${active.name} (${await countPending(active.id)} tin chờ)`);
}

async function main() {
  if (!TOKEN) {
    console.error("ZALO_BOT_TOKEN missing");
    process.exit(1);
  }
  const dw = await call("deleteWebhook");
  console.log("deleteWebhook ok:", dw.ok, dw.ok ? "" : `${dw.error_code} ${dw.description}`);

  const seen = new Set<string>();
  const state = await getState();
  if (state.lastUpdateId) seen.add(state.lastUpdateId);
  let backoff = 1000;

  for (;;) {
    try {
      const r = await call<Update | Update[]>("getUpdates", { timeout: 30 });
      if (!r.ok && r.error_code === 408) {
        await sleep(300);
        continue;
      }
      if (!r.ok) {
        console.error("getUpdates error:", r.error_code, r.description);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30000);
        continue;
      }
      backoff = 1000;
      const list: Update[] = Array.isArray(r.result)
        ? r.result
        : r.result && Object.keys(r.result).length
          ? [r.result]
          : [];
      if (!list.length) {
        await sleep(500);
        continue;
      }
      for (const u of list) {
        const m = u.message;
        if (!m) continue;
        appendFileSync("zalo-raw.log", JSON.stringify(u) + "\n");
        console.log("update:", u.event_name, m.message_id, JSON.stringify(m.text ?? m.caption ?? ""));
        if (seen.has(m.message_id)) continue;
        await prisma.botState.upsert({
          where: { id: STATE_ID },
          update: { lastUpdateId: m.message_id },
          create: { id: STATE_ID, lastUpdateId: m.message_id },
        });
        seen.add(m.message_id);

        const imgUrl = extractImageUrl(u);
        if (imgUrl || u.event_name === "message.image.received" || u.event_name === "user_send_image") {
          if (imgUrl) {
            try {
              await handleImage(m.chat.id, imgUrl);
            } catch (e) {
              console.error("handleImage error:", (e as Error).message);
            }
          }
          continue;
        }
        if ((u.event_name === "message.text.received" || u.event_name === "user_send_text") && m.text) {
          try {
            await handle(m.chat.id, m.text);
          } catch (e) {
            console.error("handle error:", (e as Error).message);
          }
        }
      }
      await sleep(300);
    } catch (e) {
      console.error("poll error:", (e as Error).message);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30000);
    }
  }
}

if (process.argv[1]?.endsWith("zalo-bot.ts")) main();
