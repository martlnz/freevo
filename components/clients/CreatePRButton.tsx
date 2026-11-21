"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createPRAction } from "@/app/actions/pr";

export function CreatePRButton({ clientId, disabled }: { clientId: string; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function go() {
    setError(null);
    start(async () => {
      const r = await createPRAction(clientId);
      if (!r.ok) return setError(r.error);
      router.push(`/pr/${r.data.id}`);
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button onClick={go} disabled={disabled || pending} aria-busy={pending} className="font-semibold">
        {pending ? "Đang phân tích tin nhắn..." : "Tạo PR từ tin nhắn mới"}
      </Button>
      {pending && <p className="text-sm text-muted" role="status">AI đang đọc tin nhắn, có thể mất vài giây.</p>}
      {error && <p role="alert" className="max-w-sm text-sm font-medium text-remove sm:text-right">{error}</p>}
    </div>
  );
}
