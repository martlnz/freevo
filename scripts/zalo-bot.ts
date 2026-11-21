/* Zalo bot worker: long-polls getUpdates and stores forwarded client messages.
 * Run: npm run zalo-bot */
import { appendFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

try { process.loadEnvFile(".env"); } catch {}

const TOKEN = process.env.ZALO_BOT_TOKEN;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TTL_MS = Number(process.env.ACTIVE_CLIENT_TTL_HOURS ?? 2) * 3600_000;
const API = `https://bot-api.zaloplatforms.com/bot${TOKEN}`;
const STATE_ID = "zalo";
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Local adapter over prisma. TODO: after lib/ is merged, switch to
// lib/clients.ts (listClients, findOrCreateClientByName) and lib/messages.ts (addMessage).
// ---------------------------------------------------------------------------
async function listClients() {
  return prisma.client.findMany({ orderBy: { createdAt: "asc" } });
}
async function findOrCreateClientByName(name: string) {
  const all = await prisma.client.findMany();
  const hit = all.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (hit) return { client: hit, created: false };
  return { client: await prisma.client.create({ data: { name } }), created: true };
}
async function addMessage(d: { clientId: string; channel: string; sender: string; text: string }) {
  return prisma.message.create({ data: d });
}
async function countPending(clientId: string) {
  return prisma.message.count({ where: { clientId, prId: null, sender: "client" } });
}

// ---------------------------------------------------------------------------
type ApiResp<T> = { ok: boolean; result?: T; description?: string; error_code?: number };
type Update = {
  event_name?: string;
  message?: { message_id: string; date?: number; text?: string; from?: { id: string; display_name?: string }; chat: { id: string; chat_type?: string } };
};

async function call<T>(method: string, body: object = {}): Promise<ApiResp<T>> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return (await res.json()) as ApiResp<T>;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const send = async (chat_id: string, text: string) => {
  const r = await call("sendMessage", { chat_id, text: text.slice(0, 2000) });
  if (!r.ok) console.error("sendMessage failed:", r.error_code, r.description);
};

async function getState() {
  return prisma.botState.upsert({ where: { id: STATE_ID }, update: {}, create: { id: STATE_ID } });
}
async function setActive(clientId: string) {
  await prisma.botState.upsert({
    where: { id: STATE_ID }, update: { activeClientId: clientId, updatedAt: new Date() },
    create: { id: STATE_ID, activeClientId: clientId },
  });
}

const HELP = [
  "Lệnh:",
  "/khach – liệt kê khách, rồi gõ số để chọn",
  "/khach <tên> – chọn (hoặc tạo mới) khách",
  "/xong – tổng hợp tin thành PR",
  "/help – xem hướng dẫn",
  "Tin khác (kể cả tin chuyển tiếp) sẽ được lưu cho khách đang chọn.",
].join("\n");

let awaitingPick: string[] | null = null; // client ids offered by the last /khach

async function handle(chatId: string, text: string) {
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
    const { client, created } = await findOrCreateClientByName(name);
    await setActive(client.id);
    awaitingPick = null;
    return send(chatId, `Đang làm việc với: ${client.name}` + (created ? "\nĐã tạo khách mới" : ""));
  }
  if (awaitingPick && /^\d+$/.test(t)) {
    const id = awaitingPick[Number(t) - 1];
    if (id) {
      const c = await prisma.client.findUnique({ where: { id } });
      if (c) {
        await setActive(id);
        awaitingPick = null;
        return send(chatId, `Đang làm việc với: ${c.name}`);
      }
    }
    return send(chatId, "Số không hợp lệ, gõ /khach để xem lại danh sách.");
  }

  const state = await getState();
  const active = state.activeClientId && Date.now() - state.updatedAt.getTime() <= TTL_MS
    ? await prisma.client.findUnique({ where: { id: state.activeClientId } }) : null;

  if (t === "/xong") {
    if (!active) return send(chatId, "Chưa chọn khách. Dùng /khach <tên> để chọn.");
    const n = await countPending(active.id);
    if (!n) return send(chatId, `Không có tin mới cho ${active.name}.`);
    try {
      // lib/pr.ts may not be merged yet; load it dynamically when present.
      const modPath = "../lib/pr";
      const mod = await import(modPath);
      const pr = await mod.createPR(active.id);
      const count = pr.changes ? JSON.parse(pr.changes).length : "?";
      return send(chatId, `Đã tạo PR cho ${active.name} (${count} thay đổi): ${APP_URL}/pr/${pr.id}`);
    } catch (e) {
      console.error("createPR failed:", (e as Error).message);
      return send(chatId, "Có lỗi khi tổng hợp, thử lại /xong");
    }
  }

  if (!active) return send(chatId, "Chưa chọn khách (hoặc đã quá hạn). Dùng /khach <tên> để chọn rồi gửi lại tin.");
  await addMessage({ clientId: active.id, channel: "zalo", sender: "client", text: t });
  await setActive(active.id); // refresh TTL
  return send(chatId, `✓ ${active.name} (${await countPending(active.id)} tin chờ)`);
}

async function main() {
  if (!TOKEN) { console.error("ZALO_BOT_TOKEN missing"); process.exit(1); }
  const dw = await call("deleteWebhook");
  console.log("deleteWebhook ok:", dw.ok, dw.ok ? "" : `${dw.error_code} ${dw.description}`);

  const seen = new Set<string>();
  const state = await getState();
  if (state.lastUpdateId) seen.add(state.lastUpdateId);
  let backoff = 1000;

  for (;;) {
    try {
      const r = await call<Update | Update[]>("getUpdates", { timeout: 30 });
      if (!r.ok && r.error_code === 408) { await sleep(300); continue; } // long-poll timeout = no updates
      if (!r.ok) {
        console.error("getUpdates error:", r.error_code, r.description);
        await sleep(backoff); backoff = Math.min(backoff * 2, 30000); continue;
      }
      backoff = 1000;
      const list: Update[] = Array.isArray(r.result)
        ? r.result
        : r.result && Object.keys(r.result).length ? [r.result] : [];
      if (!list.length) { await sleep(500); continue; }
      for (const u of list) {
        const m = u.message;
        if (!m) continue;
        appendFileSync("zalo-raw.log", JSON.stringify(u) + "\n");
        console.log("update:", u.event_name, m.message_id, JSON.stringify(m.text ?? ""));
        if (seen.has(m.message_id)) continue;
        seen.add(m.message_id);
        await prisma.botState.update({ where: { id: STATE_ID }, data: { lastUpdateId: m.message_id } });
        if (u.event_name !== "message.text.received" || !m.text) continue;
        try { await handle(m.chat.id, m.text); }
        catch (e) { console.error("handle error:", (e as Error).message); }
      }
      await sleep(300);
    } catch (e) {
      console.error("poll error:", (e as Error).message);
      await sleep(backoff); backoff = Math.min(backoff * 2, 30000);
    }
  }
}
main();
