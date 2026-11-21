"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { calcPriceForNet, formatVND } from "@/lib/pricing-calc";
import type { SerializablePricing } from "@/lib/types";

export function PricingPanel({ pricing }: { pricing: SerializablePricing }) {
  const [desiredRaw, setDesiredRaw] = useState("");

  const effortDelta = pricing.proposedEffort - pricing.currentEffort;
  const digits = desiredRaw.replace(/\D/g, "");
  const desiredNet = digits ? Number(digits) : 0;
  const quotePrice = calcPriceForNet(desiredNet, pricing.taxRate);

  return (
    <aside className="rounded-[10px] border border-hairline bg-surface p-5">
      <h2 className="text-base font-semibold text-ink">Gợi ý giá</h2>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Giá hợp đồng hiện tại</p>
          <p className="tabular mt-1 text-lg font-semibold text-ink">{formatVND(pricing.contractPrice)}</p>
          <p className="tabular text-sm text-muted">Thực nhận sau thuế: {formatVND(pricing.netCurrent)}</p>
        </div>

        <div className="border-t border-hairline pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Khối lượng công việc</p>
          <p className="tabular mt-1 text-sm text-ink">
            {pricing.currentEffort} điểm → {pricing.proposedEffort} điểm{" "}
            <span className={effortDelta >= 0 ? "font-semibold text-add" : "font-semibold text-remove"}>
              ({effortDelta >= 0 ? "+" : ""}
              {effortDelta} điểm)
            </span>
          </p>
          <p className="tabular text-sm text-muted">Đơn giá tham chiếu: {formatVND(pricing.unitPrice)}/điểm</p>
        </div>

        <div className="rounded-[10px] bg-add-tint p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-add">Giá đề xuất mới</p>
          <p className="tabular mt-1 text-xl font-semibold text-ink">{formatVND(pricing.suggestedPrice)}</p>
          <p className="tabular text-sm text-muted">Thực nhận sau thuế: {formatVND(pricing.netSuggested)}</p>
        </div>

        <div className="border-t border-hairline pt-4">
          <label htmlFor="desired-net" className="text-sm font-medium text-ink">
            Muốn thực nhận (VND)
          </label>
          <Input
            id="desired-net"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ví dụ: 20000000"
            value={desiredRaw}
            onChange={(e) => setDesiredRaw(e.target.value)}
            className="tabular mt-2 h-11"
          />
          {desiredNet > 0 ? (
            <p className="tabular mt-3 rounded-[10px] bg-modify-tint px-3 py-2 text-base font-semibold text-modify">
              Cần báo giá: {formatVND(quotePrice)}
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-5 text-xs text-muted">
        {`Thuế suất cấu hình được (${Math.round(pricing.taxRate * 100)}%), kiểm tra quy định hiện hành.`}
      </p>
    </aside>
  );
}
