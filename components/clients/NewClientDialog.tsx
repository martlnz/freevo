"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createClientAction } from "@/app/actions/clients";

const field = "h-11 rounded-[10px] bg-surface px-3 text-base";

function Field({ label, name, ...p }: { label: string; name: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
      {label}
      <Input name={name} className={field} {...p} />
    </label>
  );
}

export function NewClientDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await createClientAction(fd);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      router.push(`/clients/${r.data.id}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button className="font-semibold">Thêm khách mới</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[10px] bg-surface p-6 shadow-none sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[22px] font-semibold tracking-tight">Thêm khách mới</DialogTitle>
          <DialogDescription className="text-muted">Chỉ cần tên khách. Các thông tin khác có thể bổ sung sau.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Tên khách" name="name" required autoComplete="off" />
          <Field label="Tên dự án" name="projectName" autoComplete="off" />
          <Field label="Số điện thoại" name="phone" type="tel" autoComplete="off" />
          <Field label="Email" name="emails" placeholder="Nhiều email, cách nhau bằng dấu phẩy" autoComplete="off" />
          <Field label="Giá hợp đồng (₫)" name="contractPrice" type="number" min={0} inputMode="numeric" />
          {error && <p role="alert" className="text-sm font-medium text-remove">{error}</p>}
          <DialogFooter className="m-0 mt-2 flex-row justify-end gap-3 border-0 bg-transparent p-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="submit" disabled={pending}>{pending ? "Đang tạo..." : "Tạo khách"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
