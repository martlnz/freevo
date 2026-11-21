"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { ErrorBanner } from "./ErrorBanner";

type UploadData = {
  extractedCount: number;
  detectedBudget?: number | null;
};

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

export function ScreenshotUploader({ clientId }: { clientId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (busyRef.current) return;
      if (!file.type.startsWith("image/")) {
        setError("Chỉ hỗ trợ tệp ảnh (PNG, JPG, WEBP...).");
        return;
      }
      busyRef.current = true;
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const body = new FormData();
        body.append("file", file);
        body.append("clientId", clientId);
        const res = await fetch("/api/screenshots", { method: "POST", body });
        const json = (await res.json()) as { ok: boolean; data?: UploadData; error?: string };
        if (!json.ok || !json.data) {
          setError(json.error ?? "Không thể đọc ảnh chụp màn hình.");
          return;
        }
        const budget =
          typeof json.data.detectedBudget === "number" && json.data.detectedBudget > 0
            ? ` · Ngân sách khách nhắc tới: ${new Intl.NumberFormat("vi-VN").format(json.data.detectedBudget)} ₫`
            : "";
        setResult(`Đã tách ${json.data.extractedCount} tin nhắn từ ảnh vào hộp tin${budget}`);
        router.refresh();
      } catch {
        setError("Không thể tải ảnh lên. Vui lòng thử lại.");
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    },
    [clientId, router],
  );

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const f = imageFromClipboard(e);
      if (f) {
        e.preventDefault();
        void upload(f);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) void upload(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => !loading && fileRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !loading) {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        onPaste={(e) => {
          const f = imageFromClipboard(e);
          if (f) {
            e.preventDefault();
            e.stopPropagation();
            void upload(f);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-[10px] border border-dashed px-4 py-5 text-center text-sm transition-colors ${
          dragging ? "border-accent bg-add-tint text-ink" : "border-hairline bg-surface text-muted hover:border-accent hover:text-ink"
        }`}
      >
        <ImagePlus className="size-5" />
        {loading ? (
          <span role="status" className="font-medium text-modify">
            AI đang đọc ảnh chụp màn hình...
          </span>
        ) : (
          <span>Kéo thả, chọn tệp hoặc dán (Ctrl+V) ảnh chụp màn hình hội thoại để AI tách tin nhắn</span>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      {result ? (
        <div role="status" className="rounded-[10px] border border-add/30 bg-add-tint px-3 py-2 text-sm font-medium text-add">
          {result}
        </div>
      ) : null}
      <ErrorBanner message={error} />
    </div>
  );
}
