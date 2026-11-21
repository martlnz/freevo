export type Requirement = { id: string; title: string; detail?: string; effortHours: number };
export type Snapshot = Requirement[];
export type ChangeKind = "add" | "modify" | "remove";
export type Change = {
  id: string; kind: ChangeKind; reqId?: string; title: string; detail?: string;
  effortHours: number; evidence: string[]; accepted: boolean;
};
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ---- Backend domain types (HACKATHON_PLAN section 5 + budget & vision) ----
export type Req = {
  id: string; // "REQ-001", fixed
  title: string;
  detail: string;
  status: "agreed" | "pending";
};
export type ReqSnapshot = { requirements: Req[] };
export type PRChange = {
  op: "add" | "modify" | "remove";
  reqId?: string;
  title?: string;
  detail?: string;
  status?: "agreed" | "pending";
  before?: string;
  reason: string;
  evidence: string[]; // real Message.id
  accepted: boolean;
  selectedEvidence: string[];
};
export type Role = "client" | "freelancer";
export type LlmProposal = {
  summary: string;
  effort_delta: number;
  detected_budget?: number | null;
  message_roles: { ref: string; role: Role }[];
  changes: {
    op: "add" | "modify" | "remove";
    req_id?: string;
    title?: string;
    detail?: string;
    status?: "agreed" | "pending";
    reason: string;
    evidence_refs: string[];
  }[];
};
export type Pricing = {
  budget: number | null;
  netBudget: number | null;
  overBudget: boolean;
  unitPrice: number;
  currentEffort: number;
  proposedEffort: number;
  suggestedPrice: number;
  netSuggested: number;
  taxRate: number;
  priceForNet: (desiredNet: number) => number;
};
export type SerializablePricing = Omit<Pricing, "priceForNet">;

export type ExtractedChatMessage = {
  sender: "client" | "freelancer" | "unknown";
  text: string;
  timeHint?: string | null;
};

export type ScreenshotExtraction = {
  channel: "zalo" | "gmail" | "manual";
  detectedContactName: string | null;
  detectedContactInfo: string | null;
  detectedBudget: number | null;
  messages: ExtractedChatMessage[];
};
