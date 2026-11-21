"use client";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DiffRow } from "@/components/DiffRow";
import { VersionSpine } from "@/components/VersionSpine";
import { MoneyBlock } from "@/components/MoneyBlock";
import { EvidenceQuote } from "@/components/EvidenceQuote";
import { Button } from "@/components/ui/button";

export default function Page() {
  const [sel, setSel] = useState(0);
  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-semibold">Components (dev)</h1>
      <div className="grid gap-8 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-3">
          <DiffRow kind="add" title="Đăng nhập bằng Zalo" after="Thêm đăng nhập OAuth qua Zalo cho khách hàng." delta="+8 giờ" selected={sel === 0} onSelect={() => setSel(0)} />
          <DiffRow kind="modify" title="Thanh toán trực tuyến" before="Chỉ chuyển khoản ngân hàng" after="Chuyển khoản và ví MoMo" delta="+4 giờ" selected={sel === 1} onSelect={() => setSel(1)} />
          <DiffRow kind="remove" title="Báo cáo doanh thu theo tuần" before="Xuất PDF hằng tuần" delta="−6 giờ" selected={sel === 2} onSelect={() => setSel(2)} />
          <EvidenceQuote text="Anh ơi, bên em muốn thêm đăng nhập bằng Zalo được không ạ?" author="Khách hàng" time="14:32 12/11" />
          <MoneyBlock subtotal={42000000} taxRate={0.1} />
          <div className="flex gap-3">
            <Button>Gửi PR</Button>
            <Button variant="outline">Huỷ</Button>
          </div>
        </div>
        <VersionSpine
          currentNo={3}
          openPR={{ title: "Thêm đăng nhập Zalo" }}
          versions={[
            { no: 3, note: "Rollback về v1", date: "12/11" },
            { no: 2, note: "Gộp PR #4: thanh toán MoMo", date: "05/11" },
            { no: 1, note: "Phiên bản ban đầu", date: "01/11" },
          ]}
        />
      </div>
    </AppShell>
  );
}
