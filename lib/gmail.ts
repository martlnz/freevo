import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { db } from "./db";
import { addMessage } from "./messages";
import { findMatchingClientByContact, suggestClientForText } from "./routing";

const GMAIL_STATE_ID = "gmail";
const DEFAULT_LOOKBACK_MS = 24 * 3600_000;
const IMAP_SINCE_BUFFER_MS = 86400_000;
const MAX_FETCH_INBOX = 30;
const MAX_FETCH_SENT = 20;
const MAX_SEEN_UIDS = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTOMATED_LOCAL_RE =
  /^(no[-_.]?reply|donotreply|do[-_.]?not[-_.]?reply|mailer-daemon|postmaster|bounce|notifications?|notify|alert|security|news(letter)?|marketing|promo|updates?|billing)$/i;
const AUTOMATED_DOMAIN_RE =
  /^(accounts\.google\.com|google\.com|facebookmail\.com|shopee\.vn|lazada\.vn|tiktok\.com|github\.com|linkedin\.com)$/i;

export type GmailSyncResult = {
  importedCount: number;
  matchedCount: number;
  unassignedCount: number;
  matchedClientIds: string[];
  userEmail: string;
  syncTag: string;
};

type GmailCursor = {
  syncedAfter?: string;
  uidValidity?: number;
  seenUids?: number[];
  sentUidValidity?: number;
  seenSentUids?: number[];
};

type RawFetchedMessage = {
  uid: number;
  source: Buffer;
  sentAt: Date;
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

export function isAutomatedEmail(opts: {
  fromEmail: string;
  headers?: {
    listUnsubscribe?: unknown;
    listId?: unknown;
    autoSubmitted?: unknown;
    precedence?: unknown;
  };
}): boolean {
  const clean = normalizeEmail(opts.fromEmail);
  const at = clean.indexOf("@");
  if (at > 0) {
    const local = clean.slice(0, at);
    const domain = clean.slice(at + 1);
    if (AUTOMATED_LOCAL_RE.test(local) || AUTOMATED_DOMAIN_RE.test(domain)) {
      return true;
    }
  }

  const h = opts.headers;
  if (!h) return false;
  if (h.listUnsubscribe || h.listId) return true;

  const autoSub = typeof h.autoSubmitted === "string" ? h.autoSubmitted.trim().toLowerCase() : "";
  if (autoSub && autoSub !== "no") return true;

  const prec = typeof h.precedence === "string" ? h.precedence.trim() : "";
  if (prec && /bulk|list|junk/i.test(prec)) return true;

  return false;
}

export function resolveEmailRoutingMeta(opts: {
  myEmail: string;
  fromEmail: string;
  fromName?: string | null;
  toEmails: string[];
  subject: string;
  knownClientEmails: Set<string>;
  syncTag: string;
  isAutomated?: boolean;
}) {
  const myBase = stripPlusTag(opts.myEmail).base;
  const fromClean = normalizeEmail(opts.fromEmail);
  const fromBase = stripPlusTag(fromClean).base;
  const isSelfSent = Boolean(myBase) && fromBase === myBase;

  if (!isSelfSent) {
    const isKnownClient = Boolean(fromClean) && opts.knownClientEmails.has(fromClean);
    const shouldImport = isKnownClient || !opts.isAutomated;
    return { shouldImport, contact: fromClean, sender: "client" as const };
  }

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

  if (plusAliasEmail) {
    return { shouldImport: true, contact: plusAliasEmail, sender: "client" as const };
  }
  if (hasTag) {
    return { shouldImport: true, contact: fromClean, sender: "client" as const };
  }
  return { shouldImport: false, contact: fromClean, sender: "client" as const };
}

export function resolveSentEmailMeta(opts: {
  myEmail: string;
  toEmails: string[];
  trackedClientEmails: Set<string>;
}) {
  const myBase = stripPlusTag(opts.myEmail).base;
  for (const rawTo of opts.toEmails) {
    const clean = normalizeEmail(rawTo);
    if (!clean) continue;
    if (stripPlusTag(clean).base === myBase) continue;
    if (opts.trackedClientEmails.has(clean)) {
      return { shouldImport: true, contact: clean, sender: "freelancer" as const };
    }
  }
  return { shouldImport: false, contact: "", sender: "freelancer" as const };
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

async function loadUnassignedEmailContacts(): Promise<Set<string>> {
  const rows = await db.message.findMany({
    where: { clientId: null, contact: { not: null } },
    select: { contact: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    if (r.contact && EMAIL_RE.test(r.contact.trim())) {
      set.add(normalizeEmail(r.contact));
    }
  }
  return set;
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
    syncedAfter: cursor.syncedAfter,
    uidValidity: cursor.uidValidity,
    seenUids: (cursor.seenUids ?? []).slice(-MAX_SEEN_UIDS),
    sentUidValidity: cursor.sentUidValidity,
    seenSentUids: (cursor.seenSentUids ?? []).slice(-MAX_SEEN_UIDS),
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

async function fetchMailboxRecent(
  client: ImapFlow,
  mailboxPath: string,
  sinceDate: Date,
  prevUidValidity: number | undefined,
  prevSeen: Set<number>,
  maxFetch: number,
): Promise<{ uidValidity: number | undefined; seenSet: Set<number>; fetched: RawFetchedMessage[] }> {
  const fetched: RawFetchedMessage[] = [];
  let uidValidity = prevUidValidity;
  let seenSet = new Set<number>(prevSeen);

  const lock = await client.getMailboxLock(mailboxPath);
  try {
    const mb = client.mailbox;
    const currentValidity = typeof mb === "object" && mb !== null ? Number(mb.uidValidity ?? 0) : 0;
    if (currentValidity && prevUidValidity && currentValidity !== prevUidValidity) {
      seenSet = new Set<number>();
    }
    uidValidity = currentValidity || prevUidValidity;

    const found = await client.search({ since: sinceDate }, { uid: true });
    const uids = Array.isArray(found) ? found : [];
    const targetUids = uids.filter((uid) => !seenSet.has(uid)).slice(-maxFetch);

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
        fetched.push({ uid: msg.uid, source: msg.source, sentAt });
      }
    }
  } finally {
    lock.release();
  }

  return { uidValidity, seenSet, fetched };
}

async function findSentMailboxPath(client: ImapFlow): Promise<string> {
  try {
    const boxes = await client.list();
    const special = boxes.find((b) => b.specialUse === "\\Sent");
    if (special) return special.path;
  } catch {
    // fall back to Gmail default path
  }
  return "[Gmail]/Sent Mail";
}

export async function syncGmailInbox(): Promise<GmailSyncResult> {
  const { user, pass, syncTag } = readGmailConfig();
  const [{ emails: knownClientEmails, hasClients }, unassignedContacts, cursor] = await Promise.all([
    loadKnownClientEmails(),
    loadUnassignedEmailContacts(),
    loadGmailCursor(),
  ]);

  const syncedAfterMs = cursor.syncedAfter ? new Date(cursor.syncedAfter).getTime() : Date.now() - DEFAULT_LOOKBACK_MS;
  const searchSince = new Date(syncedAfterMs - IMAP_SINCE_BUFFER_MS);

  let inboxRes = {
    uidValidity: cursor.uidValidity,
    seenSet: new Set<number>(cursor.seenUids ?? []),
    fetched: [] as RawFetchedMessage[],
  };
  let sentRes = {
    uidValidity: cursor.sentUidValidity,
    seenSet: new Set<number>(cursor.seenSentUids ?? []),
    fetched: [] as RawFetchedMessage[],
  };

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
    inboxRes = await fetchMailboxRecent(
      client,
      "INBOX",
      searchSince,
      cursor.uidValidity,
      new Set<number>(cursor.seenUids ?? []),
      MAX_FETCH_INBOX,
    );

    try {
      const sentPath = await findSentMailboxPath(client);
      sentRes = await fetchMailboxRecent(
        client,
        sentPath,
        searchSince,
        cursor.sentUidValidity,
        new Set<number>(cursor.seenSentUids ?? []),
        MAX_FETCH_SENT,
      );
    } catch {
      // Sent Mail sync is best-effort; INBOX remains intact
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
  const newlyImportedContacts = new Set<string>();
  const nextSeenUids = [...inboxRes.seenSet];
  const nextSeenSentUids = [...sentRes.seenSet];

  for (const item of inboxRes.fetched) {
    const parsed = await simpleParser(item.source);
    const sentAt = parsed.date ?? item.sentAt;
    if (sentAt.getTime() < syncedAfterMs) continue;

    const fromAddr = parsed.from?.value?.[0];
    const fromEmail = fromAddr?.address ? normalizeEmail(fromAddr.address) : "";
    if (!fromEmail) continue;

    const toEmails = collectRecipientEmails(parsed);
    const subject = parsed.subject ?? "";
    const automated = isAutomatedEmail({
      fromEmail,
      headers: {
        listUnsubscribe: parsed.headers.get("list-unsubscribe"),
        listId: parsed.headers.get("list-id"),
        autoSubmitted: parsed.headers.get("auto-submitted"),
        precedence: parsed.headers.get("precedence"),
      },
    });
    const meta = resolveEmailRoutingMeta({
      myEmail: user,
      fromEmail,
      fromName: fromAddr?.name ?? null,
      toEmails,
      subject,
      knownClientEmails,
      syncTag,
      isAutomated: automated,
    });

    if (!meta.shouldImport) continue;

    const rawBody = parsed.text?.trim() ? parsed.text : parsed.html ? htmlToText(parsed.html) : "";
    const text = formatEmailMessageText(subject, rawBody, syncTag);

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

    newlyImportedContacts.add(meta.contact);
    importedCount++;
    if (!inboxRes.seenSet.has(item.uid)) {
      inboxRes.seenSet.add(item.uid);
      nextSeenUids.push(item.uid);
    }
  }

  const trackedClientEmails = new Set<string>([
    ...knownClientEmails,
    ...unassignedContacts,
    ...newlyImportedContacts,
  ]);

  for (const item of sentRes.fetched) {
    const parsed = await simpleParser(item.source);
    const sentAt = parsed.date ?? item.sentAt;
    if (sentAt.getTime() < syncedAfterMs) continue;

    const toEmails = collectRecipientEmails(parsed);
    const meta = resolveSentEmailMeta({
      myEmail: user,
      toEmails,
      trackedClientEmails,
    });
    if (!meta.shouldImport) continue;

    const subject = parsed.subject ?? "";
    const rawBody = parsed.text?.trim() ? parsed.text : parsed.html ? htmlToText(parsed.html) : "";
    const text = formatEmailMessageText(subject, rawBody, syncTag);

    const matched = await findMatchingClientByContact({ contact: meta.contact });
    await addMessage({
      clientId: matched?.id ?? null,
      channel: "gmail",
      sender: meta.sender,
      contact: meta.contact,
      text,
      sentAt,
    });

    if (matched) {
      matchedCount++;
      matchedClientIds.add(matched.id);
    } else {
      unassignedCount++;
    }

    importedCount++;
    if (!sentRes.seenSet.has(item.uid)) {
      sentRes.seenSet.add(item.uid);
      nextSeenSentUids.push(item.uid);
    }
  }

  await saveGmailCursor({
    syncedAfter: cursor.syncedAfter ?? new Date(syncedAfterMs).toISOString(),
    uidValidity: inboxRes.uidValidity,
    seenUids: nextSeenUids,
    sentUidValidity: sentRes.uidValidity,
    seenSentUids: nextSeenSentUids,
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
