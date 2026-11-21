"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClientAction } from "@/app/actions/clients";
import { ClientFormFields } from "./ClientFormFields";
import { ErrorBanner } from "./ErrorBanner";

export function NewClientForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const res = await createClientAction(formData);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      router.push("/clients/" + res.data.id);
    } catch {
      setError("Không thể tạo khách hàng. Vui lòng thử lại.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-[10px] border border-hairline bg-surface p-4 sm:p-6">
      <ClientFormFields idPrefix="new" />
      <ErrorBanner message={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.push("/")} disabled={loading}>
          Hủy
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Đang tạo..." : "Tạo khách hàng"}
        </Button>
      </div>
    </form>
  );
}
