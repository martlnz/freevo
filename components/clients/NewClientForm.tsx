"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClientAction } from "@/app/actions/clients";
import { createPRAction } from "@/app/actions/pr";
import { ClientFormFields, type ClientFormDefaults } from "./ClientFormFields";
import { ErrorBanner } from "./ErrorBanner";

function imageFromClipboard(e: ClipboardEvent | React.ClipboardEvent): File | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

export function NewClientForm({ defaults = {} }: { defaults?: ClientFormDefaults }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const pick = useCallback((f: File | null) => {
    if (f && !f.type.startsWith("image/")) {
      setError("Chỉ hỗ trợ tệp ảnh (PNG, JPG, WEBP...).");
      return;
    }
    setError(null);
    setFile(f);
  }, []);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const f = imageFromClipboard(e);
      if (f) {
        e.preventDefault();
        pick(f);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pick]);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    pick(e.target.files?.[0] ?? null);
    e.target.value = "";
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    setStage("Đang tạo khách hàng...");
    try {
      const res = await createClientAction(formData);
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        setStage(null);
        return;
      }
      const { id, initialPrId } = res.data;

      if (file) {
        setStage("AI đang đọc ảnh chụp màn hình...");
        const body = new FormData();
        body.append("file", file);
        body.append("clientId", id);
        let uploadError: string | null = null;
        try {
          const up = await fetch("/api/screenshots", { method: "POST", body });
          const json = (await up.json()) as { ok: boolean; error?: string };
          if (!json.ok) uploadError = json.error ?? "Không thể đọc ảnh chụp màn hình.";
        } catch {
          uploadError = "Không thể tải ảnh lên. Vui lòng thử lại.";
        }
        if (uploadError) {
          router.push("/clients/" + id);
          return;
        }
        setStage("AI đang tổng hợp PR khởi tạo v1...");
        const prRes = await createPRAction(id);
        router.push(prRes.ok ? "/pr/" + prRes.data.id : "/clients/" + id);
        return;
      }

      if (initialPrId) {
        router.push("/pr/" + initialPrId);
        return;
      }
      router.push("/clients/" + id);
    } catch {
      setError("Không thể tạo khách hàng. Vui lòng thử lại.");
      setLoading(false);
      setStage(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-[10px] border border-hairline bg-surface p-4 sm:p-6">
      <ClientFormFields idPrefix="new" defaults={defaults} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-ink">
          Ảnh chụp màn hình hội thoại ban đầu <span className="font-normal text-muted">(tùy chọn)</span>
        </span>
        {file && previewUrl ? (
          <div className="flex items-center gap-3 rounded-[10px] border border-hairline bg-ground p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Xem trước ảnh chụp màn hình" className="h-16 w-16 rounded-md border border-hairline object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{file.name || "Ảnh dán từ clipboard"}</p>
              <p className="text-xs text-muted">AI sẽ đọc ảnh này để dựng v1 ngay sau khi tạo khách.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setFile(null)} disabled={loading}>
              <X />
              Bỏ ảnh
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={loading}
            className="flex flex-col items-center gap-1 rounded-[10px] border border-dashed border-hairline bg-ground px-4 py-6 text-center text-sm text-muted transition-colors hover:border-accent hover:text-ink"
          >
            <ImagePlus className="size-5" />
            <span>Đính kèm hoặc dán (Ctrl+V) ảnh chụp màn hình hội thoại ban đầu</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      </div>

      <ErrorBanner message={error} />
      {loading && stage ? (
        <div role="status" className="rounded-[10px] border border-modify/30 bg-modify-tint px-3 py-2 text-sm font-medium text-modify">
          {stage}
        </div>
      ) : null}
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
