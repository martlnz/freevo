"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type SyncResponse =
  | {
      ok: true;
      data: {
        importedCount: number;
        matchedCount: number;
        unassignedCount: number;
        userEmail: string;
        syncTag: string;
      };
    }
  | { ok: false; error: string };

export function SyncGmailButton({ variant = "outline" }: { variant?: "outline" | "default" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSync() {
    if (loading) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/gmail/sync", { method: "POST" });
      const json = (await res.json()) as SyncResponse;
      if (!res.ok || !json.ok) {
        setStatus({
          kind: "err",
          text: !json.ok ? json.error : "Không thể đồng bộ Gmail.",
        });
        return;
      }
      const d = json.data;
      if (d.importedCount === 0) {
        setStatus({
          kind: "ok",
          text: "Chưa có email mới nào từ khách hàng.",
        });
      } else {
        const parts: string[] = [];
        if (d.matchedCount > 0) parts.push(`${d.matchedCount} tin vào thẳng khách`);
        if (d.unassignedCount > 0) parts.push(`${d.unassignedCount} tin vào Hộp tin chưa phân loại`);
        setStatus({
          kind: "ok",
          text: `Đã đồng bộ ${d.importedCount} email (${parts.join(", ")}).`,
        });
      }
      router.refresh();
    } catch {
      setStatus({ kind: "err", text: "Không thể kết nối máy chủ để đồng bộ Gmail." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5 sm:items-end">
      <Button type="button" variant={variant} onClick={() => void onSync()} disabled={loading}>
        {loading ? <RefreshCw className="size-4 animate-spin" /> : <Mail className="size-4" />}
        {loading ? "Đang đồng bộ..." : "Đồng bộ Gmail"}
      </Button>
      {status ? (
        <p
          role={status.kind === "err" ? "alert" : "status"}
          className={`max-w-md text-xs font-medium ${status.kind === "err" ? "text-remove" : "text-add"}`}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}
