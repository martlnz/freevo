import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { isMock } from "./llm";
import { addMessage } from "./messages";
import type { ReqSnapshot } from "./types";
import { extractFromScreenshot, saveUploadedImage } from "./vision";

const normStr = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
const normDigits = (s: string) => s.replace(/\D/g, "");

function parseEmailsSafe(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function findMatchingClientByContact(opts: {
  contact?: string | null;
  nameHint?: string | null;
}) {
  const contact = opts.contact?.trim() || "";
  const nameHint = opts.nameHint?.trim() || "";
  if (!contact && !nameHint) return null;

  const clients = await db.client.findMany({ orderBy: { createdAt: "asc" } });
  const cNorm = contact ? normStr(contact) : "";
  const cDigits = contact ? normDigits(contact) : "";
  const nNorm = nameHint ? normStr(nameHint) : "";

  if (cNorm) {
    const byEmail = clients.find((c) => parseEmailsSafe(c.emails).some((e) => normStr(e) === cNorm));
    if (byEmail) return byEmail;
  }
  if (cDigits.length >= 8) {
    const byPhone = clients.find((c) => c.phone && normDigits(c.phone) === cDigits);
    if (byPhone) return byPhone;
  }
  if (cNorm) {
    const byZalo = clients.find((c) => c.zaloId && normStr(c.zaloId) === cNorm);
    if (byZalo) return byZalo;
  }

  for (const probe of [nNorm, cNorm]) {
    if (!probe) continue;
    const exact = clients.find((c) => normStr(c.name) === probe);
    if (exact) return exact;
    const partial = clients.find((c) => {
      const cn = normStr(c.name);
      return cn.length >= 3 && (probe.includes(cn) || (probe.length >= 4 && cn.includes(probe)));
    });
    if (partial) return partial;
  }
  return null;
}

const STOPWORDS = new Set([
  "cho", "anh", "chị", "chi", "em", "của", "cua", "với", "voi", "nhé", "nhe", "nha",
  "được", "duoc", "không", "khong", "cần", "can", "làm", "lam", "thêm", "them", "sửa", "sua",
  "đổi", "doi", "bỏ", "mới", "moi", "bản", "ban", "trang", "giúp", "giup", "nhờ", "nho",
  "cảm", "cam", "ơn", "thôi", "thoi", "còn", "con", "này", "nay", "kia", "mà", "như", "nhu",
  "một", "mot", "hai", "phần", "phan", "mục", "muc", "gửi", "gui", "chào", "chao",
]);

function tokenize(text: string): string[] {
  return normStr(text)
    .split(/[^\p{L}\p{N}#]+/u)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export async function suggestClientForText(
  text: string,
  hintName?: string | null,
): Promise<{ clientId: string; clientName: string; reason: string } | null> {
  if (hintName) {
    const matched = await findMatchingClientByContact({ contact: hintName, nameHint: hintName });
    if (matched) {
      return {
        clientId: matched.id,
        clientName: matched.name,
        reason: `Khớp tên liên hệ “${hintName}”`,
      };
    }
  }

  const clients = await db.client.findMany({
    orderBy: { createdAt: "asc" },
    include: { versions: { orderBy: { number: "desc" }, take: 1 } },
  });
  if (clients.length === 0) return null;

  const msgNorm = normStr(text);
  const msgWords = new Set(tokenize(text));

  let best: { id: string; name: string; score: number; hits: string[] } | null = null;
  let secondScore = 0;

  for (const c of clients) {
    let score = 0;
    const hits: string[] = [];
    const nameN = normStr(c.name);
    if (nameN.length >= 3 && msgNorm.includes(nameN)) {
      score += 5;
      hits.push(c.name);
    }
    const corpusParts: string[] = [];
    if (c.projectName) corpusParts.push(c.projectName);
    if (c.versions[0]) {
      try {
        const snap = JSON.parse(c.versions[0].snapshot) as ReqSnapshot;
        for (const r of snap.requirements ?? []) {
          corpusParts.push(r.title, r.detail);
        }
      } catch {
        // ignore invalid json
      }
    }
    const clientWords = new Set(tokenize(corpusParts.join(" ")));
    for (const w of msgWords) {
      if (clientWords.has(w)) {
        score += 1;
        if (hits.length < 3) hits.push(w);
      }
    }
    if (!best || score > best.score) {
      secondScore = best ? best.score : 0;
      best = { id: c.id, name: c.name, score, hits };
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (best && best.score >= 2 && best.score > secondScore) {
    return {
      clientId: best.id,
      clientName: best.name,
      reason: `Nhắc tới ${best.hits.join(", ")}, khớp dự án của ${best.name}.`,
    };
  }

  if (clients.length >= 2 && !isMock() && process.env.ANTHROPIC_API_KEY) {
    try {
      const api = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const catalog = clients
        .map((c) => {
          let reqSummary = "";
          if (c.versions[0]) {
            try {
              const snap = JSON.parse(c.versions[0].snapshot) as ReqSnapshot;
              reqSummary = (snap.requirements ?? []).map((r) => `${r.title}: ${r.detail}`).join("; ");
            } catch {}
          }
          return `- id="${c.id}" | tên="${c.name}" | dự án="${c.projectName ?? ""}" | yêu cầu="${reqSummary}"`;
        })
        .join("\n");
      const resp = await api.messages.create({
        model: process.env.LLM_MODEL || "claude-haiku-5-5",
        max_tokens: 300,
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["clientId", "reason"],
              properties: {
                clientId: { anyOf: [{ type: "string" }, { type: "null" }] },
                reason: { type: "string" },
              },
            },
          },
        },
        messages: [
          {
            role: "user",
            content: `Dựa vào danh sách khách hàng:\n${catalog}\n\nTin nhắn chưa rõ người gửi: "${text}"${hintName ? ` (tên gợi ý: "${hintName}")` : ""}\nChọn clientId phù hợp nhất hoặc null nếu không đủ cơ sở. Trả reason ngắn gọn tiếng Việt.`,
          },
        ],
      });
      const raw = resp.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
      const parsed = JSON.parse(raw) as { clientId: string | null; reason: string };
      if (parsed.clientId) {
        const hit = clients.find((c) => c.id === parsed.clientId);
        if (hit) return { clientId: hit.id, clientName: hit.name, reason: parsed.reason };
      }
    } catch {
      // non-fatal fallback
    }
  }

  return best && best.score > 0
    ? {
        clientId: best.id,
        clientName: best.name,
        reason: `Nhắc tới ${best.hits.join(", ")}, có thể thuộc ${best.name}.`,
      }
    : null;
}

export async function ingestScreenshot(opts: {
  buffer: Buffer;
  mimeType: string;
  filenameHint?: string;
  clientId?: string | null;
  channelOverride?: "zalo" | "gmail" | "manual";
}) {
  const sourceImage = await saveUploadedImage(opts.buffer, opts.mimeType);
  const ext = await extractFromScreenshot(opts.buffer, opts.mimeType, opts.filenameHint);

  let targetClient: { id: string; name: string } | null = null;
  let matchedAutomatically = false;

  if (opts.clientId) {
    const explicit = await db.client.findUnique({ where: { id: opts.clientId }, select: { id: true, name: true } });
    if (!explicit) throw new Error("Không tìm thấy khách hàng.");
    targetClient = explicit;
  } else {
    const matched = await findMatchingClientByContact({
      contact: ext.detectedContactInfo,
      nameHint: ext.detectedContactName,
    });
    if (matched) {
      targetClient = { id: matched.id, name: matched.name };
      matchedAutomatically = true;
    }
  }

  const allText = ext.messages.map((m) => m.text).join("\n");
  const suggestion = targetClient ? null : await suggestClientForText(allText, ext.detectedContactName);
  const contact = ext.detectedContactInfo ?? ext.detectedContactName ?? null;
  const channel = opts.channelOverride ?? ext.channel;
  const baseTime = Date.now();

  for (let i = 0; i < ext.messages.length; i++) {
    const m = ext.messages[i];
    await addMessage({
      clientId: targetClient?.id ?? null,
      channel,
      sender: m.sender,
      text: m.text,
      contact,
      sourceImage,
      suggestedClientId: suggestion?.clientId ?? null,
      suggestedReason: suggestion?.reason ?? null,
      sentAt: new Date(baseTime + i * 1000),
    });
  }

  if (targetClient && ext.detectedBudget && ext.detectedBudget > 0) {
    await db.client.update({
      where: { id: targetClient.id },
      data: { budget: Math.round(ext.detectedBudget) },
    });
  }

  return {
    clientId: targetClient?.id ?? null,
    clientName: targetClient?.name ?? null,
    matchedAutomatically,
    suggestedClientId: suggestion?.clientId ?? null,
    suggestedClientName: suggestion?.clientName ?? null,
    suggestedReason: suggestion?.reason ?? null,
    sourceImage,
    extractedCount: ext.messages.length,
    detectedContactName: ext.detectedContactName,
    detectedContactInfo: ext.detectedContactInfo,
    detectedBudget: ext.detectedBudget,
  };
}
