"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPRAction } from "@/app/actions/pr";
import { ErrorBanner } from "./ErrorBanner";

export function CreatePRButton({ clientId, disabled }: { clientId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await createPRAction(clientId);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      startTransition(() => router.push("/pr/" + res.data.id));
    } catch {
      setError("Không thể tổng hợp phiên. Vui lòng thử lại.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={run} disabled={loading || disabled}>
        <Sparkles />
        {loading ? "Đang AI tổng hợp..." : "Tổng hợp phiên"}
      </Button>
      <ErrorBanner message={error} />
    </div>
  );
}
