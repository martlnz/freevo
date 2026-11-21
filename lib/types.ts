export type Requirement = { id: string; title: string; detail?: string; effortHours: number };
export type Snapshot = Requirement[];
export type ChangeKind = "add" | "modify" | "remove";
export type Change = {
  id: string; kind: ChangeKind; reqId?: string; title: string; detail?: string;
  effortHours: number; evidence: string[]; accepted: boolean;
};
export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
