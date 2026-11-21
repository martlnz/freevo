"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateClientAction } from "@/app/actions/clients";
import { ClientFormFields } from "./ClientFormFields";
import { ConfirmLinkActions, ConfirmationBadge } from "./ConfirmationBadge";
import { ErrorBanner } from "./ErrorBanner";
import { formatDateTime, type ClientView } from "./shared";

export function InfoTab({ client }: { client: ClientView }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const conf = client.latestConfirmation;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await updateClientAction(client.id, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Không thể lưu thông tin. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-[10px] border border-hairline bg-surface p-4 sm:p-6">
        <ClientFormFields
          idPrefix="info"
          extended
          defaults={{
            name: client.name,
            projectName: client.projectName,
            emails: client.emails.join(", "),
            phone: client.phone,
            zaloId: client.zaloId,
            budget: client.budget,
            note: client.note,
          }}
        />
        <ErrorBanner message={error} />
        {saved ? (
          <div
            role="status"
            className="rounded-[10px] border border-add/30 bg-add-tint px-3 py-2 text-sm font-medium text-add"
          >
            Đã lưu thông tin
          </div>
        ) : null}
        <div className="flex sm:justify-end">
          <Button type="submit" disabled={loading}>
            {loading ? "Đang lưu..." : "Lưu thông tin"}
          </Button>
        </div>
      </form>

      <div className="rounded-[10px] border border-hairline bg-surface p-4 sm:p-6">
        <h3 className="text-sm font-semibold text-ink">Xác nhận của khách (version mới nhất)</h3>
        {conf ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ConfirmationBadge status={conf.status} />
              {conf.mergedVersionNo !== null ? <span className="text-muted tabular">v{conf.mergedVersionNo}</span> : null}
              {conf.respondedAt ? (
                <span className="text-xs text-muted tabular">Phản hồi lúc {formatDateTime(conf.respondedAt)}</span>
              ) : null}
            </div>
            <p className="break-all font-mono text-xs text-muted">/c/{conf.token}</p>
            <div>
              <ConfirmLinkActions token={conf.token} />
            </div>
            {conf.note ? (
              <blockquote className="rounded-[10px] border border-hairline bg-ground p-3 text-sm text-ink">
                <span className="mb-1 block text-xs text-muted">Phản hồi của khách</span>
                <span className="whitespace-pre-wrap break-words">{conf.note}</span>
              </blockquote>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Chưa có link xác nhận. Link được tạo khi bạn merge một PR.</p>
        )}
      </div>
    </div>
  );
}
