import type { Req } from "@/lib/types";

export type ConfirmationStatus = "pending" | "confirmed" | "declined";

export type MessageView = {
  id: string;
  channel: string;
  sender: string;
  text: string;
  sentAt: string;
  prId: string | null;
};

export type VersionView = {
  id: string;
  number: number;
  note: string | null;
  prId: string | null;
  createdAt: string;
  requirements: Req[];
};

export type PrView = {
  id: string;
  status: string;
  summary: string;
  effortDelta: number;
  changeCount: number;
  mergedVersionNo: number | null;
  createdAt: string;
  mergedAt: string | null;
  confirmation: { token: string; status: string } | null;
};

export type ConfirmationView = {
  prId: string;
  mergedVersionNo: number | null;
  token: string;
  status: string;
  note: string | null;
  respondedAt: string | null;
};

export type ClientView = {
  id: string;
  name: string;
  projectName: string | null;
  phone: string | null;
  emails: string[];
  zaloId: string | null;
  note: string | null;
  contractPrice: number;
  baseEffort: number;
  pendingCount: number;
  latestVersionNo: number;
  requirements: Req[];
  versions: VersionView[];
  prs: PrView[];
  latestConfirmation: ConfirmationView | null;
};

export function confirmationLabel(status: string | null | undefined): string {
  if (status === "confirmed") return "Khách đã đồng ý";
  if (status === "declined") return "Khách cần sửa";
  return "Chờ khách xác nhận";
}

export function confirmationClass(status: string | null | undefined): string {
  if (status === "confirmed") return "bg-add-tint text-add";
  if (status === "declined") return "bg-remove-tint text-remove";
  return "bg-modify-tint text-modify";
}

export function channelLabel(channel: string): string {
  if (channel === "zalo") return "Zalo";
  if (channel === "gmail") return "Gmail";
  return "Thủ công";
}

export function senderLabel(sender: string): string {
  if (sender === "client") return "Khách";
  if (sender === "freelancer") return "Freelancer";
  return "Chưa rõ";
}

export function reqStatusLabel(status: string): string {
  return status === "agreed" ? "Đã chốt" : "Đang bàn";
}

export function reqStatusClass(status: string): string {
  return status === "agreed" ? "bg-add-tint text-add" : "bg-modify-tint text-modify";
}

export function prStatusLabel(status: string, mergedVersionNo: number | null): string {
  if (status === "merged") return `Đã merge v${mergedVersionNo ?? "?"}`;
  if (status === "rejected") return "Đã từ chối";
  return "Đang duyệt";
}

export function prStatusClass(status: string): string {
  if (status === "merged") return "bg-add-tint text-add";
  if (status === "rejected") return "bg-remove-tint text-remove";
  return "bg-modify-tint text-modify";
}

/** Deterministic date formatting (UTC+7) so server and client render identical text. */
export function formatDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export const badgeBase =
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap";
