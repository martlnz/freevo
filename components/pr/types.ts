import type { PRChange } from "@/lib/types";

export type PRStatus = "open" | "merged" | "rejected";

export type SerializedMessage = {
  id: string;
  channel: string;
  sender: string;
  text: string;
  sentAt: string;
};

export type SerializedConfirmation = {
  token: string;
  status: string;
  respondedAt: string | null;
};

export type SerializedPR = {
  id: string;
  clientId: string;
  status: PRStatus;
  changes: PRChange[];
  summary: string;
  effortDelta: number;
  baseVersionNo: number | null;
  mergedVersionNo: number | null;
  createdAt: string;
  mergedAt: string | null;
  confirmation: SerializedConfirmation | null;
  messages: SerializedMessage[];
};

export type SerializedClient = {
  id: string;
  name: string;
};
