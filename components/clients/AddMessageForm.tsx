"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addManualMessageAction } from "@/app/actions/clients";

export function AddMessageForm({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await addManualMessageAction(clientId, fd);
      if (!r.ok) return setError(r.error);
      ref.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={ref} onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
      <h3 className="text-base font-semibold">Thêm tin nhắn thủ công</h3>
      <p className="text-sm text-muted">Dán tin nhắn từ nơi khác (điện thoại, cuộc gọi, ghi chú) để đưa vào đề xuất.</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Người gửi
        <select name="sender" defaultValue="client" className="h-11 rounded-[10px] border border-hairline bg-surface px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <option value="client">{clientName}</option>
          <option value="freelancer">Bạn</option>
        </select>
      </label>
      <Textarea name="text" required rows={3} placeholder="Nội dung tin nhắn" className="min-h-24 rounded-[10px] bg-surface px-3 py-2.5 text-base" />
      {error && <p role="alert" className="text-sm font-medium text-remove">{error}</p>}
      <div>
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "Đang thêm..." : "Thêm tin nhắn"}</Button>
      </div>
    </form>
  );
}
