import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { db } from "./db";
import { addMessage } from "./messages";
import { findMatchingClientByContact, suggestClientForText } from "./routing";

const GMAIL_STATE_ID = "gmail";
const LOOKBACK_DAYS = 7;
const MAX_FETCH_PER_SYNC = 30;
const MAX_SEEN_UIDS = 300;

export type GmailSyncResult = {
  importedCount: number;
  matchedCount: number;
  unassignedCount: number;
  matchedClientIds: string[];
  userEmail: string;
  syncTag: string;
};

type GmailCursor = {
  uidValidity?: number;
  seenUids?: number[];
};

function readDotEnvMap(): Record<string, string> {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};
  const map: Record<string, string> = {};
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return map;
}

function readEnvValue(key: string, dotEnv: Record<string, string>): string {
  const fromFile = dotEnv[key]?.trim();
  if (fromFile) return fromFile;
  return process.env[key]?.trim() ?? "";
}

export function readGmailConfig() {
  const dotEnv = readDotEnvMap();
  const user = normalizeEmail(readEnvValue("GMAIL_USER", dotEnv));
  const pass = readEnvValue("GMAIL_APP_PASSWORD", dotEnv).replace(/\s+/g, "");
  const syncTag = readEnvValue("GMAIL_SYNC_TAG", dotEnv) || "[Freevo]";

  if (!user || !pass) {
    throw new Error("Chưa cấu hình GMAIL_USER hoặc GMAIL_APP_PASSWORD trong tệp .env.");
  }
  return { user, pass, syncTag };
}

export function normalizeEmail(addr: string): string {
  return addr.trim().toLowerCase();
}

export function stripPlusTag(email: string): { base: string; tag: string | null } {
  const clean = normalizeEmail(email);
  const at = clean.indexOf("@");
  if (at <= 0) return { base: clean, tag: null };
  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus < 0) return { base: clean, tag: null };
  const tag = local.slice(plus + 1).trim();
  return { base: `${local.slice(0, plus)}@${domain}`, tag: tag || null };
}

export function stripQuotedReply(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const kept: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const next1 = lines[i + 1]?.trim() ?? "";
    const next2 = lines[i + 2]?.trim() ?? "";

    if (/^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}$/i.test(trimmed)) break;
    if (/^(On|Vào)\s+.+(wrote|đã viết):\s*$/i.test(trimmed)) break;
    if (/^(On|Vào)\s+.+/i.test(trimmed) && (/(wrote|đã viết):\s*$/i.test(next1) || /(wrote|đã viết):\s*$/i.test(next2))) {
      break;
    }
    if (/^_{5,}$/.test(trimmed)) break;

    kept.push(line);
  }

  while (kept.length > 0 && (kept[kept.length - 1].trim() === "" || kept[kept.length - 1].trim().startsWith(">"))) {
    kept.pop();
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function resolveEmailRoutingMeta(opts: {
  myEmail: string;
  fromEmail: string;
  fromName?: string | null;
  toEmails: string[];
  subject: string;
  knownClientEmails: Set<string>;
  syncTag: string;
}) {
  const myBase = stripPlusTag(opts.myEmail).base;
  const fromClean = normalizeEmail(opts.fromEmail);
  const fromBase = stripPlusTag(fromClean).base;
  const isSelfSent = Boolean(myBase) && fromBase === myBase;

  let plusAliasEmail: string | null = null;
  for (const rawTo of opts.toEmails) {
    const toClean = normalizeEmail(rawTo);
    const parsed = stripPlusTag(toClean);
    if (parsed.base === myBase && parsed.tag) {
      plusAliasEmail = toClean;
      break;
    }
  }

  const tagLower = opts.syncTag.trim().toLowerCase();
  const hasTag = Boolean(tagLower) && opts.subject.toLowerCase().includes(tagLower);

  const contact = isSelfSent && plusAliasEmail ? plusAliasEmail : fromClean;
  const isKnownClient = Boolean(contact) && opts.knownClientEmails.has(contact);
  const shouldImport = Boolean(plusAliasEmail) || hasTag || isKnownClient;

  return { shouldImport, contact, sender: "client" as const };
}

function collectAddressEmails(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) return [];
  const items = Array.isArray(field) ? field : [field];
  const emails: string[] = [];
  for (const item of items) {
    for (const addr of item.value ?? []) {
      if (addr.address) emails.push(normalizeEmail(addr.address));
    }
  }
  return emails;
}

function collectHeaderEmails(headerVal: unknown): string[] {
  if (!headerVal) return [];
  if (typeof headerVal === "string") {
    return (headerVal.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []).map(normalizeEmail);
  }
  if (Array.isArray(headerVal)) {
    return headerVal.flatMap((v) => collectHeaderEmails(v));
  }
  if (typeof headerVal === "object" && headerVal !== null && "value" in headerVal) {
    return collectAddressEmails(headerVal as AddressObject);
  }
  return [];
}

function collectRecipientEmails(parsed: ParsedMail): string[] {
  const all = new Set<string>([
    ...collectAddressEmails(parsed.to),
    ...collectAddressEmails(parsed.cc),
    ...collectHeaderEmails(parsed.headers.get("delivered-to")),
    ...collectHeaderEmails(parsed.headers.get("x-original-to")),
  ]);
  return [...all];
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatEmailMessageText(subject: string, rawBody: string, syncTag: string): string {
  const body = stripQuotedReply(rawBody);
  const tagRe = syncTag.trim() ? new RegExp(escapeRegExp(syncTag.trim()), "gi") : null;
  let cleanSubject = tagRe ? subject.replace(tagRe, "") : subject;
  cleanSubject = cleanSubject.replace(/\s+/g, " ").trim();

  const trivialSubject = !cleanSubject || /^(re|fwd|fw)\s*:\s*$/i.test(cleanSubject);
  if (!body) return cleanSubject || "(Email trống)";
  if (trivialSubject) return body;
  return `[${cleanSubject}]\n${body}`;
}

async function loadKnownClientEmails(): Promise<{ emails: Set<string>; hasClients: boolean }> {
  const clients = await db.client.findMany({ select: { emails: true } });
  const emails = new Set<string>();
  for (const c of clients) {
    try {
      const parsed = JSON.parse(c.emails);
      if (Array.isArray(parsed)) {
        for (const e of parsed) {
          const clean = normalizeEmail(String(e));
          if (clean) emails.add(clean);
        }
      }
    } catch {
      // ignore invalid json
    }
  }
  return { emails, hasClients: clients.length > 0 };
}

async function loadGmailCursor(): Promise<GmailCursor> {
  const row = await db.botState.findUnique({ where: { id: GMAIL_STATE_ID } });
  if (!row?.lastUpdateId) return {};
  try {
    return JSON.parse(row.lastUpdateId) as GmailCursor;
  } catch {
    return {};
  }
}

async function saveGmailCursor(cursor: GmailCursor) {
  const compact: GmailCursor = {
    uidValidity: cursor.uidValidity,
    seenUids: (cursor.seenUids ?? []).slice(-MAX_SEEN_UIDS),
  };
  await db.botState.upsert({
    where: { id: GMAIL_STATE_ID },
    update: { lastUpdateId: JSON.stringify(compact), updatedAt: new Date() },
    create: { id: GMAIL_STATE_ID, lastUpdateId: JSON.stringify(compact) },
  });
}

function formatImapError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const responseText =
    typeof err === "object" && err !== null && "responseText" in err ? String((err as { responseText?: unknown }).responseText ?? "") : "";
  const combined = `${msg} ${responseText}`;
  if (/AUTHENTICATIONFAILED|Invalid credentials|Application-specific password|WebLoginRequired/i.test(combined)) {
    return new Error(
      "Đăng nhập Gmail thất bại. Kiểm tra lại GMAIL_USER và Mật khẩu ứng dụng (App Password 16 ký tự) trong .env.",
    );
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ECONNRESET|socket/i.test(combined)) {
    return new Error("Không thể kết nối tới imap.gmail.com:993. Vui lòng kiểm tra kết nối mạng.");
  }
  return err instanceof Error ? err : new Error(msg);
}

export async function syncGmailInbox(): Promise<GmailSyncResult> {
  const { user, pass, syncTag } = readGmailConfig();
  const [{ emails: knownClientEmails, hasClients }, cursor] = await Promise.all([
    loadKnownClientEmails(),
    loadGmailCursor(),
  ]);

  const rawFetched: Array<{ uid: number; source: Buffer; sentAt: Date }> = [];
  let currentUidValidity = cursor.uidValidity;
  let seenSet = new Set<number>(cursor.seenUids ?? []);

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const mb = client.mailbox;
      const uidValidity = typeof mb === "object" && mb !== null ? Number(mb.uidValidity ?? 0) : 0;
      if (uidValidity && currentUidValidity && uidValidity !== currentUidValidity) {
        seenSet = new Set<number>();
      }
      currentUidValidity = uidValidity || currentUidValidity;

      const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000);
      const found = await client.search({ since }, { uid: true });
      const uids = Array.isArray(found) ? found : [];
      const targetUids = uids.filter((uid) => !seenSet.has(uid)).slice(-MAX_FETCH_PER_SYNC);

      if (targetUids.length > 0) {
        for await (const msg of client.fetch(
          targetUids.join(","),
          { uid: true, source: true, internalDate: true },
          { uid: true },
        )) {
          if (!msg.source) continue;
          const sentAt =
            msg.internalDate instanceof Date
              ? msg.internalDate
              : msg.internalDate
                ? new Date(msg.internalDate)
                : new Date();
          rawFetched.push({ uid: msg.uid, source: msg.source, sentAt });
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    throw formatImapError(err);
  } finally {
    await client.logout().catch(() => {});
  }

  let importedCount = 0;
  let matchedCount = 0;
  let unassignedCount = 0;
  const matchedClientIds = new Set<string>();
  const nextSeenUids = [...seenSet];

  for (const item of rawFetched) {
    const parsed = await simpleParser(item.source);
    const fromAddr = parsed.from?.value?.[0];
    const fromEmail = fromAddr?.address ? normalizeEmail(fromAddr.address) : "";
    if (!fromEmail) continue;

    const toEmails = collectRecipientEmails(parsed);
    const subject = parsed.subject ?? "";
    const meta = resolveEmailRoutingMeta({
      myEmail: user,
      fromEmail,
      fromName: fromAddr?.name ?? null,
      toEmails,
      subject,
      knownClientEmails,
      syncTag,
    });

    if (!meta.shouldImport) continue;

    const rawBody = parsed.text?.trim() ? parsed.text : parsed.html ? htmlToText(parsed.html) : "";
    const text = formatEmailMessageText(subject, rawBody, syncTag);
    const sentAt = parsed.date ?? item.sentAt;

    const matched = await findMatchingClientByContact({ contact: meta.contact });
    if (matched) {
      await addMessage({
        clientId: matched.id,
        channel: "gmail",
        sender: meta.sender,
        contact: meta.contact,
        text,
        sentAt,
      });
      matchedCount++;
      matchedClientIds.add(matched.id);
    } else {
      const suggestion = hasClients ? await suggestClientForText(text) : null;
      await addMessage({
        clientId: null,
        channel: "gmail",
        sender: meta.sender,
        contact: meta.contact,
        text,
        suggestedClientId: suggestion?.clientId ?? null,
        suggestedReason: suggestion?.reason ?? null,
        sentAt,
      });
      unassignedCount++;
    }

    importedCount++;
    if (!seenSet.has(item.uid)) {
      seenSet.add(item.uid);
      nextSeenUids.push(item.uid);
    }
  }

  await saveGmailCursor({
    uidValidity: currentUidValidity,
    seenUids: nextSeenUids,
  });

  return {
    importedCount,
    matchedCount,
    unassignedCount,
    matchedClientIds: [...matchedClientIds],
    userEmail: user,
    syncTag,
  };
}
